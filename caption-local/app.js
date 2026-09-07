'use strict';
const streamId = crypto.randomUUID();
const $ = id => document.getElementById(id);
const captureAssetBase = new URL('.', document.currentScript.src);
if ($('relayAddress') && window.CaptionRelay) {
  $('relayAddress').value = window.CaptionRelay.url();
  const relayParams = new URLSearchParams(location.search);
  if (relayParams.has('room')) $('room').value = relayParams.get('room');
  if (relayParams.has('output')) $('reviewRoom').value = relayParams.get('output');
  if (captureAssetBase.pathname !== '/static/') $('captionSite').value = new URL('.', location.href).href;
}
let serviceToken = '';
function serviceFetch(path, options = {}) {
  if (window.captionLocalConnection) return window.captionLocalConnection.fetch(path, options);
  const headers = new Headers(options.headers || {});
  if (serviceToken) headers.set('Authorization', `Bearer ${serviceToken}`);
  return fetch(path, {...options, headers});
}
$('auth').onsubmit = event => {
  event.preventDefault(); serviceToken = $('accessToken').value.trim();
  $('accessToken').value = ''; health();
};
let stream, context, node, source, publisher, wakeLock;
let running = false, starting = false, stopping = false, processing = false, failed = false;
let ready = false, supportedModes = [], multilingual = false, buffer = new CaptureBuffer();
let pending = null, transcript = [], stopPromise = null, stopAck = null;
let counter = Date.now(), activeLanguage = 'en', activeMode = 'transcribe', activeRelayOutput = 'transcript';
let currentRequestStarted = 0, availableLanguages = "";
function fail(message) { $('error').textContent = message; }
function controls() {
  const busy = running || starting || stopping || processing || failed;
  window.captionLocalConnection?.setBusy(busy);
  if ($('relayTarget')) $('relayTarget').disabled = busy;
  for (const id of ['relayAddress', 'captionSite', 'relayToken', 'reviewRoom']) if ($(id)) $(id).disabled = busy || $('share').checked;
  for (const id of ['language', 'microphone', 'room', 'mode', 'relayOutput', 'sensitivity', 'captionInterval']) $(id).disabled = busy;
  // Operators may always turn sharing off. Turning it back on requires a stopped session.
  $('share').disabled = busy && !$('share').checked;
  $('start').disabled = busy || !ready;
  $('stop').disabled = !running || stopping;
  $('retry').hidden = !failed;
  $('discard').hidden = !failed;
  $('retry').disabled = processing || stopping;
  $('discard').disabled = processing || stopping;
}
async function devices() {
  const selected = $('microphone').value;
  const list = await navigator.mediaDevices.enumerateDevices();
  $('microphone').replaceChildren(new Option('System default', ''));
  list.filter(d => d.kind === 'audioinput').forEach((d, i) => $('microphone').add(new Option(d.label || `Microphone ${i+1}`, d.deviceId)));
  if ([...$('microphone').options].some(o => o.value === selected)) $('microphone').value = selected;
}
function configureRelay() {
  publisher?.disconnect(); publisher = null; $('editorLink').hidden = true;
  if (!$('share').checked) { $('relay').textContent = 'Sharing off'; controls(); return; }
  const room = $('room').value.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(room)) {
    $('share').checked = false; fail('Enter the editor source room before enabling sharing.'); return;
  }
  let destination;
  try {
    if ($('relayAddress')) window.CaptionRelay.configure($('relayAddress').value.trim());
    const site = new URL($('captionSite')?.value.trim() || 'https://caption.ninja/');
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.search || site.hash ||
        (site.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)))
      throw new Error('Use an HTTPS caption website address, or HTTP localhost for testing.');
    if (!site.pathname.endsWith('/')) site.pathname += '/';
    const direct = $('relayTarget')?.value === 'overlay';
    destination = new URL(direct ? 'overlay.html' : 'editor.html', site);
    destination.searchParams.set('room', room);
    if (window.CaptionRelay?.custom() && !direct) {
      const output = $('reviewRoom')?.value.trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(output || '') || output === room)
        throw new Error('Enter a different configured room for the editor output.');
      destination.searchParams.set('output', output);
    }
    if (window.CaptionRelay) destination = window.CaptionRelay.link(destination);
    const publisherFactory = window.CaptionRelay?.custom() ? window.CaptionRelay.createPublisher : createWSPublisher;
    publisher = publisherFactory({room, maxQueue: 100, relayToken: $('relayToken')?.value.trim(),
    onError: message => fail('Caption relay: ' + message),
    onStats: stats => { $('relay').textContent = `Relay: ${stats.state}; queued ${stats.queueLength}; dropped ${stats.droppedCount}`; }
    });
  } catch (error) {
    $('share').checked = false; $('relay').textContent = 'Sharing off'; fail(error.message); controls(); return;
  }
  publisher.connect();
  const direct = $('relayTarget')?.value === 'overlay';
  $('editorLink').href = destination;
  $('editorLink').textContent = direct ? 'Open direct caption overlay' : 'Open caption editor';
  $('editorLink').hidden = false;
  controls();
}
$('share').onchange = configureRelay;
$('room').onchange = () => { if ($('share').checked) configureRelay(); };
if ($('relayTarget')) $('relayTarget').onchange = () => { if ($('share').checked) configureRelay(); };
function frame(audio) {
  if (!running && !stopping) return;
  $('meter').value = buffer.append(audio);
  if (buffer.length > 16000 * 30 && !stopping) {
    fail('Capture stopped because inference is falling behind. Buffered speech will finish. Use a faster model or transcription-only mode.');
    stop();
  }
  drain();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function send(snapshot) {
  const params = new URLSearchParams({language: activeLanguage, mode: activeMode,
    window:'1', final: snapshot.final ? '1' : '0', context_seconds:String(snapshot.context)});
  let error;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await serviceFetch(`/transcribe?${params}`, {
        method:'POST', headers:{'Content-Type':'application/octet-stream', 'X-Caption-Local':'1', 'X-Request-ID':snapshot.id, 'X-Stream-ID':streamId},
        body:snapshot.audio.buffer, signal:AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        error = new Error(data.detail || `Service returned HTTP ${response.status}`);
        if (![408, 429, 502, 503, 504].includes(response.status)) { error.permanent = true; throw error; }
      } else return await response.json();
    } catch (caught) { error = caught; if (error.permanent) throw error; }
    if (attempt < 3) {
      $('status').textContent = `Connection interrupted; retrying buffered speech (${attempt+1}/3)…`;
      await delay(500 * 2**attempt);
    }
  }
  throw error;
}
function renderResult(result) {
  if (!result.transcript && !result.translation) return;
  const display = activeMode === 'both' ? `${result.transcript}\nEnglish: ${result.translation}` : result.text;
  transcript.push(display);
  const line = document.createElement('div'); line.textContent = display;
  $('captions').append(line);
  while ($('captions').children.length > 6) $('captions').firstChild.remove();
  const outgoing = activeRelayOutput === 'translation' ? result.translation : result.transcript;
  if (outgoing && publisher && $('share').checked) publisher.publish({msg:true, final:outgoing,
    id:++counter, ln:activeRelayOutput === 'translation' ? 'en' : result.language});
}
async function drain() {
  if (processing || failed || stopping || starting) return;
  processing = true; controls();
  try {
    while (!failed && !stopping) {
      if (!pending) {
        pending = buffer.snapshot(!running);
        if (!pending) break;
        pending.id = crypto.randomUUID();
      }
      $('status').textContent = `Transcribing · ${(buffer.length/16000).toFixed(1)}s buffered`;
      currentRequestStarted = performance.now();
      const result = await send(pending);
      if (window.captionLocalConnection) window.captionLocalConnection.lastInference = {
        inference_seconds: result.inference_seconds, queue_seconds: result.queue_seconds || 0
      };
      buffer.commit(pending, result.committed_seconds);
      pending = null;
      renderResult(result);
      $('status').textContent = `${running ? 'Listening' : 'Stopped'} · ${result.inference_seconds}s processing + ${result.queue_seconds || 0}s queued / ${result.audio_seconds.toFixed(1)}s audio`;
    }
  } catch (error) {
    failed = true;
    $('status').textContent = 'Stopped · pending audio retained';
    fail(`${error.message}. Capture stopped. Audio is retained: use Retry pending audio or Discard pending audio.`);
    await stop();
  } finally {
    if (!running && !stopping && !failed && !pending) {
      await serviceFetch(`/streams/${streamId}`, {method:'DELETE', headers:{'X-Caption-Local':'1'},
        signal:AbortSignal.timeout(3000)}).catch(() => {});
    }
    processing = false; currentRequestStarted = 0; controls();
  }
}
async function stop() {
  if (stopPromise) return stopPromise;
  stopping = true; running = false; controls();
  stopPromise = (async () => {
    try {
      if (node && context?.state === 'running') {
        await new Promise(resolve => {
          const timer = setTimeout(() => {
            fail('The audio device did not finish cleanly; its final frame may be missing.');
            stopAck = null; resolve();
          }, 2000);
          stopAck = () => { clearTimeout(timer); stopAck = null; resolve(); };
          node.port.postMessage('stop');
        });
      }
    } finally {
      stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
      source?.disconnect(); node?.disconnect();
      if (context && context.state !== 'closed') await context.close().catch(() => {});
      await wakeLock?.release().catch(() => {}); wakeLock = null;
      stream = context = source = node = null; $('meter').value = 0;
      stopping = false; controls();
    }
  })();
  await stopPromise; stopPromise = null;
  if (!processing && !failed) await drain();
  if (!failed && !processing) $('status').textContent = 'Stopped';
}
$('stop').onclick = stop;
$('retry').onclick = async () => { failed = false; fail(''); await drain(); };
$('discard').onclick = async () => {
  buffer.reset(); pending = null; failed = false; fail('');
  // The empty drain closes our idle server session, just like a successful Stop.
  await drain();
  if (!failed) $('status').textContent = 'Stopped · pending audio discarded';
};
$('start').onclick = async () => {
  if (starting || running || processing || failed) return;
  starting = true; controls(); fail('');
  activeLanguage = $('language').value.trim().toLowerCase() || 'en';
  activeMode = $('mode').value; activeRelayOutput = $('relayOutput').value;
  buffer = new CaptureBuffer(Number($('sensitivity').value), Number($('captionInterval').value)); pending = null;
  try {
    if (!supportedModes.includes(activeMode)) throw new Error('The loaded model does not support that output mode.');
    if (!multilingual && !['en','auto'].includes(activeLanguage)) throw new Error('This model supports English only.');
    context = new AudioContext({sampleRate:16000});
    await context.resume(); // Keep the user activation before asynchronous permission prompts.
    stream = await navigator.mediaDevices.getUserMedia({audio:{
      deviceId:$('microphone').value ? {exact:$('microphone').value} : undefined,
      channelCount:1, echoCancellation:false, noiseSuppression:false, autoGainControl:false
    }});
    await devices();
    if (context.sampleRate !== 16000) throw new Error('This browser cannot capture at 16 kHz. Try Chrome or Edge.');
    await context.audioWorklet.addModule(new URL('pcm-worklet.js', captureAssetBase));
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'pcm');
    node.port.onmessage = event => { if (event.data === 'stopped') stopAck?.(); else frame(event.data); };
    source.connect(node); node.connect(context.destination);
    running = true; starting = false; controls(); $('status').textContent = 'Listening';
    stream.getTracks().forEach(track => { track.onended = () => { fail('Microphone disconnected. Finishing captured speech.'); stop(); }; });
    context.onstatechange = () => {
      if (running && context?.state === 'suspended') { fail('Audio capture was suspended by the browser. Finishing captured speech.'); stop(); }
    };
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen').catch(() => null);
  } catch (error) { fail(error.message); starting = false; await stop(); controls(); }
};
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([transcript.join('\n')], {type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = `captions-${new Date().toISOString().slice(0,19).replaceAll(':','-')}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('beforeunload', event => {
  if (running || processing || failed || (publisher?.getSnapshot().queueLength || 0)) {
    event.preventDefault(); event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => { stream?.getTracks().forEach(t => t.stop()); publisher?.disconnect(); });
function updateOutputChoice() {
  const mode = $('mode').value;
  for (const option of $('relayOutput').options) option.disabled =
    (mode === 'translate' && option.value === 'transcript') || (mode === 'transcribe' && option.value === 'translation');
  if ($('relayOutput').selectedOptions[0].disabled) $('relayOutput').value = mode === 'translate' ? 'translation' : 'transcript';
}
$('mode').onchange = updateOutputChoice; updateOutputChoice(); controls();
async function health() {
  if (window.captionLocalConnection && !window.captionLocalConnection.connected) return;
  const revision = window.captionLocalConnection?.revision;
  try {
    const response = await serviceFetch('/health', {signal:AbortSignal.timeout(5000)});
    if (revision !== window.captionLocalConnection?.revision) return;
    if (response.status === 401) {
      ready = false; $('auth').hidden = !!window.captionLocalConnection;
      $('capabilities').textContent = 'Enter the service access token to connect.';
      controls(); return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    $('auth').hidden = true;
    const info = await response.json();
    if (revision !== window.captionLocalConnection?.revision) return;
    ready = info.ready && !!navigator.mediaDevices;
    supportedModes = info.modes; multilingual = info.multilingual;
    const languages = info.languages || ['en'];
    if (availableLanguages !== languages.join(',')) {
      const previous = $('language').value;
      const names = new Intl.DisplayNames([navigator.language || 'en'], {type:'language'});
      const label = code => { try { return names.of(code); } catch (_) { return code; } };
      const options = languages.map(code => new Option(label(code), code)).sort((a,b) => a.text.localeCompare(b.text));
      $('language').replaceChildren(new Option('Detect automatically', 'auto'), ...options);
      $('language').value = languages.includes(previous) || previous === 'auto' ? previous : 'en';
      availableLanguages = languages.join(',');
    }
    for (const option of $('mode').options) option.disabled = !supportedModes.includes(option.value);
    $('capabilities').textContent = `${info.multilingual ? 'Multilingual transcription and English translation' : 'English transcription'} · ${info.model || 'Whisper'} · ${info.device} / ${info.compute_type} · ${info.running || 0} processing, ${info.pending || 0} waiting · v${info.version}`;
  } catch (_) {
    if (revision !== window.captionLocalConnection?.revision) return;
    ready = false; $('capabilities').textContent = 'Service unavailable. Checking again…';
  }
  controls();
}
if (navigator.mediaDevices) {
  devices().catch(error => fail(error.message));
  navigator.mediaDevices.addEventListener('devicechange', () => { if (!running) devices().catch(() => {}); });
} else fail('Microphone capture requires localhost or HTTPS. Use the SSH tunnel described in the deployment guide.');
health(); setInterval(health, 10000);
