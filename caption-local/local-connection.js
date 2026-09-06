'use strict';
// No credentials, rooms, audio, or captions are persisted by this transport.
class LocalConnection {
  constructor() { this.connected = false; this.busy = false; this.endpoint = ''; this.token = ''; this.metrics = []; }
  configure(endpoint, token, pageOrigin = location.origin) {
    if (this.busy) throw new Error('Stop and finish or discard pending audio before changing the connection.');
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Use an HTTPS service origin or http://localhost:8765, without a path or credentials.');
    }
    if (url.origin !== pageOrigin && !token) throw new Error('A service token is required for a different origin.');
    this.endpoint = url.origin; this.token = token; this.connected = true; this.metrics = []; this.lastInference = null;
    this.revision = (this.revision || 0) + 1;
  }
  setBusy(busy) {
    this.busy = busy;
    for (const id of ['endpoint', 'connectionToken', 'connect', 'loadSettings']) {
      const control = document.getElementById(id); if (control) control.disabled = busy || this.checking;
    }
  }
  async fetch(path, options = {}) {
    if (!this.connected) throw new Error('Connect to your service first.');
    // Reject absolute/protocol-relative URLs so authorization never escapes the selected host.
    if (!/^\/(health|transcribe(?:\?|$)|streams\/)/.test(path) || path.startsWith('//')) throw new Error('Unsupported service route.');
    const headers = new Headers(options.headers || {});
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const start = performance.now(), revision = this.revision; let status = 0;
    try {
      const response = await fetch(this.endpoint + path, {...options, headers,
        redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer'});
      status = response.status; return response;
    } finally {
      if (revision === this.revision) {
        this.metrics.push({route: path.split('?')[0].startsWith('/streams/') ? '/streams/:id' : path.split('?')[0],
          status, milliseconds: Math.round(performance.now() - start)});
        if (this.metrics.length > 100) this.metrics.shift();
      }
    }
  }
}
if (typeof module !== 'undefined') module.exports = {LocalConnection};
else window.captionLocalConnection = new LocalConnection();
