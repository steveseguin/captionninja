# CAPTION.Ninja promo video

A 1:54 introduction to CAPTION.Ninja for new users. It covers what the tool is, the three-step setup, and the more advanced features.

- **Video:** [`caption-ninja-promo.mp4`](caption-ninja-promo.mp4) (1920×1080, 30 fps, H.264 + AAC, about -14 LUFS)
- **30-second teaser:** [`caption-ninja-teaser-30s.mp4`](caption-ninja-teaser-30s.mp4), the opening spliced onto the call to action, for social posts
- **Thumbnail:** [`poster.jpg`](poster.jpg)
- **Live version:** open [`index.html`](index.html) (on the site: `caption.ninja/promo/`). It is the same animation, played in the browser with the soundtrack.

The video has no voiceover. Every word is on screen as a caption, so it works with the sound off. It ends by pointing that out.

## Script

| Time | Scene | On screen |
|---|---|---|
| 0:00 | Hook | Live-style captions: "Some of your viewers can't hear you." / "Some are watching with the sound off." / "Some don't speak your language." / "What if every one of them could follow along?" |
| 0:10 | Logo | A slash cuts in the CAPTION.Ninja logo. "Free live captions, transcription & translation. Right in your browser." Free to use · No install · No sign-up · Open source |
| 0:16 | Audience | "Made for streamers, teachers, podcasters, churches, gamers, event hosts, newsrooms, classrooms, meetups… everyone." |
| 0:22 | Step 1 | Open caption.ninja in Chrome or Edge, allow the microphone, and captions appear as you talk. |
| 0:29 | Step 2 | Copy the overlay link from the page. |
| 0:33 | Step 3 | Paste it as a Browser Source in OBS Studio, vMix or any app that has one. "You're live, with captions!" |
| 0:40 | Any audio | Microphone, Zoom & Teams calls, YouTube & Twitch, games and apps through a virtual audio cable. |
| 0:46 | Styling | Five looks built from overlay URL parameters (`&color`, `&nobg&outline`, `&bg&radius`, `&uppercase&fontsize&align`, light boxes), plus `&css=` for full control. |
| 0:54 | Translation | "Speak once. Be understood everywhere." One English caption becomes Spanish, French, German, Japanese, Ukrainian and Korean overlays with `&translate=xx`. Free on-device translation in 17 languages; 100+ with Google Cloud and AI providers. |
| 1:06 | Text-to-speech | "Give your captions a voice." `&translate=es&tts=es-ES`, with system voices or Kokoro, Piper, ElevenLabs and more through tts.rocks. |
| 1:12 | Pro tools | Capture Pro exports, Live Caption Editor, custom vocabulary, speaker labels, scripts & credits roll, manual mode. |
| 1:16 | Editor demo | "Misheard? Fix it before it airs." *Cooper Nettie's* is corrected to *Kubernetes* before it reaches the public overlay. |
| 1:23 | And more | A marquee of further features: dual-language overlay, auto-clear, max lines, profanity masking, chapter marks, vMix page, Electron Capture, private relay, Caption Local and more. |
| 1:30 | Open source | "Free to use. Yours to run." Fork & host on GitHub Pages, private relay with room tokens, Caption Local for on-machine speech recognition. |
| 1:38 | Reveal | "Did you notice something?" / "Not a single word in this video was spoken." / "Yet you followed every one of them." / "That's the power of captions." |
| 1:46 | Call to action | caption.ninja · Free · No install · No sign-up · Open source · From the maker of VDO.Ninja · Free support at discord.vdo.ninja |

## YouTube description (ready to paste)

```
CAPTION.Ninja is a free, browser-based tool for live captions, transcription, translation and text-to-speech. No install and no sign-up: open caption.ninja, start talking, and add your overlay link to OBS, vMix or any app with a browser source.

This video has no voiceover. Watch it with the sound off; you won't miss a word.

0:00 Why captions matter
0:10 Meet CAPTION.Ninja
0:22 Set up in three steps
0:40 Any audio, any style
0:54 Translation and text-to-speech
1:12 Pro tools and self-hosting
1:38 Get started

Start captioning: https://caption.ninja
Source code: https://github.com/steveseguin/captionninja
Free support: https://discord.vdo.ninja
```

## How it is made

Everything on screen is a pure function of time. `index.html` exposes `window.__seek(t)`, and `render.mjs` steps through it frame by frame in headless Chromium and pipes the frames into ffmpeg. There are no CSS transitions or timers, so the render is frame-exact and repeatable.

The soundtrack is original and synthesised in code by `soundtrack.py`: 120 BPM, D major, with no samples. Its sections follow the scenes, and every sound effect (slash, whooshes, pops, clicks) is placed from the cue list that the page exports, so audio and picture stay in sync when scenes are retimed.

### Re-render after editing

Requirements: Node 18+, Playwright with Chromium, ffmpeg with libx264, and Python 3 with `numpy` and `scipy`.

```sh
npm install -g playwright && npx playwright install chromium
pip install numpy scipy
node promo/render.mjs                 # full video + teaser, about 5 minutes on 4 cores
node promo/render.mjs --from 54 --to 66 --skip-audio   # preview one scene (written to your temp folder)
node promo/render.mjs --teaser-only   # re-cut the teaser from the existing full video
```

Options: `--workers N` (parallel browsers, default 3), `--crf N` (x264 quality, default 20), `FFMPEG=/path/to/ffmpeg` and `PYTHON=/path/to/python3` environment variables.

To preview a single moment, open `index.html?t=54.5` in a browser.

## Credits and licences

- Fonts: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [Inter](https://github.com/rsms/inter), both SIL Open Font License 1.1 (see `fonts/`). Captions use the repository's own Cousine font.
- Icons: [Lucide](https://lucide.dev), ISC licence.
- Music and sound effects: original, generated by `soundtrack.py`.
- Everything else here is part of CAPTION.Ninja and shares its MPL-2.0 licence.
