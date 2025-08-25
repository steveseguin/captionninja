// Lightweight TTS integration for Caption.Ninja pages
(function () {
  var urlParams = new URLSearchParams(window.location.search);
  var enableTTS = urlParams.has('tts') || urlParams.has('speech') || urlParams.has('speak');
  var ttsStream = urlParams.has('ttsstream');

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (!enableTTS) {
      return; // No-op unless explicitly enabled via URL
    }
    try {
      // Load the TTS library; prefer local path, then absolute fallback
      try {
        await loadScript('tts.rocks/tts.js');
      } catch (e) {
        await loadScript('https://tts.rocks/tts.js');
      }

      // Configure using current URL params if available
      if (window.TTS && typeof window.TTS.configure === 'function') {
        window.TTS.configure(urlParams);
      } else {
        // Fallback minimal config
        window.TTS = window.TTS || {};
        window.TTS.speech = true;
      }

      // If a capture language is known, prefer it when none specified
      try {
        if (window.myLang && (!window.TTS.speechLang || window.TTS.speechLang === 'en-US')) {
          window.TTS.speechLang = window.myLang;
        }
      } catch (e) {}

      // Expose a small helper API for pages to call
      window.CAPTION_TTS = {
        speak: function (text, allow) {
          try {
            if (!text) return;
            if (!window.TTS || typeof window.TTS.speak !== 'function') return;
            window.TTS.speak(String(text), !!allow);
          } catch (e) {
            console.warn('TTS speak failed', e);
          }
        },
        stream: !!ttsStream
      };
    } catch (e) {
      console.warn('Failed to initialize TTS integration', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
