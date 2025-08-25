# Enhanced Overlay with Google Translation Support

This enhanced version of overlay.html adds Google Cloud Translation API support while maintaining full backward compatibility with existing setups.

## New Features

### 1. Google Translation Support
- Add `googlekey=YOUR_API_KEY` or `gkey=YOUR_API_KEY` to enable Google Translation
- Automatically uses Google when API key is provided (unless forced to local)
- Falls back to local translation if Google fails
- Includes translation caching to reduce API costs

### 2. Context-Aware Translation
- Add `context=1` or `fullcontext=1` to enable contextual translation
- `contextsize=N` - Number of previous messages to include for context (default: 2)
- Improves translation accuracy for conversations

### 3. Additional Parameters
- `forcelocal=1` - Force local translation even when Google API key is provided
- `fromlang=XX` - Override source language detection (e.g., `fromlang=es`)

## Examples

### Basic Google Translation
```
overlay.html?room=abc123&translate=es&googlekey=YOUR_API_KEY
```

### Context-Aware Translation
```
overlay.html?room=abc123&translate=fr&googlekey=YOUR_API_KEY&context=1
```

### Multiple Language Overlays
Open multiple browser windows/tabs with different target languages:
- Window 1: `overlay.html?room=abc123&translate=es&googlekey=KEY`
- Window 2: `overlay.html?room=abc123&translate=fr&googlekey=KEY`
- Window 3: `overlay.html?room=abc123&translate=de&googlekey=KEY`

### Force Local Translation
```
overlay.html?room=abc123&translate=es&googlekey=KEY&forcelocal=1
```

## Backward Compatibility

All existing URLs continue to work without any changes:
- `overlay.html?room=abc&translate=es` - Uses local translation (Mozilla Bergamot)
- `overlay.html?room=abc&lang=fr` - Same as translate
- `overlay.html?room=abc&ln=de` - Same as translate

## Implementation Details

### Translation Priority
1. If `googlekey` is provided and `forcelocal` is not set → Use Google Translation
2. Otherwise → Use local Mozilla Bergamot translation

### Context Management
- Stores recent messages in memory (not persistent)
- Combines messages for better translation context
- Only activated when `context=1` parameter is present

### Caching
- Google translations are cached for 24 hours
- Reduces API calls and costs
- Cache is cleared periodically

### Error Handling
- Graceful fallback to local translation if Google fails
- Status messages displayed for debugging
- WebSocket reconnection with exponential backoff