# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAPTION.Ninja is a free browser-based captioning, transcription, and real-time translation tool for live streams and presentations. It runs entirely client-side with no build process - pure static HTML/CSS/JavaScript.

## Development

**No build, test, or lint commands** - this is a static web project. Serve files directly via any HTTP server or open HTML files in a browser.

For local development:
```bash
# Any simple HTTP server works
python -m http.server 8000
# or
npx serve .
```

## Architecture

### Communication Pattern

All pages communicate via WebSocket (`wss://api.caption.ninja:443`) using room IDs:

1. **Capture pages** (input): Capture speech/text and broadcast to a room
2. **Overlay pages** (output): Subscribe to a room and display/translate/speak captions
3. **Room ID**: 16-char alphanumeric string stored in `localStorage['cn_room_id']`

Message format:
- Final: `{"msg": true, "final": "text", "id": counter, "label": label}`
- Interim: `{"msg": true, "interm": "partial", "id": counter}`

### Key Files

**Capture Pages (text producers):**
- `index.html` - Main capture, minimal UI, browser speech recognition
- `capture-pro.html` - Enhanced capture with SRT/WebVTT export, keyboard shortcuts, autosave
- `manual.html` - Manual text entry instead of speech
- `translate.html` / `translate_premium.html` - Capture with translation

**Overlay Pages (text display):**
- `overlay.html` - Main display overlay with optional translation/TTS
- `overlay_enhanced.html` - Enhanced overlay with Google Translation API
- `overlay_roll.html` - Credits-style scrolling overlay
- `transcript.html` - Playlist controller for pre-written scripts

**Workers & Utilities:**
- `worker.js` - Web Worker for Mozilla Bergamot translation
- `bergamot-translator-worker.js` - WASM translation module (167KB)
- `tts-integration.js` - TTS via tts.rocks (Kokoro, Piper, ElevenLabs, etc.)
- `security-utils.js` - Room ID validation and security warnings

### Translation System

Two translation backends:
1. **Mozilla Bergamot** (free, local): 17 languages, runs in Web Worker via WASM
2. **Google Cloud Translation** (premium): 100+ languages, requires API key via `&googlekey=`

### URL Parameter Configuration

All functionality is configured via URL parameters - no build-time config needed. Key parameters:
- `?room=ID` - Connect to specific room
- `?lang=en-US` - Speech recognition language
- `?translate=es` - Target translation language
- `?tts=en-US` - Enable text-to-speech
- `?label=name` - Speaker label
- `?clear` - Clear on each message
- `?showtime=5000` - Auto-hide delay (ms)
- `?maxlines=N` - Keep only N most recent lines
- `?dual=1` - Show translation + original together

## External Dependencies

No npm packages. External services:
- Google Cloud Speech-to-Text (via browser)
- Mozilla Bergamot models (GCS storage)
- Google Cloud Translation API (optional)
- tts.rocks TTS service (optional)

## Self-Hosting

Fork repo and use GitHub Pages. For private WebSocket server: https://github.com/steveseguin/websocket_server/
