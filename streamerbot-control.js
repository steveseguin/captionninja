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

  async function hashBase64(text) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)));
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
          const secret = await hashBase64(password.value + message.authentication.salt);
          const authentication = await hashBase64(secret + message.authentication.challenge);
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
