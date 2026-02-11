(function(global) {
  'use strict';

  const DEFAULTS = {
    googleTranslate: 'https://www.googleapis.com/language/translate/v2/',
    googleLanguages: 'https://www.googleapis.com/language/translate/v2/languages',
    openAIBase: 'https://api.openai.com/v1',
    ollamaBase: 'http://127.0.0.1:11434/v1',
    anthropicMessages: 'https://api.anthropic.com/v1/messages',
    openAIModel: 'gpt-4o-mini',
    ollamaModel: 'llama3.1',
    anthropicModel: 'claude-3-5-haiku-latest'
  };

  const PROVIDER_ALIASES = {
    google: 'google',
    gcloud: 'google',
    local: 'local',
    bergamot: 'local',
    openai: 'openai_compat',
    openai_compat: 'openai_compat',
    'openai-compatible': 'openai_compat',
    ollama: 'openai_compat',
    vllm: 'openai_compat',
    lmstudio: 'openai_compat',
    localai: 'openai_compat',
    anthropic: 'anthropic',
    claude: 'anthropic'
  };

  function safeString(value) {
    return (typeof value === 'string') ? value.trim() : '';
  }

  function getParam(urlParams, names) {
    for (const name of names) {
      const value = urlParams.get(name);
      if (typeof value === 'string' && value.length) {
        return value;
      }
    }
    return '';
  }

  function normalizeProviderName(value) {
    const lowered = safeString(value).toLowerCase();
    if (!lowered) {
      return '';
    }
    return PROVIDER_ALIASES[lowered] || lowered;
  }

  function normalizeLangCode(value, preserveAuto) {
    const input = safeString(value);
    if (!input) {
      return '';
    }
    if (preserveAuto && input.toLowerCase() === 'auto') {
      return 'auto';
    }
    const normalized = input.replace(/_/g, '-');
    const parts = normalized.split('-').filter(Boolean);
    if (!parts.length) {
      return '';
    }
    return parts.map(function(part, index) {
      if (index === 0) {
        return part.toLowerCase();
      }
      if (part.length === 4) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      if (part.length === 2 || part.length === 3) {
        return part.toUpperCase();
      }
      return part.toLowerCase();
    }).join('-');
  }

  function normalizeBaseUrl(value) {
    const raw = safeString(value);
    return raw.replace(/\/+$/, '');
  }

  function parseTimeoutMs(urlParams, fallbackMs) {
    const raw = parseInt(urlParams.get('ttimeout') || '', 10);
    if (!Number.isFinite(raw) || raw <= 0) {
      return fallbackMs;
    }
    return Math.min(raw, 20000);
  }

  function appendQuery(url, params) {
    return url + (url.includes('?') ? '&' : '?') + params.toString();
  }

  function resolveOpenAIEndpoint(baseUrl, endpointPath) {
    const base = normalizeBaseUrl(baseUrl || DEFAULTS.openAIBase);
    if (!base) {
      return DEFAULTS.openAIBase + '/' + endpointPath;
    }
    if (base.endsWith('/' + endpointPath)) {
      return base;
    }
    if (/\/v1\/(chat\/completions|responses)$/i.test(base)) {
      return base.replace(/\/(chat\/completions|responses)$/i, '/' + endpointPath);
    }
    if (/\/v1$/i.test(base)) {
      return base + '/' + endpointPath;
    }
    return base + '/v1/' + endpointPath;
  }

  function resolveAnthropicEndpoint(baseUrl) {
    const base = normalizeBaseUrl(baseUrl || DEFAULTS.anthropicMessages);
    if (!base) {
      return DEFAULTS.anthropicMessages;
    }
    if (/\/v1\/messages$/i.test(base)) {
      return base;
    }
    if (/\/v1$/i.test(base)) {
      return base + '/messages';
    }
    return base + '/v1/messages';
  }

  function resolveGoogleTranslateEndpoint(baseUrl) {
    return safeString(baseUrl) || DEFAULTS.googleTranslate;
  }

  function resolveGoogleLanguagesEndpoint(baseUrl) {
    if (!baseUrl) {
      return DEFAULTS.googleLanguages;
    }
    const cleaned = normalizeBaseUrl(baseUrl);
    if (/\/languages$/i.test(cleaned)) {
      return cleaned;
    }
    if (/\/v2$/i.test(cleaned)) {
      return cleaned + '/languages';
    }
    if (/\/v2\/translate$/i.test(cleaned)) {
      return cleaned.replace(/\/translate$/i, '/languages');
    }
    if (/\/translate$/i.test(cleaned)) {
      return cleaned.replace(/\/translate$/i, '/languages');
    }
    return cleaned + '/languages';
  }

  function extractErrorMessage(data, fallbackMessage) {
    if (data && typeof data === 'object') {
      if (data.error && typeof data.error.message === 'string') {
        return data.error.message;
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
      if (Array.isArray(data.errors) && data.errors.length && typeof data.errors[0].message === 'string') {
        return data.errors[0].message;
      }
    }
    return fallbackMessage;
  }

  async function throwHttpError(provider, response) {
    let data = null;
    let fallback = provider + ' request failed with HTTP ' + response.status;
    try {
      data = await response.json();
      fallback = extractErrorMessage(data, fallback);
    } catch (err) {
      try {
        const text = await response.text();
        if (text) {
          fallback = text.substring(0, 300);
        }
      } catch (e) {
        // ignore
      }
    }
    const error = new Error(fallback);
    error.provider = provider;
    error.status = response.status;
    error.response = data;
    throw error;
  }

  function extractMessageContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map(item => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item.text === 'string') {
          return item.text;
        }
        if (item && item.type === 'text' && typeof item.text === 'string') {
          return item.text;
        }
        if (item && item.type === 'output_text' && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      }).join('');
    }
    return '';
  }

  function extractOpenAIText(data) {
    if (data && typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text.trim();
    }

    const firstChoice = data && data.choices && data.choices[0];
    if (firstChoice) {
      if (typeof firstChoice.text === 'string' && firstChoice.text.trim()) {
        return firstChoice.text.trim();
      }
      const choiceContent = extractMessageContent(firstChoice.message && firstChoice.message.content);
      if (choiceContent.trim()) {
        return choiceContent.trim();
      }
    }

    if (Array.isArray(data && data.output)) {
      const chunks = [];
      for (const item of data.output) {
        const chunk = extractMessageContent(item && item.content);
        if (chunk) {
          chunks.push(chunk);
        }
      }
      if (chunks.length) {
        return chunks.join('\n').trim();
      }
    }

    return '';
  }

  function extractAnthropicText(data) {
    if (!Array.isArray(data && data.content)) {
      return '';
    }
    const text = data.content.map(item => {
      if (item && typeof item.text === 'string') {
        return item.text;
      }
      return '';
    }).join('');
    return text.trim();
  }

  function buildPrompt(sourceLang, targetLang, useAutoDetect) {
    const normalizedSource = normalizeLangCode(sourceLang, true);
    const normalizedTarget = normalizeLangCode(targetLang, true) || 'en';
    const sourceHint = (useAutoDetect || normalizedSource === 'auto' || !normalizedSource)
      ? 'auto-detected source language'
      : 'source language code "' + normalizedSource + '"';

    return [
      'You are a translation engine.',
      'Translate the provided text from ' + sourceHint + ' to target language code "' + normalizedTarget + '".',
      'Return only the translated text.',
      'Preserve meaning, punctuation, and line breaks.',
      'Do not add explanations, notes, or quotes.'
    ].join(' ');
  }

  function buildCacheKey(config, text, sourceLang, targetLang, useAutoDetect) {
    const provider = config.forceLocal ? 'local' : config.provider;
    const source = normalizeLangCode(sourceLang, true) || '';
    const target = normalizeLangCode(targetLang, true) || '';
    const mode = useAutoDetect ? 'auto' : source;
    const endpoint = safeString(config.endpoint || '');
    const model = safeString(config.model || '');
    return [provider, endpoint, model, mode, target, text].join('|');
  }

  function resolveConfig(urlParams, overrides) {
    const options = overrides || {};
    const googleKeyInput = safeString(options.googleApiKey || getParam(urlParams, ['googlekey', 'gkey']));
    const providerInput = safeString(options.provider || getParam(urlParams, ['tprovider', 'provider', 'translateprovider']));
    const providerHint = normalizeProviderName(providerInput);
    const forceLocal = options.forceLocal !== undefined ? Boolean(options.forceLocal) : urlParams.has('forcelocal');

    let provider = providerHint;
    if (!provider) {
      if (googleKeyInput) {
        provider = 'google';
      } else if (safeString(options.endpoint || getParam(urlParams, ['turl', 'translateurl']))) {
        provider = 'openai_compat';
      } else {
        provider = 'local';
      }
    }

    const endpoint = safeString(options.endpoint || getParam(urlParams, ['turl', 'translateurl']));
    const genericApiKey = safeString(options.apiKey || getParam(urlParams, ['tkey', 'translatekey']));
    const apiKey = safeString(genericApiKey || (provider === 'google' ? googleKeyInput : ''));
    const googleApiKey = safeString(provider === 'google' ? (googleKeyInput || apiKey) : googleKeyInput);
    const model = safeString(options.model || getParam(urlParams, ['tmodel', 'translatemodel']));

    const autoDetectFromParam = (safeString(urlParams.get('fromlang')).toLowerCase() === 'auto');
    const autoDetect = options.autoDetect !== undefined
      ? Boolean(options.autoDetect)
      : (urlParams.has('autodetect') || autoDetectFromParam);

    const timeoutMs = options.timeoutMs || parseTimeoutMs(urlParams, 6000);

    let resolvedEndpoint = endpoint;
    let resolvedModel = model;

    if (provider === 'openai_compat') {
      if (!resolvedEndpoint) {
        resolvedEndpoint = (providerInput.toLowerCase() === 'ollama')
          ? DEFAULTS.ollamaBase
          : DEFAULTS.openAIBase;
      }
      if (!resolvedModel) {
        resolvedModel = (providerInput.toLowerCase() === 'ollama')
          ? DEFAULTS.ollamaModel
          : DEFAULTS.openAIModel;
      }
    } else if (provider === 'anthropic') {
      if (!resolvedEndpoint) {
        resolvedEndpoint = DEFAULTS.anthropicMessages;
      }
      if (!resolvedModel) {
        resolvedModel = DEFAULTS.anthropicModel;
      }
    } else if (provider === 'google') {
      if (!resolvedEndpoint) {
        resolvedEndpoint = DEFAULTS.googleTranslate;
      }
    }

    return {
      provider,
      providerHint: providerInput || provider,
      endpoint: resolvedEndpoint,
      apiKey,
      model: resolvedModel,
      googleApiKey,
      forceLocal,
      autoDetect,
      timeoutMs
    };
  }

  async function translateWithGoogle(config, text, sourceLang, targetLang, options) {
    const apiKey = safeString(config.apiKey || config.googleApiKey);
    if (!apiKey) {
      throw new Error('Google translation requires an API key. Set googlekey, gkey, or tkey.');
    }

    const useAutoDetect = Boolean(config.autoDetect || normalizeLangCode(sourceLang, true) === 'auto');
    const target = normalizeLangCode(targetLang, true);
    const source = normalizeLangCode(sourceLang, true);

    if (!target) {
      throw new Error('Target language is required for translation.');
    }

    const params = new URLSearchParams();
    params.set('key', apiKey);
    params.set('q', text);
    params.set('target', target);
    if (!useAutoDetect && source && source !== 'auto') {
      params.set('source', source);
    }

    const translateEndpoint = resolveGoogleTranslateEndpoint(config.endpoint);
    const url = appendQuery(translateEndpoint, params);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      signal: options && options.signal
    });

    if (!response.ok) {
      await throwHttpError('google', response);
    }

    const data = await response.json();
    const translationData = data && data.data && data.data.translations && data.data.translations[0];
    if (!translationData || typeof translationData.translatedText !== 'string') {
      throw new Error('Invalid response format from Google translation service.');
    }

    return {
      provider: 'google',
      translatedText: translationData.translatedText,
      detectedSourceLanguage: translationData.detectedSourceLanguage || null,
      raw: data
    };
  }

  async function translateWithOpenAIChat(config, text, sourceLang, targetLang, options) {
    const endpoint = resolveOpenAIEndpoint(config.endpoint, 'chat/completions');
    const prompt = buildPrompt(sourceLang, targetLang, config.autoDetect);
    const model = safeString(config.model) || DEFAULTS.openAIModel;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (config.apiKey) {
      headers.Authorization = 'Bearer ' + config.apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: text
          }
        ]
      }),
      signal: options && options.signal
    });

    if (!response.ok) {
      await throwHttpError('openai_compat', response);
    }

    const data = await response.json();
    const translatedText = extractOpenAIText(data);
    if (!translatedText) {
      throw new Error('Invalid response format from OpenAI-compatible translation service.');
    }

    return {
      provider: 'openai_compat',
      translatedText,
      detectedSourceLanguage: null,
      raw: data
    };
  }

  async function translateWithOpenAIResponses(config, text, sourceLang, targetLang, options) {
    const endpoint = resolveOpenAIEndpoint(config.endpoint, 'responses');
    const prompt = buildPrompt(sourceLang, targetLang, config.autoDetect);
    const model = safeString(config.model) || DEFAULTS.openAIModel;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (config.apiKey) {
      headers.Authorization = 'Bearer ' + config.apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        input: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: text
          }
        ]
      }),
      signal: options && options.signal
    });

    if (!response.ok) {
      await throwHttpError('openai_compat', response);
    }

    const data = await response.json();
    const translatedText = extractOpenAIText(data);
    if (!translatedText) {
      throw new Error('Invalid response format from OpenAI responses API.');
    }

    return {
      provider: 'openai_compat',
      translatedText,
      detectedSourceLanguage: null,
      raw: data
    };
  }

  async function translateWithOpenAICompat(config, text, sourceLang, targetLang, options) {
    try {
      return await translateWithOpenAIChat(config, text, sourceLang, targetLang, options);
    } catch (error) {
      if (error && Number(error.status) === 404) {
        return translateWithOpenAIResponses(config, text, sourceLang, targetLang, options);
      }
      throw error;
    }
  }

  async function translateWithAnthropic(config, text, sourceLang, targetLang, options) {
    if (!config.apiKey) {
      throw new Error('Anthropic translation requires tkey or translatekey.');
    }

    const endpoint = resolveAnthropicEndpoint(config.endpoint);
    const prompt = buildPrompt(sourceLang, targetLang, config.autoDetect);
    const model = safeString(config.model) || DEFAULTS.anthropicModel;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0,
        system: prompt,
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      }),
      signal: options && options.signal
    });

    if (!response.ok) {
      await throwHttpError('anthropic', response);
    }

    const data = await response.json();
    const translatedText = extractAnthropicText(data);
    if (!translatedText) {
      throw new Error('Invalid response format from Anthropic translation service.');
    }

    return {
      provider: 'anthropic',
      translatedText,
      detectedSourceLanguage: null,
      raw: data
    };
  }

  async function translateText(config, text, sourceLang, targetLang, options) {
    const input = (typeof text === 'string') ? text : '';
    if (!input.trim()) {
      return null;
    }

    const provider = (config.forceLocal ? 'local' : config.provider);
    if (provider === 'local') {
      return null;
    }

    if (provider === 'google') {
      return translateWithGoogle(config, input, sourceLang, targetLang, options || {});
    }

    if (provider === 'openai_compat') {
      return translateWithOpenAICompat(config, input, sourceLang, targetLang, options || {});
    }

    if (provider === 'anthropic') {
      return translateWithAnthropic(config, input, sourceLang, targetLang, options || {});
    }

    throw new Error('Unsupported translation provider: ' + provider);
  }

  async function fetchLanguages(config, options) {
    const provider = (config.forceLocal ? 'local' : config.provider);
    if (provider !== 'google') {
      return null;
    }

    const apiKey = safeString(config.apiKey || config.googleApiKey);
    if (!apiKey) {
      return null;
    }

    const endpoint = resolveGoogleLanguagesEndpoint(config.endpoint);
    const url = appendQuery(endpoint, new URLSearchParams({ key: apiKey }));

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      signal: options && options.signal
    });

    if (!response.ok) {
      await throwHttpError('google', response);
    }

    const data = await response.json();
    if (!data || !data.data || !Array.isArray(data.data.languages)) {
      throw new Error('Invalid language list response from Google translation service.');
    }
    return data.data.languages;
  }

  function canUseRemoteProvider(config) {
    return !config.forceLocal && config.provider !== 'local';
  }

  global.CaptionTranslationProviders = {
    resolveConfig,
    normalizeProviderName,
    normalizeLangCode,
    translateText,
    fetchLanguages,
    buildCacheKey,
    canUseRemoteProvider,
    defaults: DEFAULTS
  };
})(window);
