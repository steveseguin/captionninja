// https://github.com/mozilla/translate - MPL 2.0 - Mozilla
// All variables specific to translation service
var translationService;
// A map of language-pair to TranslationModel object
var translationModels = new Map();
var translationModelBuffers = new Map();
var modernEngine = false;
var engineInitialization;

const BERGAMOT_RUNTIME_BASE = new URL("thirdparty/bergamot/", self.location.href).href;
const MODEL_REGISTRY = "registry.json";
const LOCAL_MODEL_ROOT = "/models";
const REMOTE_MODEL_ROOT = "https://googlestorage.vdo.workers.dev/corsproxy/?apiurl=";
var rootURL = LOCAL_MODEL_ROOT;
let version = null;
let modelRegistry = null;

var Module;

function initializeEngine() {
  if (!engineInitialization) {
    engineInitialization = Promise.resolve().then(function () {
      importScripts(BERGAMOT_RUNTIME_BASE + "runtime-loader.js?ver=33");
      return loadBergamotRuntime(BERGAMOT_RUNTIME_BASE + "v0.6.0/", new URL("./", self.location.href).href);
    }).then(async function (engine) {
      Module = engine.module;
      modernEngine = engine.modern;
      await initModelRegistry();
      postMessage(["import_reply", modelRegistry, version]);
    });
  }
  return engineInitialization;
}

const log = (message) => {
  console.debug(message);
}

