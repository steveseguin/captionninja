// MPL-2.0. Opt-in private protocol; never loaded by the caption.ninja home page.
(function (w) {
  'use strict';
  function createPublisher(options) {
    const relay = w.CaptionRelay, url = relay.url(), room = options.room;
    const identity = crypto.randomUUID(), join = {...relay.join(room, 'write', options.relayToken), protocol: 2};
    const queue = []; let counter = 0, socket, retry, deadline, poll, manual = false, joined = false;
    let state = 'idle', drops = 0, retries = 0, epoch = null, uncertain = false;
    const maximum = Math.max(1, Math.min(1000, options.maxQueue || 100));
    function snapshot() { return {state, queueLength: queue.length, droppedCount: drops,
      retryCount: retries, uncertain, room, url}; }
    function emit(next) { state = next; options.onStateChange?.(state, snapshot()); options.onStats?.(snapshot()); }
    function clear() { clearTimeout(retry); clearTimeout(deadline); clearInterval(poll); retry = deadline = poll = null; }
    function cleanup() {
      clear(); joined = false;
      if (socket) { socket.onclose = socket.onmessage = socket.onopen = socket.onerror = null; socket.close(); socket = null; }
    }
    function flush() {
      if (!joined || !queue.length || socket?.readyState !== WebSocket.OPEN) return;
      const next = queue[0];
      if (next.sent && Date.now() - next.sent < 3000) return;
      const body = JSON.stringify(next.payload);
      if (socket.bufferedAmount + body.length * 3 > 65536) return;
      socket.send(body); next.sent = Date.now(); next.everSent = true;
    }
    function connect() {
      cleanup(); manual = false; emit('connecting');
      const current = socket = new WebSocket(url);
      deadline = setTimeout(() => current.close(), 10000);
      current.onopen = () => { emit('authenticating'); current.send(JSON.stringify(join)); };
      current.onmessage = event => {
        if (socket !== current) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (!joined) {
          if (data.joined !== room || data.role !== 'write' || data.protocol !== 2) return;
          clearTimeout(deadline); deadline = null;
          if (epoch && epoch !== data.epoch && queue.some(item => item.everSent)) {
            uncertain = true; options.onError?.('Relay restarted: an unacknowledged caption may be repeated.');
          }
          epoch = data.epoch; joined = true; retries = 0;
          for (const item of queue) item.sent = 0;
          emit(uncertain ? 'connected-with-gap' : 'connected');
          poll = setInterval(flush, 250); flush(); return;
        }
        const next = queue[0];
        if (next && data.ack?.client === identity && data.ack.sequence === next.payload.delivery.sequence) {
          queue.shift(); emit(uncertain ? 'connected-with-gap' : 'connected'); flush();
        }
      };
      current.onerror = () => current.close();
      current.onclose = event => {
        if (socket !== current) return;
        joined = false; clearTimeout(deadline); clearInterval(poll);
        if (manual) { emit('closed'); return; }
        if (event.code === 1008) { manual = true; emit('denied'); options.onError?.('Private relay denied access or rejected a message. Check room credentials.'); return; }
        emit('reconnecting');
        retry = setTimeout(connect, Math.min(10000, 500 * 2 ** Math.min(retries++, 5)));
      };
    }
    function publish(payload) {
      if (!payload || typeof payload !== 'object' || payload.delivery || payload.relay) return false;
      if (queue.length >= maximum) {
        // Never discard an in-flight message whose acceptance is still unknown.
        drops++; options.onError?.('Relay queue full; newest caption was not queued.'); emit(state); return false;
      }
      queue.push({payload: {...payload, delivery: {client: identity, sequence: ++counter}}, sent: 0});
      emit(state); flush(); return true;
    }
    return {connect, publish, flush, getSnapshot: snapshot, isOpen: () => joined,
      disconnect() { manual = true; cleanup(); emit('closed'); },
      setRoom() { throw new Error('Create a new publisher to change a private room'); }};
  }

  function subscribe(options) {
    const relay = w.CaptionRelay, url = relay.url(), room = options.room;
    const credentials = relay.join(room, 'read', options.token);
    let socket, retry, deadline, cursor = null, manual = false, connected = false, retries = 0;
    const status = state => options.onState?.(state);
    function connect() {
      if (manual) return;
      status('connecting');
      const current = socket = new WebSocket(url);
      deadline = setTimeout(() => current.close(), 10000);
      current.onopen = () => current.send(JSON.stringify({...credentials, protocol: 2, ...(cursor ? {cursor} : {})}));
      current.onmessage = event => {
        if (socket !== current) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.joined === room && data.role === 'read' && data.protocol === 2) {
          clearTimeout(deadline); connected = true; retries = 0;
          cursor = {epoch: data.epoch, sequence: data.next - 1};
          status(data.gap ? 'connected-with-gap' : 'connected');
          if (data.gap) options.onGap?.(data.gap); return;
        }
        if (data.gap) {
          cursor = {epoch: data.epoch, sequence: data.next - 1};
          status('connected-with-gap'); options.onGap?.(data.gap); return;
        }
        if (!connected || !data.relay || data.relay.epoch !== cursor.epoch ||
            !Number.isSafeInteger(data.relay.sequence) || data.relay.sequence <= cursor.sequence) return;
        if (data.relay.sequence !== cursor.sequence + 1) { options.onGap?.('sequence-gap'); status('connected-with-gap'); }
        const {relay: metadata, ...caption} = data;
        // Advance only after handing this caption to the existing page renderer.
        options.onCaption(caption);
        cursor = {epoch: metadata.epoch, sequence: metadata.sequence};
      };
      current.onerror = () => current.close();
      current.onclose = event => {
        if (socket !== current) return;
        connected = false; clearTimeout(deadline);
        if (manual) return;
        if (event.code === 1008) { status('denied'); return; }
        status('reconnecting');
        retry = setTimeout(connect, Math.min(10000, 500 * 2 ** Math.min(retries++, 5)));
      };
    }
    connect();
    return {getCursor: () => cursor && {...cursor},
      disconnect() { manual = true; clearTimeout(retry); clearTimeout(deadline); socket?.close(); },
      reconnect() { manual = false; clearTimeout(retry); clearTimeout(deadline);
        if (socket) { socket.onclose = null; socket.close(); } connected = false; connect(); }};
  }
  w.CaptionRelay.createPublisher = createPublisher;
  w.CaptionRelay.subscribe = subscribe;
})(window);
