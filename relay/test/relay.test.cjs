'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {randomBytes} = require('node:crypto');
const WebSocket = require('ws');
const {createRelay} = require('../server.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function config() {
  const key = () => randomBytes(32).toString('base64url');
  return {origins: ['http://localhost:8080'], rooms: {
    source: {read: key(), write: key()}, output: {read: key(), write: key()}}};
}
async function fixture(t, limits) {
  const settings = config(), relay = createRelay(settings, limits);
  const address = await relay.listen(0);
  t.after(() => relay.close());
  const url = `ws://127.0.0.1:${address.port}`;
  async function open() { const ws = new WebSocket(url); await once(ws, 'open'); return ws; }
  async function join(room = 'source', role = 'read') {
    const ws = await open(), received = once(ws, 'message');
    ws.send(JSON.stringify({join: room, role, token: settings.rooms[room][role]}));
    assert.deepEqual(JSON.parse((await received)[0]), {joined: room, role});
    return ws;
  }
  return {settings, relay, url, open, join};
}
test('authenticated source → editor → output is isolated and preserves caption fields', async t => {
  const {join, relay} = await fixture(t);
  const producer = await join('source', 'write'), editor = await join();
  const output = await join('output', 'write'), audience = await join('output');
  const allAudience = []; audience.on('message', raw => allAudience.push(JSON.parse(raw)));
  const incoming = once(editor, 'message');
  const data = {msg: true, final: 'Hola, mundo. Bonjour. こんにちは。', id: 1, ln: 'es', label: 'Synthetic'};
  producer.send(JSON.stringify(data));
  assert.deepEqual(JSON.parse((await incoming)[0]), data);
  await pause(30); assert.equal(allAudience.length, 0);
  const visible = once(audience, 'message');
  output.send(JSON.stringify({...data, final: 'Reviewed caption'}));
  assert.equal(JSON.parse((await visible)[0]).final, 'Reviewed caption');
  assert.equal(relay.stats.delivered, 2);
});
test('wrong credentials, room changes, viewer publishing and unknown rooms fail closed', async t => {
  const {open, join, settings} = await fixture(t);
  for (const payload of [
    {join: 'source', role: 'write', token: settings.rooms.source.read},
    {join: 'output', role: 'read', token: settings.rooms.source.read},
    {join: 'unknown', role: 'read', token: settings.rooms.source.read},
    {join: {toString: null}, role: 'read', token: settings.rooms.source.read},
    {msg: true, final: 'Before join', id: 1}]) {
    const ws = await open(), closed = once(ws, 'close');
    ws.send(JSON.stringify(payload)); assert.equal((await closed)[0], 1008);
  }
  for (const [role, payload] of [['read', {msg: true, final: 'Forbidden', id: 1}],
    ['write', {join: 'output', role: 'write', token: settings.rooms.output.write}]]) {
    const ws = await join('source', role), closed = once(ws, 'close');
    ws.send(JSON.stringify(payload)); assert.equal((await closed)[0], 1008);
  }
});
test('malformed, binary and oversize payloads close only offending clients', async t => {
  const {join} = await fixture(t);
  for (const [payload, expected] of [['{broken', 1007], [Buffer.from('audio'), 1003],
    ['x'.repeat(9000), 1009], [JSON.stringify({msg: true, final: 'x', id: 1, room: 'output'}), 1008]]) {
    const ws = await join('source', 'write'), closed = once(ws, 'close');
    ws.send(payload); assert.equal((await closed)[0], expected);
  }
  assert.equal((await join()).readyState, WebSocket.OPEN);
});
test('join deadline, rate limits, origin checks and connection capacity are enforced', async t => {
  const {open, join, url} = await fixture(t, {joinMs: 60, messagesPerSecond: 2, connections: 3});
  let ws = await open(), closed = once(ws, 'close'); assert.equal((await closed)[0], 1008);
  ws = await join('source', 'write'); closed = once(ws, 'close');
  ws.send(JSON.stringify({msg: true, final: 'one', id: 1}));
  ws.send(JSON.stringify({msg: true, final: 'two', id: 2}));
  assert.equal((await closed)[0], 1008);
  async function rejected(options, status) {
    const bad = new WebSocket(url, options);
    const response = await new Promise(resolve => {
      bad.on('unexpected-response', (_, res) => { resolve(res.statusCode); res.resume(); bad.terminate(); });
      bad.on('error', () => {});
    });
    assert.equal(response, status);
  }
  await rejected({origin: 'https://foreign.example'}, 403);
  await join(); await join(); await join(); await rejected({}, 503);
});
test('slow consumer is disconnected without delaying healthy viewers; no history on reconnect', async t => {
  const {join, relay} = await fixture(t, {bufferedBytes: 100});
  const writer = await join('source', 'write'), slow = await join(), healthy = await join();
  const slowServer = [...relay.wss.clients].find(ws => ws.role === 'read');
  Object.defineProperty(slowServer, 'bufferedAmount', {get: () => 101});
  const closed = once(slow, 'close'), received = once(healthy, 'message');
  writer.send(JSON.stringify({msg: true, final: 'Still flowing', id: 1}));
  await closed; assert.equal(JSON.parse((await received)[0]).final, 'Still flowing');
  assert.equal(relay.stats.slowConsumers, 1);
  const fresh = await join(); let replay = 0; fresh.on('message', () => replay++);
  await pause(40); assert.equal(replay, 0);
});
test('health exposes aggregate counters only and cleanup releases admission capacity', async t => {
  const {join, relay, url, settings} = await fixture(t, {connections: 1});
  const viewer = await join(); const closed = once(viewer, 'close'); viewer.close(); await closed;
  await pause(10); await join();
  const text = await (await fetch(url.replace('ws:', 'http:') + '/health')).text();
  assert.equal(JSON.parse(text).connections, 1);
  assert.ok(!text.includes(settings.rooms.source.read)); assert.ok(!text.includes('source'));
  assert.equal(relay.stats.accepted, 2);
});
test('duplicate or weak room secrets are refused at startup', () => {
  const settings = config(); settings.rooms.output.read = settings.rooms.source.read;
  assert.throws(() => createRelay(settings), /unique random tokens/);
});
test('per-room and per-IP admission limits are independent', async t => {
  const {join, open, settings} = await fixture(t, {perRoom: 1});
  await join();
  const second = await open(), closed = once(second, 'close');
  second.send(JSON.stringify({join: 'source', role: 'read', token: settings.rooms.source.read}));
  assert.equal((await closed)[0], 1013);
  await join('output');
  const isolated = await fixture(t, {perIp: 1}); await isolated.join();
  const denied = new WebSocket(isolated.url);
  denied.on('error', () => {});
  const status = await new Promise(resolve => denied.on('unexpected-response', (_, res) => {
    resolve(res.statusCode); res.resume(); denied.terminate();
  }));
  assert.equal(status, 503);
});
test('heartbeat removes an unresponsive peer while healthy clients stay connected', async t => {
  const {url, join, settings} = await fixture(t, {heartbeatMs: 40});
  const healthy = await join();
  const dead = new WebSocket(url, {autoPong: false}); await once(dead, 'open');
  const ack = once(dead, 'message');
  dead.send(JSON.stringify({join: 'source', role: 'read', token: settings.rooms.source.read})); await ack;
  await once(dead, 'close'); assert.equal(healthy.readyState, WebSocket.OPEN);
});
