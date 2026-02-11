# Enhanced Overlay with Multi-Provider Translation Support

This enhanced overlay supports local Mozilla Bergamot translation plus remote providers (Google, OpenAI-compatible endpoints, and Anthropic) while maintaining backward compatibility with existing URLs.

## Features

### 1. Remote Translation Providers
- `googlekey=YOUR_API_KEY` or `gkey=YOUR_API_KEY` keeps existing Google Cloud behavior.
- `tprovider=openai` supports OpenAI-compatible APIs (OpenAI, Ollama OpenAI mode, vLLM, local proxies).
- `tprovider=anthropic` uses Anthropic's native Messages API.
- `forcelocal=1` forces local Bergamot translation even when a remote provider is configured.

### 2. Context-Aware Translation
- Add `context=1` or `fullcontext=1` to enable contextual translation.
- `contextsize=N` sets number of previous messages to include (default: `2`).

### 3. Auto-Detect Source Language
- Add `fromlang=auto` or `autodetect` to enable auto-detection.
- Auto-detect requires a remote provider.
- Local Bergamot translation does not support auto-detect.

### 4. Additional Translation Parameters
- `tprovider=google|openai|anthropic|ollama|local`
- `turl=https://your-endpoint.example` (custom base URL for remote providers)
- `tmodel=MODEL_NAME` (model id for OpenAI-compatible/Anthropic providers)
- `tkey=API_KEY` or `translatekey=API_KEY`
- `fromlang=XX` to set source language manually (for non-auto mode)

### 5. Existing Overlay Parameters
- `intermclear=1` clears finished captions while interim text streams.
- `dual=1` (or `view=dual`) shows translated text above original text.

## Examples

### Google Cloud (Backward Compatible)
```
overlay.html?room=abc123&translate=es&googlekey=YOUR_API_KEY
```

### OpenAI-Compatible Endpoint
```
overlay.html?room=abc123&translate=es&tprovider=openai&tmodel=gpt-4o-mini&tkey=YOUR_KEY
```

### Anthropic Native Endpoint
```
overlay.html?room=abc123&translate=es&tprovider=anthropic&tmodel=claude-3-5-haiku-latest&tkey=YOUR_KEY
```

### Ollama (OpenAI-Compatible)
```
overlay.html?room=abc123&translate=es&tprovider=ollama&turl=http://127.0.0.1:11434/v1&tmodel=llama3.1
```

### Force Local Translation
```
overlay.html?room=abc123&translate=es&googlekey=KEY&forcelocal=1
```

## Backward Compatibility

All existing URLs continue to work:
- `overlay.html?room=abc&translate=es` uses local translation.
- `overlay.html?room=abc&translate=es&googlekey=KEY` uses Google translation.
- `overlay.html?room=abc&lang=fr` and `overlay.html?room=abc&ln=de` remain aliases.

## Translation Priority

1. If `forcelocal=1` -> use local Bergamot.
2. Else if remote provider is configured (`googlekey` or `tprovider`) -> use remote provider.
3. Else -> use local Bergamot.

## Notes

- Remote responses are cached for 24 hours to reduce duplicate calls.
- Auto-detect errors or provider failures surface in overlay status/console.
- If the remote provider is unreachable and local mode is active, local translation continues to work.
