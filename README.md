# Caption.Ninja 🥷

Free, open-source captioning tool for OBS Studio and live streaming. Features real-time speech recognition, translation, and text-to-speech capabilities.

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![GitHub Stars](https://img.shields.io/github/stars/steveseguin/captionninja.svg)](https://github.com/steveseguin/captionninja/stargazers)

## 🚀 Quick Start

1. Visit [caption.ninja](https://caption.ninja)
2. Allow microphone access when prompted
3. Start speaking - captions appear in real-time
4. Copy the overlay URL to use in OBS

## 🌐 Translation Features

Caption.Ninja offers multiple translation options:

### Free Translation (17 Languages)
- No API key required
- Privacy-focused (runs locally)
- Languages: Bulgarian, Czech, Dutch, English, Estonian, German, French, Icelandic, Italian, Norwegian (Bokmål & Nynorsk), Persian, Polish, Portuguese, Russian, Spanish, Ukrainian

**Quick setup:**
```
overlay.html?room=yourRoom&translate=es
```

### Premium Translation (100+ Languages)
- Requires Google Cloud Translation API key
- Superior translation quality
- Context-aware translation option

**Quick setup:**
```
overlay.html?room=yourRoom&translate=ja&googlekey=YOUR_API_KEY
```

### Translation Methods

1. **Direct Overlay Translation** - Add translation parameters to any overlay URL
2. **Translation Pages** - Use dedicated translation interfaces:
   - [Free Translation](https://caption.ninja/translate)
   - [Premium Translation](https://caption.ninja/translate_premium)
3. **Multi-Language Support** - Create multiple overlays for different languages

📖 **[View Complete Translation Guide](https://caption.ninja/translation-guide.html)**

## 🎯 Features

- **Real-time Speech Recognition** - Powered by Web Speech API
- **Live Translation** - 17 free languages or 100+ with Google API
- **Text-to-Speech** - Multiple TTS providers supported
- **OBS Integration** - Simple browser source setup
- **Privacy Focused** - No account required, minimal data collection
- **Customizable** - Font size, colors, positioning, and more
- **WebSocket Support** - Remote captioning capabilities

## 🛠️ URL Parameters

### Basic Parameters
- `room=ID` - Room ID for sharing captions
- `lang=XX-XX` - Input language (e.g., `en-US`, `fr-FR`)
- `translate=XX` - Target translation language
- `label=Name` - Add speaker label

### Translation Parameters
- `googlekey=KEY` - Google Cloud Translation API key
- `context=1` - Enable context-aware translation
- `contextsize=N` - Number of previous messages for context
- `forcelocal=1` - Force local translation

### Display Parameters
- `css=URL` - Custom CSS file
- `fontsize=N` - Font size in pixels
- `bg=COLOR` - Background color
- `color=COLOR` - Text color
- `showtime=N` - Caption timeout in milliseconds
- `clear=1` - Clear old captions on new text

### TTS Parameters
- `speech=1` - Enable text-to-speech
- `ttskey=KEY` - Google Cloud TTS API key
- `voice=NAME` - TTS voice name
- `rate=N` - Speech rate
- `pitch=N` - Speech pitch

## 🎬 OBS Setup

1. Add a **Browser Source** in OBS
2. Set URL to: `https://caption.ninja/overlay?room=yourRoomID`
3. Set dimensions: Width: 1920, Height: 1080
4. Check "Shutdown source when not visible"
5. Position the source where you want captions to appear

## 💻 Self-Hosting

```bash
git clone https://github.com/steveseguin/captionninja.git
cd captionninja
# Serve files using any web server
python -m http.server 8080
```

## 🔧 Advanced Usage

### Multiple Language Overlays
Create separate browser sources for each language:
```
overlay.html?room=myRoom&translate=es  # Spanish
overlay.html?room=myRoom&translate=fr  # French
overlay.html?room=myRoom&translate=de  # German
```

### Remote Captioning
1. Captioner uses: `speechin.html?room=uniqueID`
2. Overlay displays: `overlay.html?room=uniqueID`

### Custom Styling
Add custom CSS via URL parameter:
```
overlay.html?room=myRoom&css=https://example.com/custom.css
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

© 2020 Steve Seguin

## 🙏 Acknowledgments

- Mozilla Bergamot for local translation models
- Google Cloud for translation and TTS APIs
- Web Speech API contributors
- All contributors and users of Caption.Ninja

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/steveseguin/captionninja/issues)
- **Discussions**: [GitHub Discussions](https://github.com/steveseguin/captionninja/discussions)
- **Author**: [Steve Seguin](https://github.com/steveseguin)

---

Made with ❤️ by the open-source community