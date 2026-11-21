// Optional private link from the capture page to Social Stream Ninja (SSN), enabled by adding
// &ssn=YOUR_SSN_SESSION to the capture page address. Finished captions are sent to SSN over its
// own peer-to-peer connection, so SSN knows they are yours and can post them to the chats you
// picked there. The public caption room and its overlay links are unchanged. Guide: social-stream.md
function connectCaptionSocialStream(session, password) {
  var BRIDGE_ORIGIN = 'https://vdo.socialstream.ninja';
  var MAX_SEND_LENGTH = 1500; // SSN takes up to 2000 characters at a time.
  var bridge = null;
  var peer = null;
  var presence = null;
  var counter = 0;
  var pending = {};

  // Names this page for as long as it is open. The same id goes on each finished caption sent to
  // the room, so SSN can pair a caption's two copies and leave other speakers' captions alone.
  var publisher = '';
  var bytes = new Uint8Array(12);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  for (var i = 0; i < bytes.length; i++) {
    publisher += ('0' + bytes[i].toString(16)).slice(-2);
  }

  var status = document.createElement('p');
  status.id = 'ssnLinkStatus';
  status.setAttribute('role', 'status');
  var anchor = document.getElementById('streamerbotControl') || document.getElementById('toggleTranscription');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(status, anchor);
  } else {
    document.body.appendChild(status);
  }
  function say(text) {
    status.textContent = 'Social Stream Ninja: ' + text;
  }

  function post(value) {
    if (!peer || !bridge) return false;
    counter += 1;
    var id = 'caption-ninja-' + Date.now() + '-' + counter;
    pending[id] = setTimeout(function() {
      delete pending[id];
      say('no answer. Check that it is open and switched on.');
    }, 8000);
    bridge.contentWindow.postMessage({
      sendData: {
        overlayNinja: { action: 'caption', value: value, protocol: 2, apiid: session, get: id, replyFormat: 'commandResult', operatorRelay: true }
      },
      type: 'rpcs',
      UUID: peer
    }, BRIDGE_ORIGIN);
    return true;
  }

  // Tells SSN this page is linked, so it waits for the private copy of each caption.
  function announce() {
    post({ linked: true, pub: publisher });
  }

  function onReply(data) {
    if (data && data.type === 'commandResult') {
      data = { callback: { get: data.get || (data.result && data.result.request), result: data.result } };
    }
    if (!data || !data.callback || !data.callback.get) return;
    var id = String(data.callback.get);
    if (!(id in pending)) return;
    clearTimeout(pending[id]);
    delete pending[id];
    var result = data.callback.result;
    if (result && result.ok === false) {
      say((result.error && result.error.message) || 'did not accept that caption.');
    } else {
      say('linked. Finished captions are sent to it.');
    }
  }

  function onMessage(event) {
    if (!bridge || event.source !== bridge.contentWindow || event.origin !== BRIDGE_ORIGIN) return;
    var data = event.data || {};
    if ((data.action === 'push-connection-info' || data.action === 'view-connection-info') && data.value && data.value.label === 'SocialStream') {
      var isNew = peer !== data.UUID;
      peer = data.UUID;
      if (isNew) announce();
    } else if (data.UUID === peer && (data.action === 'push-connection' || data.action === 'view-connection') && data.value === false) {
      peer = null;
      say('not connected. Check that it is open and switched on.');
    }
    if (peer && data.UUID === peer && data.dataReceived && data.dataReceived.overlayNinja) {
      onReply(data.dataReceived.overlayNinja);
    }
  }

  // The same hidden bridge SSN's own control pages use to reach a session.
  function open() {
    if (bridge) return;
    say('connecting…');
    bridge = document.createElement('iframe');
    bridge.hidden = true;
    bridge.src = BRIDGE_ORIGIN + '/?ln&salt=vdo.ninja&password=' + encodeURIComponent(password || 'false') +
      '&solo&view=' + encodeURIComponent(session) + '&novideo&noaudio&label=controls&cleanoutput&room=' + encodeURIComponent(session);
    window.addEventListener('message', onMessage);
    document.body.appendChild(bridge);
    presence = setInterval(announce, 15000);
  }

  function close() {
    if (!bridge) return;
    clearInterval(presence);
    presence = null;
    window.removeEventListener('message', onMessage);
    bridge.remove();
    bridge = null;
    peer = null;
    Object.keys(pending).forEach(function(id) {
      clearTimeout(pending[id]);
      delete pending[id];
    });
  }

  open();
  // The link is dropped when the page is put away and made again if the browser brings the same
  // page back (Back/Forward), the way the page's other connections are.
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', function(event) {
    if (event.persisted) open();
  });

  return {
    publisher: publisher,
    // One finished caption, with the id it was published to the room under. It is sent whole.
    // Only a very long one is sent as several messages, cut between words; each then says where
    // it sits in the caption (at) and how long the caption is (of), so SSN can match it exactly.
    send: function(text, label, captionId) {
      text = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
      var name = typeof label === 'string' ? label.replace(/_/g, ' ') : '';
      if (text.length <= MAX_SEND_LENGTH) {
        if (text) post({ text: text, name: name, pub: publisher, id: captionId });
        return;
      }
      var start = 0;
      while (start < text.length) {
        var end = Math.min(text.length, start + MAX_SEND_LENGTH);
        if (end < text.length) {
          var cut = text.lastIndexOf(' ', end);
          if (cut > start + MAX_SEND_LENGTH / 2) end = cut;
        }
        post({ text: text.slice(start, end), name: name, pub: publisher, id: captionId, at: start, of: text.length });
        start = end;
        while (text.charAt(start) === ' ') start += 1;
      }
    },
    close: close
  };
}