const initModelRegistry = async () => {
  const candidates = [LOCAL_MODEL_ROOT, REMOTE_MODEL_ROOT];
  let lastError = null;

  for (const candidateRoot of candidates) {
    try {
      let resp = await fetch(`${candidateRoot}/latest.txt`);
      if (!resp.ok) {
        throw Error(`Unable to fetch latest.txt from '${candidateRoot}': HTTP ${resp.status}`);
      }
      const candidateVersion = (await resp.text()).trim();
      if (!candidateVersion) {
        throw Error(`Version file from '${candidateRoot}' is empty`);
      }

      resp = await fetch(`${candidateRoot}/${candidateVersion}/${MODEL_REGISTRY}`);
      if (!resp.ok) {
        throw Error(`Unable to fetch registry.json from '${candidateRoot}': HTTP ${resp.status}`);
      }

      const candidateRegistry = await resp.json();
      rootURL = candidateRoot;
      version = candidateVersion;
      modelRegistry = candidateRegistry;

      if (candidateRoot === LOCAL_MODEL_ROOT) {
        log(`Using local model root '${LOCAL_MODEL_ROOT}' (version ${version})`);
      } else {
        console.warn(`Local models unavailable; falling back to remote model root '${REMOTE_MODEL_ROOT}' (version ${version})`);
      }
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Model root '${candidateRoot}' init failed: ${error.message}`);
    }
  }

  throw lastError || Error("Unable to initialize model registry");
}

const isExprimental = (from, to) => {
  return `${from}${to}` in modelRegistry && modelRegistry[`${from}${to}`]["model"].modelType === "dev"
}

// Keep import, model loading and captions in order while the model downloads.
var translationTasks = Promise.resolve();
onmessage = function(e) {
  translationTasks = translationTasks.then(function () {
    return handleTranslationMessage(e);
  }).catch(function (error) {
    console.error("Translation worker failed:", error);
  });
};

async function handleTranslationMessage(e) {
  const command = e.data[0];
  log(`Message '${command}' received from main script`);
  let result = "";
  if (command === 'import') {
      await initializeEngine();
  } else if (command === 'load_model') {
      let start = Date.now();
      let from = e.data[1];
      let to = e.data[2];
      try {
        await constructTranslationService();
        await constructTranslationModel(from, to);
        log(`Model '${from}${to}' successfully constructed. Time taken: ${(Date.now() - start) / 1000} secs`);
        result = "Model successfully loaded";
        if (isExprimental(from, to) || isExprimental(from, 'en') || isExprimental('en', to)) {
          result +=  ". This model is experimental"
        }
      } catch (error) {
        log(`Model '${from}${to}' construction failed: '${error.message}'`);
        result = "Model loading failed";
      }
      log(`'${command}' command done, Posting message back to main script`); 
      postMessage([`${command}_reply`, result]);
  } else if (command === 'translate') {
      const from = e.data[1];
      const to = e.data[2];
      const inputParagraphs = e.data[3];
	  const meta = e.data[4] || null;
	  const interm = e.data[5] || false;
	  
      let inputWordCount = 0;
      inputParagraphs.forEach(sentence => {
        inputWordCount += sentence.trim().split(" ").filter(word => word.trim() !== "").length;
      })
      let start = Date.now();
      try {
        result = translate(from, to, inputParagraphs);
        //const secs = (Date.now() - start) / 1000;
        //log(`Translation '${from}${to}' Successful. Speed: ${Math.round(inputWordCount / secs)} WPS (${inputWordCount} words in ${secs} secs)`);
      } catch (error) {
        log(`Error: ${error.message}`);
      }
     // log(`'${command}' command done, Posting message back to main script`);
      postMessage([`${command}_reply`, result, meta, interm ]);
  }
}

const getRemoteFallbackURL = (url) => {
  const localPrefix = `${LOCAL_MODEL_ROOT}/`;
  if (rootURL !== LOCAL_MODEL_ROOT || !url.startsWith(localPrefix)) {
    return null;
  }
  return `${REMOTE_MODEL_ROOT}${url.slice(LOCAL_MODEL_ROOT.length)}`;
}

// This function downloads file from a url and returns the array buffer
const downloadAsArrayBuffer = async(url, asset) => {
  let cache = null;
  try {
    cache = await caches.open("caption-translation-models-v1");
    const cached = await cache.match(url);
    if (cached) {
      const buffer = await cached.arrayBuffer();
      if (await verifyModelBuffer(buffer, asset)) return buffer;
      await cache.delete(url);
    }
  } catch (_) {}

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let buffer;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw Error(`Downloading ${url} failed: HTTP ${response.status} - ${response.statusText}`);
    }
    buffer = await response.arrayBuffer();
  } catch (primaryError) {
    const fallbackURL = getRemoteFallbackURL(url);
    if (!fallbackURL) {
      throw primaryError;
    }

    console.warn(`Local model asset unavailable; retrying via remote proxy: ${url}`);
    const fallbackResponse = await fetch(fallbackURL, { signal: controller.signal });
    if (!fallbackResponse.ok) {
      throw Error(`Downloading ${url} failed locally and remote fallback failed (${fallbackURL}): HTTP ${fallbackResponse.status} - ${fallbackResponse.statusText}`);
    }
    buffer = await fallbackResponse.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }

  if (!await verifyModelBuffer(buffer, asset)) throw Error(`Translation model verification failed: ${url}`);
  if (cache) {
    try { await cache.put(url, new Response(buffer)); } catch (_) {}
  }
  return buffer;
}

const verifyModelBuffer = async (buffer, asset) => {
  if (!asset || buffer.byteLength !== asset.size) return false;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return hash === asset.expectedSha256Hash;
}

// This function constructs and initializes the AlignedMemory from the array buffer and alignment size
const prepareAlignedMemoryFromBuffer = async (buffer, alignmentSize) => {
  var byteArray = new Int8Array(buffer);
  log(`Constructing Aligned memory. Size: ${byteArray.byteLength} bytes, Alignment: ${alignmentSize}`);
  var alignedMemory = new Module.AlignedMemory(byteArray.byteLength, alignmentSize);
  log(`Aligned memory construction done`);
  const alignedByteArrayView = alignedMemory.getByteArrayView();
  alignedByteArrayView.set(byteArray);
  log(`Aligned memory initialized`);
  return alignedMemory;
}

// Instantiate the Translation Service
const constructTranslationService = async () => {
  if (!translationService) {
    var translationServiceConfig = modernEngine ? { cacheSize: 0 } : {};
    log(`Creating Translation Service with config: ${translationServiceConfig}`);
    translationService = new Module.BlockingService(translationServiceConfig);
    log(`Translation Service created successfully`);
  }
}

const constructTranslationModel = async (from, to) => {
  // Delete all previously constructed translation models and clear the map
  translationModels.forEach((value, key) => {
    log(`Destructing model '${key}'`);
    value.delete();
    const buffers = translationModelBuffers.get(key);
    if (buffers) {
      buffers.list.delete();
      buffers.owned.forEach(memory => memory.delete());
    }
  });
  translationModels.clear();
  translationModelBuffers.clear();

  // If none of the languages is English then construct multiple models with
  // English as a pivot language.
  if (from !== 'en' && to !== 'en') {
    log(`Constructing model '${from}${to}' via pivoting: '${from}en' and 'en${to}'`);
    await Promise.all([constructTranslationModelInvolvingEnglish(from, 'en'),
                        constructTranslationModelInvolvingEnglish('en', to)]);
  }
  else {
    log(`Constructing model '${from}${to}'`);
    await constructTranslationModelInvolvingEnglish(from, to);
  }
}

const constructTranslationModelInvolvingEnglish = async (from, to) => {
  const languagePair = `${from}${to}`;

  /*Set the Model Configuration as YAML formatted string.
    For available configuration options, please check: https://marian-nmt.github.io/docs/cmd/marian-decoder/
    Vocab files are re-used in both translation directions for some models
    const vocabLanguagePair = from === "en" ? `${to}${from}` : languagePair;
    const modelConfig = `models:
      - /${languagePair}/model.${languagePair}.intgemm.alphas.bin
      vocabs:
      - /${languagePair}/vocab.${vocabLanguagePair}.spm
      - /${languagePair}/vocab.${vocabLanguagePair}.spm
      beam-size: 1
      normalize: 1.0
      word-penalty: 0
      max-length-break: 128
      mini-batch-words: 1024
      workspace: 128
      max-length-factor: 2.0
      skip-cost: true
      cpu-threads: 0
      quiet: true
      quiet-translation: true
      shortlist:
          - /${languagePair}/lex.${languagePair}.s2t
          - 50
          - 50
      `;
      */

  // TODO: gemm-precision: int8shiftAlphaAll (for the models that support this)
  // DONOT CHANGE THE SPACES BETWEEN EACH ENTRY OF CONFIG
  const modelConfig = `beam-size: 1
normalize: 1.0
word-penalty: 0
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
skip-cost: true
cpu-threads: 0
quiet: true
quiet-translation: true
gemm-precision: int8shiftAll
`;

  const commonPath = `${rootURL}/${version}/${languagePair}`
  const assets = modelRegistry[languagePair];
  const assetURL = asset => asset.url || `${commonPath}/${asset.name}`;
  const modelFile = assetURL(assets.model);
  let vocabFiles;
  const shortlistFile = assetURL(assets.lex);
  if (("srcvocab" in modelRegistry[languagePair]) && ("trgvocab" in modelRegistry[languagePair])) {
        vocabFiles = [assetURL(assets.srcvocab), assetURL(assets.trgvocab)];
  }
  else {
    vocabFiles = [assetURL(assets.vocab), assetURL(assets.vocab)];
  }
  const uniqueVocabFiles = new Set(vocabFiles);
  log(`modelFile: ${modelFile}\nshortlistFile: ${shortlistFile}\nNo. of unique vocabs: ${uniqueVocabFiles.size}`);
  uniqueVocabFiles.forEach(item => log(`unique vocabFile: ${item}`));

  // Download the files as buffers from the given urls
  let start = Date.now();
  const downloadedBuffers = await Promise.all([downloadAsArrayBuffer(modelFile, assets.model), downloadAsArrayBuffer(shortlistFile, assets.lex)]);
  const modelBuffer = downloadedBuffers[0];
  const shortListBuffer = downloadedBuffers[1];

  const downloadedVocabBuffers = [];
  for (let item of uniqueVocabFiles.values()) {
    const asset = [assets.vocab, assets.srcvocab, assets.trgvocab].find(asset => asset && assetURL(asset) === item);
    downloadedVocabBuffers.push(await downloadAsArrayBuffer(item, asset));
  }
  log(`Total Download time for all files of '${languagePair}': ${(Date.now() - start) / 1000} secs`);

  // Construct AlignedMemory objects with downloaded buffers
  let constructedAlignedMemories = await Promise.all([prepareAlignedMemoryFromBuffer(modelBuffer, 256),
                                                      prepareAlignedMemoryFromBuffer(shortListBuffer, 64)]);
  let alignedModelMemory = constructedAlignedMemories[0];
  let alignedShortlistMemory = constructedAlignedMemories[1];
  let alignedVocabsMemoryList = new Module.AlignedMemoryList;
  const owned = [alignedModelMemory, alignedShortlistMemory];
  for(let item of downloadedVocabBuffers) {
    let alignedMemory = await prepareAlignedMemoryFromBuffer(item, 64);
    owned.push(alignedMemory);
    alignedVocabsMemoryList.push_back(alignedMemory);
  }

  log(`Aligned model memory size: ${alignedModelMemory.size()}`);
  log(`Aligned shortlist memory size: ${alignedShortlistMemory.size()}`);

  log(`Translation Model config: ${modelConfig}`);
  try {
    const translationModel = modernEngine
      ? new Module.TranslationModel(from.replace(/_/g, "-"), to.replace(/_/g, "-"), modelConfig, alignedModelMemory, alignedShortlistMemory, alignedVocabsMemoryList, null)
      : new Module.TranslationModel(modelConfig, alignedModelMemory, alignedShortlistMemory, alignedVocabsMemoryList);
    translationModels.set(languagePair, translationModel);
    translationModelBuffers.set(languagePair, { list: alignedVocabsMemoryList, owned });
  } catch (error) {
    alignedVocabsMemoryList.delete();
    owned.forEach(memory => memory.delete());
    throw error;
  }
}

const translate = (from, to, paragraphs) => {
  // If none of the languages is English then perform translation with
  // English as a pivot language.
  if (from !== 'en' && to !== 'en') {
    log(`Translating '${from}${to}' via pivoting: '${from}en' -> 'en${to}'`);
    let translatedParagraphsInEnglish = translateInvolvingEnglish(from, 'en', paragraphs);
    return translateInvolvingEnglish('en', to, translatedParagraphsInEnglish);
  }
  else {
    log(`Translating '${from}${to}'`);
    return translateInvolvingEnglish(from, to, paragraphs);
  }
}

const translateInvolvingEnglish = (from, to, paragraphs) => {
  const languagePair = `${from}${to}`;
  if (!translationModels.has(languagePair)) {
    throw Error(`Please load translation model '${languagePair}' before translating`);
  }
  const translationModel = translationModels.get(languagePair);
  const responseOptions = modernEngine ? new Module.VectorResponseOptions() : new Module.ResponseOptions();
  const input = new Module.VectorString();
  let result;
  try {
    paragraphs.forEach(paragraph => {
      if (!paragraph.trim()) return;
      input.push_back(paragraph.trim());
      if (modernEngine) responseOptions.push_back({ qualityScores: false, alignment: false, html: false });
    });
    result = translationService.translate(translationModel, input, responseOptions);
    const translatedParagraphs = [];
    for (let i = 0; i < result.size(); i++) {
      const response = result.get(i);
      try { translatedParagraphs.push(response.getTranslatedText()); }
      finally { response.delete(); }
    }
    return translatedParagraphs;
  } finally {
    if (result) result.delete();
    responseOptions.delete();
    input.delete();
  }
}
