'use strict';
// MPL-2.0. Caption protocol implementation; independent of the hosted relay.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {WebSocketServer, WebSocket} = require('ws');
const ROOM = /^[A-Za-z0-9_-]{1,128}$/;
const digest = value => crypto.createHash('sha256').update(value).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function validateConfig(config) {
  if (!config || !Array.isArray(config.origins) || !config.origins.length || !config.rooms ||
      typeof config.rooms !== 'object' || Array.isArray(config.rooms) ||
      !Object.keys(config.rooms).length || Object.keys(config.rooms).length > 1000)
    throw new Error('Configure exact browser origins and 1–1000 rooms');
  for (const origin of config.origins) {
    const u = new URL(origin);
    if (u.origin !== origin || !['http:', 'https:'].includes(u.protocol) || origin.includes('*'))
      throw new Error('Origins must be exact HTTP(S) origins');
  }
  const tokens = new Set();
  for (const [room, keys] of Object.entries(config.rooms)) {
    if (!ROOM.test(room)) throw new Error('Invalid configured room');
    for (const role of ['read', 'write']) {
      const key = keys?.[role];
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(key) || tokens.has(key))
        throw new Error('Use unique random tokens of 32–128 URL-safe characters for every room and role');
      tokens.add(key);
    }
  }
  return config;
}

function createRelay(input, overrides = {}) {
  // Copy credentials so caller mutation cannot change a running authorization policy.
  const config = validateConfig(JSON.parse(JSON.stringify(input)));
  const limits = {connections: 512, perIp: 128, perRoom: 256, messagesPerSecond: 40,
    payloadBytes: 8192, bufferedBytes: 65536, joinMs: 10000, heartbeatMs: 30000, ...overrides};
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limits must be positive integers');
  const rooms = new Map(Object.keys(config.rooms).map(room => [room, new Set()]));
  const ips = new Map();
  const stats = {accepted: 0, rejected: 0, published: 0, delivered: 0, slowConsumers: 0};
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url !== '/health' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ready: true, connections: wss.clients.size, ...stats}));
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.maxConnections = limits.connections + 32;
  const wss = new WebSocketServer({noServer: true, maxPayload: limits.payloadBytes,
    perMessageDeflate: false, closeTimeout: 1000, maxFragments: 128, maxBufferedChunks: 256});
  function reject(socket, code) {
    stats.rejected++;
    socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const ip = req.socket.remoteAddress; // Never trust client-supplied forwarding headers.
    if (req.url !== '/' || (req.headers.origin && !config.origins.includes(req.headers.origin)))
      return reject(socket, 403);
    if (wss.clients.size >= limits.connections || (ips.get(ip) || 0) >= limits.perIp)
      return reject(socket, 503);
    wss.handleUpgrade(req, socket, head, ws => {
      ips.set(ip, (ips.get(ip) || 0) + 1);
      stats.accepted++;
      ws.ip = ip; ws.alive = true; ws.room = null; ws.role = null;
      wss.emit('connection', ws);
    });
  });
  wss.on('connection', ws => {
    let windowStart = Date.now(), messages = 0;
    let closing = false;
    function fail(code, reason) {
      if (closing) return;
      closing = true; stats.rejected++;
      ws.close(code, reason);
    }
    const deadline = setTimeout(() => fail(1008, 'Join timeout'), limits.joinMs);
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {}); // ws closes malformed/oversize transports; never log payloads.
    ws.on('close', () => {
      clearTimeout(deadline);
      rooms.get(ws.room)?.delete(ws);
      const count = (ips.get(ws.ip) || 1) - 1;
      if (count) ips.set(ws.ip, count); else ips.delete(ws.ip);
    });
    ws.on('message', (raw, binary) => {
      if (closing) return;
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > limits.messagesPerSecond) return fail(1008, 'Rate limit');
      if (binary) return fail(1003, 'Text JSON only');
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return fail(1007, 'Invalid JSON'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(1008, 'Invalid message');
      if (!ws.room) {
        const credentials = typeof data.join === 'string' && Object.hasOwn(config.rooms, data.join) ? config.rooms[data.join] : null;
        if (typeof data.join !== 'string' || !ROOM.test(data.join) ||
            !['read', 'write'].includes(data.role) || !credentials ||
            typeof data.token !== 'string' || data.token.length > 128 ||
            !same(data.token, credentials[data.role])) return fail(1008, 'Join denied');
        if (rooms.get(data.join).size >= limits.perRoom) return fail(1013, 'Room capacity');
        ws.room = data.join; ws.role = data.role;
        rooms.get(ws.room).add(ws); clearTimeout(deadline);
        ws.send(JSON.stringify({joined: ws.room, role: ws.role}));
        return;
      }
      if (ws.role !== 'write' || data.msg !== true || Object.hasOwn(data, 'join'))
        return fail(1008, 'Publishing denied');
      const fields = ['msg', 'final', 'interm', 'id', 'label', 'ln'];
      if (Object.keys(data).some(key => !fields.includes(key)) ||
          (Object.hasOwn(data, 'final') === Object.hasOwn(data, 'interm')) ||
          typeof (data.final ?? data.interm) !== 'string' || (data.final ?? data.interm).length > 4000 ||
          !(Number.isSafeInteger(data.id) || (typeof data.id === 'string' && data.id.length <= 128)) ||
          ['label', 'ln'].some(key => Object.hasOwn(data, key) &&
            (typeof data[key] !== 'string' || data[key].length > (key === 'ln' ? 32 : 128))))
        return fail(1008, 'Invalid caption');
      const encoded = JSON.stringify(data); stats.published++;
      for (const peer of rooms.get(ws.room)) {
        if (peer.role !== 'read' || peer.readyState !== WebSocket.OPEN) continue;
        if (peer.bufferedAmount + Buffer.byteLength(encoded) > limits.bufferedBytes) {
          stats.slowConsumers++; peer.terminate(); continue;
        }
        peer.send(encoded, error => { if (error) peer.terminate(); }); stats.delivered++;
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, limits.heartbeatMs);
  heartbeat.unref();
  return {server, wss, stats, limits,
    async listen(port = 8787, host = '127.0.0.1') {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
      });
      return server.address();
    },
    async close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => server.close(resolve));
    }
  };
}

if (require.main === module) {
  (async () => {
    if (!process.env.CAPTION_RELAY_CONFIG) throw new Error('Set CAPTION_RELAY_CONFIG to your private rooms JSON file');
    const relay = createRelay(JSON.parse(fs.readFileSync(process.env.CAPTION_RELAY_CONFIG, 'utf8')));
    const port = Number(process.env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    const address = await relay.listen(port, process.env.HOST || '127.0.0.1');
    console.log(JSON.stringify({event: 'relay_ready', address: address.address, port: address.port}));
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (stopping) return; stopping = true; await relay.close();
    });
  })().catch(() => { console.error('Relay startup failed. Check the private configuration, bind address and port.'); process.exitCode = 1; });
}
module.exports = {createRelay, validateConfig};
