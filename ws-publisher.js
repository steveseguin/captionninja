(function (w) {
  'use strict';

  function noop() {}

  function normalizeError(err) {
    if (!err) return 'unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.type) return err.type;
    try {
      return JSON.stringify(err);
    } catch (e) {
      return String(err);
    }
  }

  function parseMs(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function createWSPublisher(options) {
    options = options || {};

    var url = options.url || 'wss://api.caption.ninja:443';
    var room = options.room || '';
    var maxQueue = parseMs(options.maxQueue, 200);
    var baseDelayMs = parseMs(options.baseDelayMs, 1000);
    var maxDelayMs = parseMs(options.maxDelayMs, 30000);
    var blockedAfterMs = parseMs(options.blockedAfterMs, 20000);
    var blockedRetryThreshold = parseMs(options.blockedRetryThreshold, 4);

    var onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : noop;
    var onStats = typeof options.onStats === 'function' ? options.onStats : noop;
    var onError = typeof options.onError === 'function' ? options.onError : noop;
    var onMessage = typeof options.onMessage === 'function' ? options.onMessage : noop;

    var socket = null;
    var queue = [];
    var retryCount = 0;
    var droppedCount = 0;
    var reconnectTimer = null;
    var reconnectAt = 0;
    var manualClose = false;

    var state = 'idle';
    var firstAttemptAt = 0;
    var connectedAt = 0;
    var lastError = '';
    var lastErrorAt = 0;
    var lastSendAt = 0;
    var lastFlushAt = 0;
    var blockedSuspected = false;

    function now() {
      return Date.now();
    }

    function getRetryDelay() {
      if (retryCount === 0) {
        return 0;
      }
      return Math.min(baseDelayMs * Math.pow(2, retryCount - 1), maxDelayMs);
    }

    function getSnapshot() {
      return {
        url: url,
        room: room,
        state: state,
        retryCount: retryCount,
        queueLength: queue.length,
        droppedCount: droppedCount,
        blockedSuspected: blockedSuspected,
        lastError: lastError,
        lastErrorAt: lastErrorAt,
        firstAttemptAt: firstAttemptAt,
        connectedAt: connectedAt,
        lastSendAt: lastSendAt,
        lastFlushAt: lastFlushAt,
        reconnectAt: reconnectAt
      };
    }

    function emitState(nextState) {
      if (state !== nextState) {
        state = nextState;
      }
      onStateChange(nextState, getSnapshot());
      onStats(getSnapshot());
    }

    function emitStatsOnly() {
      onStats(getSnapshot());
    }

    function emitError(err) {
      lastError = normalizeError(err);
      lastErrorAt = now();
      onError(lastError, getSnapshot());
      emitStatsOnly();
    }

    function maybeMarkBlocked() {
      if (!firstAttemptAt) return;
      var elapsed = now() - firstAttemptAt;
      if (elapsed >= blockedAfterMs && retryCount >= blockedRetryThreshold) {
        blockedSuspected = true;
      }
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAt = 0;
    }

    function enqueue(payload) {
      if (queue.length >= maxQueue) {
        queue.shift();
        droppedCount += 1;
      }
      queue.push(payload);
      emitStatsOnly();
    }

    function cleanupSocket() {
      if (!socket) return;
      try {
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      } catch (e) {
        // ignore cleanup errors
      }
      socket = null;
    }

    function scheduleReconnect() {
      if (manualClose) {
        return;
      }
      if (reconnectTimer) {
        return;
      }

      var delay = getRetryDelay();
      reconnectAt = now() + delay;
      emitState('reconnecting');

      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        reconnectAt = 0;
        retryCount += 1;
        connect();
      }, delay);
    }

    function sendObject(payload) {
      if (!payload || typeof payload !== 'object') {
        return false;
      }

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        enqueue(payload);
        if (!manualClose && !reconnectTimer) {
          connect();
        }
        return false;
      }

      if (socket.readyState !== WebSocket.OPEN) {
        enqueue(payload);
        return false;
      }

      try {
        socket.send(JSON.stringify(payload));
        lastSendAt = now();
        emitStatsOnly();
        return true;
      } catch (err) {
        emitError(err);
        enqueue(payload);
        try {
          socket.close();
        } catch (e) {
          // ignore close error
        }
        return false;
      }
    }

    function flushQueue() {
      if (!socket || socket.readyState !== WebSocket.OPEN || !queue.length) {
        return;
      }

      while (queue.length > 0) {
        var item = queue[0];
        try {
          socket.send(JSON.stringify(item));
          queue.shift();
          lastFlushAt = now();
        } catch (err) {
          emitError(err);
          break;
        }
      }

      emitStatsOnly();
    }

    function connect() {
      manualClose = false;
      blockedSuspected = false;
      if (!firstAttemptAt) {
        firstAttemptAt = now();
      }

      clearReconnectTimer();
      cleanupSocket();
      emitState('connecting');

      try {
        socket = new WebSocket(url);
      } catch (err) {
        emitError(err);
        maybeMarkBlocked();
        scheduleReconnect();
        return;
      }

      socket.onopen = function () {
        connectedAt = now();
        firstAttemptAt = 0;
        retryCount = 0;
        blockedSuspected = false;
        emitState('connected');

        var joinPayload = options.joinPayload;
        if (!joinPayload && room) {
          joinPayload = { join: room };
        }
        if (joinPayload) {
          sendObject(joinPayload);
        }

        flushQueue();
      };

      socket.onmessage = function (event) {
        onMessage(event, getSnapshot());
      };

      socket.onerror = function (event) {
        emitError(event && event.error ? event.error : event);
        emitState('error');
        maybeMarkBlocked();
        try {
          if (socket) {
            socket.close();
          }
        } catch (e) {
          // ignore
        }
      };

      socket.onclose = function () {
        if (manualClose) {
          emitState('closed');
          return;
        }
        maybeMarkBlocked();
        scheduleReconnect();
      };
    }

    function publish(payload) {
      return sendObject(payload);
    }

    function disconnect() {
      manualClose = true;
      firstAttemptAt = 0;
      blockedSuspected = false;
      clearReconnectTimer();
      cleanupSocket();
      emitState('closed');
    }

    function setRoom(nextRoom) {
      room = nextRoom || '';
    }

    function isOpen() {
      return !!socket && socket.readyState === WebSocket.OPEN;
    }

    return {
      connect: connect,
      disconnect: disconnect,
      publish: publish,
      flush: flushQueue,
      getSnapshot: getSnapshot,
      isOpen: isOpen,
      setRoom: setRoom
    };
  }

  w.createWSPublisher = createWSPublisher;
})(window);
