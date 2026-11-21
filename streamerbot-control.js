async function captionStreamerbotAuthentication(password, challenge) {
  async function hashBase64(text) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)));
  }
  const secret = await hashBase64(password + challenge.salt);
  return hashBase64(secret + challenge.challenge);
}

// Optional local Streamer.bot control for the microphone capture page.
function connectCaptionStreamerbot(room, port, setListening) {
  const panel = document.getElementById('streamerbotControl');
  const button = document.getElementById('streamerbotConnect');
  const password = document.getElementById('streamerbotPassword');
  const status = document.getElementById('streamerbotStatus');
  let socket = null;
  let ready = false;
  panel.hidden = false;

  function disconnect(message) {
    ready = false;
    setListening(false);
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
      socket = null;
    }
    button.textContent = 'Connect to Streamer.bot';
    password.disabled = false;
    status.textContent = message;
  }

  button.addEventListener('click', function() {
    if (socket) {
      disconnect('Disconnected. Listening is paused.');
      return;
    }
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      status.textContent = 'Use &streamerbot=PORT with a port between 1 and 65535.';
      return;
    }
    setListening(false);
    ready = false;
    status.textContent = 'Connecting to Streamer.bot…';
    button.textContent = 'Disconnect';
    password.disabled = true;
    try {
      socket = new WebSocket('ws://127.0.0.1:' + port + '/');
    } catch (error) {
      disconnect('Connection blocked. Check browser local-network permission and Streamer.bot settings.');
      return;
    }
    const connection = socket;
    function subscribe() {
      connection.send(JSON.stringify({
        request: 'Subscribe', id: 'caption-subscribe', events: { General: ['Custom'] }
      }));
    }
    connection.onmessage = async function(event) {
      if (socket !== connection) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (!message || typeof message !== 'object') return;
      if (message.request === 'Hello') {
        if (!message.authentication) {
          subscribe();
          return;
        }
        if (!password.value) {
          disconnect('Enter your Streamer.bot WebSocket password, then connect again.');
          return;
        }
        try {
          const authentication = await captionStreamerbotAuthentication(password.value, message.authentication);
          if (socket !== connection) return;
          connection.send(JSON.stringify({
            request: 'Authenticate', id: 'caption-auth', authentication: authentication
          }));
        } catch (error) {
          if (socket === connection) disconnect('Authentication failed. Use HTTPS or localhost and check your password.');
        }
        return;
      }
      if (message.id === 'caption-auth') {
        if (message.status === 'ok') {
          subscribe();
        } else {
          disconnect('Authentication failed. Check your Streamer.bot WebSocket password.');
        }
        return;
      }
      if (message.id === 'caption-subscribe') {
        if (message.status !== 'ok') {
          disconnect('Could not subscribe to Streamer.bot. Check its WebSocket settings.');
          return;
        }
        ready = true;
        status.textContent = 'Connected. Hold your Stream Deck button to speak.';
        return;
      }
      if (!ready) return;
      let payload = message;
      if (message.event) {
        if (message.event.source !== 'General' || message.event.type !== 'Custom') return;
        payload = message.data;
        if (payload && typeof payload.data === 'string') payload = payload.data;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (error) { return; }
        }
      }
      const command = payload && payload.captionninja;
      if (!command || command.room !== room || typeof command.listening !== 'boolean') return;
      setListening(command.listening);
    };
    connection.onclose = function() {
      if (socket === connection) disconnect('Connection lost. Listening is paused. Reconnect, then press your button again.');
    };
    connection.onerror = function() {
      if (socket === connection) disconnect('Connection failed. Check Streamer.bot and browser local-network permission.');
    };
  });
  window.addEventListener('pagehide', function() {
    disconnect('Disconnected. Listening is paused.');
  });
}

