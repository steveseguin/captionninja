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
  function showStatus(text, alert = false) {
    let node = document.getElementById('privateRelayStatus');
    if (!node) {
      node = document.createElement('p'); node.id = 'privateRelayStatus';
      node.style.cssText = 'padding:12px;background:#172338;color:#fff;font:16px system-ui;border:1px solid #9fb8d9';
      document.body.prepend(node);
    }
    node.setAttribute('role', alert ? 'alert' : 'status'); node.textContent = text; node.hidden = false;
  }
  async function setup({kind, room, output}) {
    if (!custom()) return {room, output};
    const valid = value => /^[A-Za-z0-9_-]{32,128}$/.test(value || '');
    if (selected && valid(tokens.read) && (kind !== 'editor' || valid(tokens.write))) return {room, output};
    if (!document.getElementById('privateSetupStyle')) {
      const style = document.createElement('style'); style.id = 'privateSetupStyle';
      style.textContent = 'body.private-relay-setup{position:static!important;display:block!important;overflow:auto!important;height:auto!important;min-height:100vh;width:auto!important;padding:16px!important;box-sizing:border-box;background:#101217}body.private-relay-setup>:not(#relaySetup){display:none!important}#relaySetup a{color:#a8d4ff}#relaySetup :focus-visible{outline:3px solid #a8d4ff;outline-offset:3px}';
      document.head.append(style);
    }
    document.body.classList.add('private-relay-setup');
    const form = document.createElement('form'); form.id = 'relaySetup';
    form.style.cssText = 'box-sizing:border-box;width:100%;max-width:640px;margin:8px auto;padding:20px;background:#172338;color:#fff;font:16px/1.5 system-ui;border:1px solid #9fb8d9;border-radius:12px';
    const heading = document.createElement('h2'); heading.id = 'relaySetupTitle'; heading.tabIndex = -1;
    heading.style.cssText = 'font-size:24px;line-height:1.25;margin:0 0 12px;outline:none';
    heading.textContent = kind === 'editor' ? 'Connect your caption editor' : 'Connect your caption viewer'; form.append(heading);
    form.setAttribute('aria-labelledby', heading.id);
    const help = document.createElement('p'); help.textContent = kind === 'editor'
      ? 'Use the source viewing token to receive automatic captions and the output publishing token to send reviewed captions. These are separate from the speech service token.'
      : 'Enter the viewing token for this output room. A viewing token cannot publish captions.';
    form.append(help);
    const guide = document.createElement('a'); guide.href = 'https://github.com/steveseguin/captionninja/blob/master/relay/README.md';
    guide.textContent = 'Setup guide and room tokens'; guide.target = '_blank'; guide.rel = 'noopener noreferrer'; form.append(guide);
    function input(id, label, value = '', type = 'text') {
      const wrapper = document.createElement('label'); wrapper.textContent = label;
      wrapper.style.cssText = 'display:block;margin:12px 0';
      const field = document.createElement('input'); field.id = id; field.type = type; field.value = value;
      field.required = true; field.autocomplete = 'off'; field.spellcheck = false;
      field.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:8px;font:inherit;background:#fff;color:#111;border:1px solid #8a9bb5';
      wrapper.append(field); form.append(wrapper); return field;
    }
    const address = input('relaySetupAddress', 'Relay address', selected, 'url');
    const source = input('relaySetupRoom', kind === 'editor' ? 'Source room' : 'Output room', room);
    const read = input('relaySetupReadToken', kind === 'editor' ? 'Source viewing token' : 'Output viewing token', tokens.read || '', 'password');
    const destination = kind === 'editor' ? input('relaySetupOutput', 'Editor output room', output) : null;
    const write = kind === 'editor' ? input('relaySetupWriteToken', 'Output publishing token', tokens.write || '', 'password') : null;
    const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Connect private relay';
    button.style.cssText = 'padding:10px;font:inherit'; form.append(button);
    const error = document.createElement('p'); error.setAttribute('role', 'alert'); form.append(error);
    document.body.prepend(form); heading.focus({preventScroll: true});
    return new Promise(resolve => {
      form.onsubmit = event => {
        event.preventDefault();
        try {
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(source.value) ||
              (destination && (!/^[A-Za-z0-9_-]{1,128}$/.test(destination.value) || destination.value === source.value)))
            throw new Error('Use configured room names; source and output must differ.');
          if (!valid(read.value) || (write && !valid(write.value))) throw new Error('Enter the room tokens from your relay operator.');
          configure(address.value); tokens.read = read.value; if (write) tokens.write = write.value;
          const current = new URL(w.location.href); current.searchParams.set('relay', selected);
          current.searchParams.set('room', source.value); if (destination) current.searchParams.set('output', destination.value);
          w.history.replaceState(null, '', current.pathname + current.search + current.hash);
          const result = {room: source.value, output: destination?.value || output};
          form.remove(); document.body.classList.remove('private-relay-setup');
          showStatus('Connecting to private relay…'); resolve(result);
        } catch (caught) { error.textContent = caught.message; }
      };
    });
  }
  function addViewerLink(value, parent) {
    if (!custom()) return;
    const details = document.createElement('details'); details.id = 'privateViewerLink';
    details.style.cssText = 'margin-top:16px;max-width:100%';
    const summary = document.createElement('summary'); summary.textContent = 'Create a view-only OBS link'; details.append(summary);
    summary.style.cssText = 'cursor:pointer;white-space:normal;min-height:32px';
    const label = document.createElement('label'); label.textContent = 'Output room viewing token (never a publishing token)';
    label.style.cssText = 'display:block;margin:12px 0';
    const input = document.createElement('input'); input.id = 'viewerLinkToken'; input.type = 'password'; input.autocomplete = 'off';
    input.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-width:0;margin-top:6px;padding:10px;font:inherit;border:1px solid #9fb8d9;border-radius:6px;background:#172338;color:#fff';
    label.append(input); details.append(label);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Create viewer link'; details.append(button);
    const result = document.createElement('textarea'); result.id = 'viewerLinkResult'; result.readOnly = true;
    result.style.cssText = 'width:100%;min-height:6em;font:14px monospace';
    result.setAttribute('aria-label', 'View-only OBS URL'); result.hidden = true; details.append(result);
    const note = document.createElement('p'); note.setAttribute('role', 'status'); details.append(note);
    button.onclick = async () => {
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(input.value) || input.value === tokens.write) {
        note.textContent = 'Enter the separate output viewing token. Publishing credentials must not go in audience links.'; return;
      }
      button.disabled = true; result.hidden = true; result.value = '';
      note.textContent = 'Checking viewing access for the output room…';
      try {
        const url = new URL(link(value)), token = input.value, room = url.searchParams.get('room');
        await new Promise((resolve, reject) => {
          const socket = new WebSocket(selected);
          const timer = setTimeout(() => finish(false), 10000); let complete = false;
          function finish(allowed) {
            if (complete) return; complete = true; clearTimeout(timer);
            socket.onclose = socket.onerror = socket.onmessage = null; socket.close();
            allowed ? resolve() : reject(new Error('Token not authorized to view the output room, or relay unavailable.'));
          }
          socket.onopen = () => socket.send(JSON.stringify({protocol: 2, join: room, role: 'read', token}));
          socket.onmessage = event => {
            try { const ack = JSON.parse(event.data); if (ack.joined === room && ack.role === 'read' && ack.protocol === 2) finish(true); }
            catch (_) { finish(false); }
          };
          socket.onclose = socket.onerror = () => finish(false);
        });
        url.hash = new URLSearchParams({relayReadToken: token});
        result.value = url.href; result.hidden = false; result.focus(); result.select(); input.value = '';
        note.textContent = 'Verified viewing access. Copy this link into OBS. Anyone with it can view this room. Keep it private; no publishing token is included.';
      } catch (error) { note.textContent = error.message; }
      finally { button.disabled = false; }
    };
    parent.append(details);
  }
  function showGap(reason) {
    const messages = {'relay-restarted': 'The relay restarted; older captions may be unavailable.',
      'history-expired': 'The interruption exceeded the retained history; some captions could not be recovered.',
      'sequence-gap': 'Some captions could not be recovered in order.'};
    showStatus('Caption delivery gap: ' + (messages[reason] || 'Some captions may be missing.'), true);
  }
  Object.assign(w.CaptionRelay, {setup, showStatus, showGap, addViewerLink});
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
