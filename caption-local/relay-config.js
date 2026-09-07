// MPL-2.0. Shared by Caption Local and caption.ninja's private relay workflow.
(function (w) {
  'use strict';
  const DEFAULT = 'wss://api.caption.ninja:443';
  let selected = DEFAULT;
  const tokens = {};
  function validate(value) {
    const u = new URL(value);
    if (!['wss:', 'ws:'].includes(u.protocol) || u.username || u.password || u.search || u.hash ||
        (u.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
      throw new Error('Use a wss:// relay address, or ws://localhost for local testing. Credentials belong in the token field.');
    return u.href;
  }
  function configure(value) {
    const next = validate(value || DEFAULT);
    if (next !== selected) { delete tokens.read; delete tokens.write; }
    selected = next;
  }
  function custom() { return selected !== validate(DEFAULT); }
  function join(room, role, supplied) {
    if (!custom()) return {join: room};
    let token = supplied;
    if (token === undefined) {
      if (!Object.hasOwn(tokens, role)) tokens[role] = w.prompt(
        `Private relay ${role === 'write' ? 'publishing' : 'viewing'} token for room "${room}"\n${selected}`) || '';
      token = tokens[role];
    }
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token))
      throw new Error('A private relay room token is required. Reload with the correct viewing/publishing token.');
    return {join: room, role, token};
  }
  function link(value) {
    const u = new URL(value, w.location.href);
    // Credentials are deliberately never propagated to another page or role.
    u.hash = '';
    if (custom()) u.searchParams.set('relay', selected); else u.searchParams.delete('relay');
    return u.href;
  }
  w.CaptionRelay = {configure, validate, custom, join, link, url: () => selected, DEFAULT};
  try {
    const query = new URLSearchParams(w.location.search);
    // An invalid custom endpoint must fail closed rather than select the public relay.
    if (query.has('relay')) selected = '';
    configure(query.has('relay') ? query.get('relay') || 'invalid:' : DEFAULT);
    const fragment = new URLSearchParams(w.location.hash.slice(1));
    for (const role of ['read', 'write']) {
      const name = 'relay' + (role === 'read' ? 'ReadToken' : 'WriteToken');
      if (fragment.has(name)) { tokens[role] = fragment.get(name); fragment.delete(name); }
    }
    if (fragment.toString() !== w.location.hash.slice(1))
      w.history.replaceState(null, '', w.location.pathname + w.location.search + (fragment.size ? '#' + fragment : ''));
  } catch (error) {
    selected = ''; // Subsequent connection attempts cannot fall back to the public host.
    w.addEventListener('DOMContentLoaded', () => {
      const message = document.createElement('p'); message.setAttribute('role', 'alert');
      message.textContent = 'Private relay configuration failed: ' + error.message;
      document.body.prepend(message);
    });
  }
})(window);