// The overlay opens these controls on a click in OBS Interact.
function setupCaptionForwarding(actionName, port, targetLanguage, useContext) {
  document.body.appendChild(document.getElementById('captionForwardingSetup').content.cloneNode(true));
  const panel = document.getElementById('captionForwarding');
  const button = document.getElementById('captionActionConnect');
  const password = document.getElementById('captionActionPassword');
  const status = document.getElementById('captionActionStatus');
  document.getElementById('captionActionName').textContent = actionName;
  document.addEventListener('click', function(event) {
    if (!panel.contains(event.target) && !panel.open) panel.showModal();
  });

  if (!targetLanguage) {
    status.textContent = 'Add a translation language to this overlay, for example &translate=en.';
  } else if (useContext) {
    status.textContent = 'Remove &context and &fullcontext to post one caption at a time.';
  } else if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    status.textContent = 'Use a Streamer.bot port between 1 and 65535.';
  }
  if (status.textContent) {
    button.disabled = true;
    return null;
  }

  let socket = null;
  let actionId = null;
  let retry = null;
  let requestId = 0;
  function stop(message) {
    clearTimeout(retry);
    retry = null;
    actionId = null;
    if (socket) {
      socket.onclose = socket.onerror = socket.onmessage = null;
      socket.close();
      socket = null;
    }
    button.textContent = 'Connect';
    password.disabled = false;
    status.textContent = message;
  }
  function connect() {
    retry = null;
    button.textContent = 'Disconnect';
    password.disabled = true;
    status.textContent = 'Connecting...';
    try {
      socket = new WebSocket('ws://127.0.0.1:' + port + '/');
    } catch (_) {
      stop('Connection blocked. Check browser local-network permission.');
      return;
    }
    const connection = socket;
    function getActions() {
      connection.send(JSON.stringify({request: 'GetActions', id: 'caption-actions'}));
    }
    connection.onmessage = async function(event) {
      let data;
      try { data = JSON.parse(event.data); } catch (_) { return; }
      if (!data || socket !== connection) return;
      if (data.request === 'Hello') {
        if (!data.authentication) return getActions();
        if (!password.value) return stop('Enter your Streamer.bot WebSocket password and connect again.');
        try {
          const authentication = await captionStreamerbotAuthentication(password.value, data.authentication);
          if (connection.readyState === WebSocket.OPEN && socket === connection) {
            connection.send(JSON.stringify({request: 'Authenticate', id: 'caption-auth', authentication}));
          }
        } catch (_) {
          if (socket === connection) stop('Authentication failed. Check your password and use HTTPS or localhost.');
        }
      } else if (data.id === 'caption-auth') {
        if (data.status === 'ok') getActions();
        else stop('Authentication failed. Check the WebSocket password.');
      } else if (data.id === 'caption-actions') {
        const action = Array.isArray(data.actions) && data.actions.find(item => item.name === actionName);
        if (!action || !action.id || action.enabled === false) return stop('Create or enable this action in Streamer.bot, then connect again.');
        actionId = action.id;
        status.textContent = 'Connected.';
        if (panel.open) panel.close();
      } else if (String(data.id).startsWith('caption-post-') && data.status !== 'ok') {
        stop('Streamer.bot rejected the caption. Check the action and reconnect.');
      }
    };
    connection.onclose = function(event) {
      if (socket !== connection) return;
      if (event.code === 4009) return stop('Authentication failed. Check the WebSocket password.');
      actionId = null;
      socket = null;
      status.textContent = 'Disconnected. Retrying...';
      retry = setTimeout(connect, 3000);
    };
  }
  button.onclick = function() {
    if (socket || retry) stop('Disconnected.');
    else connect();
  };
  window.addEventListener('pagehide', function() { stop('Disconnected.'); });

  return function(text) {
    if (!actionId || !socket || socket.readyState !== WebSocket.OPEN) return;
    const caption = text.replace(/\s+/g, ' ').trim();
    if (!caption) return;
    socket.send(JSON.stringify({
      request: 'DoAction', action: {id: actionId}, args: {caption}, id: 'caption-post-' + (++requestId)
    }));
  };
}
