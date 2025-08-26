# CAPTION.Ninja

A free-to-use captioning, transcription, and real-time translation tool for live streams, presentations, and more.

Demo video: https://www.youtube.com/watch?v=v7172QO8z6c

![image](https://user-images.githubusercontent.com/2575698/169529892-8764c5df-354c-4fad-85e5-c8ecfec4cc95.png)

## Quick Start Guide

1. Open https://caption.ninja in a supported browser (Chrome or Edge recommended)
2. Accept microphone permissions when prompted
3. Start speaking - your words will be transcribed automatically
4. Access the overlay URL (provided on the page) to display captions in OBS or other streaming software

## How It Works

CAPTION.Ninja leverages your browser's built-in speech recognition capabilities to perform real-time transcription:

1. Your browser captures audio from your default microphone (or virtual audio device)
2. Browser-based speech recognition converts the audio to text
3. The text is sent through a websocket server to any connected overlay pages
4. Overlay pages display the text with customizable formatting

The application runs entirely in your browser - no software installation required. Speech-to-text processing is handled by Google's speech recognition services (through the browser), while optional translation features use either Mozilla's free translation service or Google Cloud Translation API.

## Browser Compatibility

For best results, use **Google Chrome** or **Microsoft Edge**. These browsers provide the most reliable speech recognition services.

**Important Note**: Firefox does not currently include free speech-to-text capabilities, making it unsuitable for the main transcription page. However, Firefox can still be used for displaying the overlay page.

Some users report Chrome has issues with text truncation, so Edge may provide more consistent results.

## Setting Up for Streaming

### Basic Setup

1. Open CAPTION.Ninja in Chrome/Edge and allow microphone access
2. Copy the overlay URL provided on the page
3. Add the overlay URL as a Browser Source in OBS Studio, vMix, or similar software
4. Customize the appearance using CSS as needed (see customization section below)

### Using with Electron Capture

For desktop applications that need captions overlay, use the Electron Capture app:
https://github.com/steveseguin/electroncapture

This allows you to pin the captions on top of other applications on your desktop.

## Using Non-Microphone Audio Sources

CAPTION.Ninja uses your system's default recording device. To capture audio from other sources:

### Virtual Audio Cable Method

Using a virtual audio cable allows you to route audio from any application to CAPTION.Ninja:

1. Install a virtual audio cable solution like [VB-Audio Cable](https://www.vb-audio.com/Cable/)
2. Set the virtual cable as your default recording device in your system sound settings
3. Route audio from your desired source (media player, streaming site, etc.) to the virtual cable
4. CAPTION.Ninja will now transcribe audio from any application sending to the virtual cable

This technique works for:
- YouTube or Twitch live streams
- Audio from video files
- System sounds
- Audio from other applications like Zoom or Teams
- Game audio

The virtual audio cable acts as a bridge between your audio sources and CAPTION.Ninja, effectively turning any audio into captions.

## Translation Features

CAPTION.Ninja offers multiple ways to translate content:

### Method 1: Dedicated Translation Page

Use https://caption.ninja/translate for real-time translation capabilities:
- Select source and target languages from the dropdown menus
- Browser-based transcription + Mozilla's free translation service (17 languages)
- Optional Google Cloud Translation integration for premium results (100+ languages)
- Works with the same overlay system

Free translation languages supported: Bulgarian (bg), Czech (cs), Dutch (nl), English (en), Estonian (et), German (de), French (fr), Icelandic (is), Italian (it), Norwegian Bokmål (nb), Norwegian Nynorsk (nn), Persian (fa), Polish (pl), Portuguese (pt), Russian (ru), Spanish (es), Ukrainian (uk)

### Method 2: Multiple Language Outputs from Single Source

A more efficient approach for multiple language support:

1. Use the standard capture page (index.html) with your preferred input language
2. Create multiple overlay pages with different target languages by adding the `&translate=XX` parameter
3. Share these overlay URLs with viewers who need different languages

Example:
```
Main Capture: https://caption.ninja/?room=abc123&lang=en-US
English Overlay: https://caption.ninja/overlay?room=abc123
Spanish Overlay: https://caption.ninja/overlay?room=abc123&translate=es
French Overlay: https://caption.ninja/overlay?room=abc123&translate=fr
German Overlay: https://caption.ninja/overlay?room=abc123&translate=de
```

Benefits of this approach:
- Single transcription source with multiple translation outputs
- No need to run multiple browser tabs for different languages
- Lower resource usage on the broadcasting computer
- Viewers select their preferred language by accessing the appropriate URL
- Translation processing happens in the viewer's browser

Note: The translation quality using this method relies on the viewer's browser capabilities and may vary compared to the dedicated translation page.

### Method 3: Premium Google Translation in Overlay

For professional-quality translation with 100+ language support, use Google Cloud Translation API directly in the overlay:

```
https://caption.ninja/overlay?room=abc123&translate=ja&googlekey=YOUR_API_KEY
```

Features:
- **Context-aware translation**: Add `&context=1` for better accuracy in conversations
- **Adjustable context size**: Use `&contextsize=5` to include more previous messages
- **Force local translation**: Add `&forcelocal=1` to use Mozilla even with API key
- **Override source language**: Use `&fromlang=es` if auto-detection isn't working

Example with all features:
```
https://caption.ninja/overlay?room=abc123&translate=ko&googlekey=KEY&context=1&contextsize=3
```

This provides professional-grade translation quality while maintaining the simple overlay system.

### Translation Parameters Reference

| Parameter | Description | Example |
|-----------|-------------|---------|
| `translate=XX` or `lang=XX` or `ln=XX` | Target translation language | `&translate=es` |
| `fromlang=XX` | Override source language detection | `&fromlang=en` |
| `googlekey=KEY` or `gkey=KEY` | Google Cloud Translation API key | `&googlekey=YOUR_KEY` |
| `context=1` | Enable context-aware translation | `&context=1` |
| `contextsize=N` | Number of previous messages for context (default: 2) | `&contextsize=5` |
| `forcelocal=1` | Force Mozilla translation even with API key | `&forcelocal=1` |

For a comprehensive guide to all translation features, visit: https://caption.ninja/translation-guide.html

## TTS Integration

Caption.Ninja can read captions aloud using browser/system TTS or the tts.rocks engine (Kokoro, Piper, ElevenLabs, Google, OpenAI, etc.). Enable it via URL parameters; nothing changes by default.

- Overlay readout: `overlay.html?room=abc123&tts=en-US`
  - Built‑in providers: `&ttsprovider=google&ttskey=YOUR_KEY`, `&ttsprovider=elevenlabs&elevenlabskey=KEY&voice11=VOICE_ID`
  - Use tts.rocks engine: `&ttslib=rocks&ttsprovider=kokoro&voicekokoro=af_aoede&korospeed=1.0`
  - Optional interim streaming: `&ttsstream=1`
- Capture readout: `index.html?room=abc123&lang=en-US&tts=en-US`
- Manual readout: `manual.html?room=abc123&tts=en-US`
- Pop‑out TTS window (tts.rocks bridge): add `&ttspopout=1` to auto‑open, or go directly:
  - `tts.rocks/caption-bridge.html?room=abc123&tts=en-US&ttsprovider=kokoro`

Quick discovery (GUI):
- tts.rocks homepage now includes a “Use with Caption.Ninja” panel to generate ready‑to‑use links (Overlay, Capture, Manual, Bridge) based on your chosen engine, keys, voices, and rates.
- Voice picker and URL builder: `tts.rocks/tts.html` lists local voices and generates example URLs.

Security note: API keys in URLs are visible to anyone with the link. Prefer local/native providers when possible, or only share overlays that do not embed keys.

## Language Support

Default language is `&lang=en-US`. Change the language by adding a language code parameter.

Supported language codes: https://cloud.google.com/speech-to-text/docs/languages

## Manual Text Entry Mode

For situations where automatic transcription isn't ideal, use manual text entry:
https://caption.ninja/manual.html

This lets you type captions directly, which appear on the same overlay system.

## Customizing Appearance

### Changing Font Size and Styling

You can customize the CSS in several ways:

1. Self-host just the overlay.html file and modify it
2. Use OBS Browser Source CSS overrides
3. Use the following CSS as a starting point:

```css
.output {
    margin: 0;
    background-color: #0000;
    color: white;
    font-family: Cousine, monospace;
    font-size: 3.2em;
    line-height: 1.1em;
    letter-spacing: 0.0em;
    padding: 0em;
    text-shadow: 0.05em 0.05em 0px rgb(0 0 0);
}
```

### Using Custom Fonts

For non-standard fonts, you can use Base64 encoding:

1. Use a tool like [WOFF to Base64](https://hellogreg.github.io/woff2base/) or [Transfonter](https://transfonter.org/)
2. Find a font, like [Atari ST 8x16 System Font](https://www.dafont.com/de/atari-st-8x16-system-font.font)
3. Apply the Base64 font to your OBS browser source CSS:

```css
body { 
  background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; 
}
.output{
 font-family: "Atari ST 8x16 System Font", Cousine, monospace;
}
@font-face { 
  font-family: "Atari ST 8x16 System Font";
  font-weight: 100 900;
  font-style: normal italic;
  src: url(data:application/octet-stream;base64,AAEAAAAOAIAAAwBgRkZUTWXP4NIAAIdkAAAAHEdERUYADwAeAACHRAAAAB5PUy8yY0WLpAAAAWgAAABgY21hcJmJPykAAAPUAAAD7mN2dCAANQP1AAAHxAAAAARnYXNw//8AAwAAhzwAAAAIZ2x5Zpiad3sAAAnMAAB1NGhlYWT70........AAAwBgRkZUTWIKM=);
}
```

The base64 string will be quite long, which is normal.

![image](https://user-images.githubusercontent.com/2575698/148278546-2b0e25b8-cb31-45fa-b043-937d108db76e.png)

## Additional Features

### Adding Labels

Add `&label=xxx` to the capture page to give the outbound messages a label:
```
https://caption.ninja/?room=abc123&label=steve
```

For HTML-enabled labels, add `&html` to the overlay page:
```
https://caption.ninja/?room=abc123&label=<b>steve</b>
https://caption.ninja/overlay?room=abc123&html
```

![image](https://user-images.githubusercontent.com/2575698/168219952-827734a2-75bd-45bc-9d8d-f0d7a98fe96c.png)

### Caption Display Time

Specify how long messages stay visible with:
```
&showtime=5000
```
Time is in milliseconds. Setting to 0 will disable auto-hiding.

### Saving Transcriptions

To save the transcription:
1. Select all text (Ctrl+A)
2. Copy the selected text (Ctrl+C)
3. Paste into a text editor (Ctrl+V)

Alternatively, use the "Download transcription" button that appears during sessions.

## Capture Pages

- `index.html`: Simple, minimal capture experience. Uses your browser’s default microphone and built-in speech recognition (best in Chrome/Edge). Downloads SRT and streams to overlay.
  - Non-visual change: SRT export now computes correct start/end times (fixes duplicate timestamps). No UI changes; behavior otherwise unchanged.
- `capture-pro.html`: A newer enhanced Capture UI page with better usability and exports. Same local recognition under the hood, plus:
  - Pause-based segmentation (configurable threshold) for cleaner SRT cues
  - Smarter line wrapping for SRT/WebVTT
  - One-click downloads: SRT, WebVTT, Plain Text
  - Autosave + recovery of last session
  - Keyboard shortcuts: Space (pause/resume), Ctrl+S (download SRT), Ctrl+L (copy overlay URL), M (chapter mark)
  - Status indicators for recognition and overlay connection
  - Overlay link helper with one-click copy
  - Optional profanity masking

Notes:
- Mic device selection remains on the premium STT track; this page uses the system default microphone (same as `index.html`).
- TTS popout bridge is supported via `&ttspopout=1`.

## Self-Hosting

Self-hosting is possible for free:

1. Fork this Github repository
2. Use Github Pages to host the website
3. Modify the code as needed for custom styling, domain name, etc.

For additional privacy, deploy your own websocket server:
https://github.com/steveseguin/websocket_server/

Note: The actual voice-to-text transcriptions typically use Google cloud servers, so full self-hosting of that component isn't possible in most cases. However, some devices (like Pixel smartphones) may do on-device voice-to-text.

The Mozilla-powered translation component can be deployed from https://github.com/mozilla/translate if you want the free translation component.

## Need Support?

Free support is available at https://discord.vdo.ninja

Ask for @steve for help in the #miscellaneous or #vdo-ninja-support channels.

For email support: steve@seguin.email (support is limited and not guaranteed)

## Disclaimers

I am not responsible if this app fails to work, service violations, or whatever else. It is provided as-is without warranty or support. I do not take responsibility for any liability.

You are responsible for your own premium service API keys and fees.

Private data may be made available to Google, Microsoft, and other cloud providers, for the purpose of providing their services. Data is also sent over a hosted websocket channel, which can be publicly listened to by anyone if they know the session/room ID, but this hosted websocket server does not collect said messaging data -- it's just routed.

That said, things change, and problems occur, so you accept any risks to using this service.

## License

Fonts are provided with their own license; apache 2.0 I believe, but confirm yourself.

The free translation component is powered by Mozilla Translate; https://github.com/mozilla/translate - MPL 2.0 - Mozilla


As per CAPTION.NInja, to keep in spirit of what Mozilla has created, the code here contributed as part of this CAPTION.Ninja project is also made available as MPL 2.0.
