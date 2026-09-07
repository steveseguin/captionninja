'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes, webcrypto} = require('node:crypto');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const WebSocket = require('ws');
const {createRelay} = require('../server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (!check() && Date.now() < deadline) await sleep(10);
  assert.ok(check(), 'Timed out waiting for observable client behavior');
}
async function fixture(t) {
  const config = {origins: ['http://localhost'], rooms: {source: {
    read: randomBytes(32).toString('base64url'), write: randomBytes(32).toString('base64url')}}};
  const relay = createRelay(config), address = await relay.listen(0), clients = [];
  const window = {CaptionRelay: {url: () => `ws://127.0.0.1:${address.port}/`, join: (room, role, token) => ({join: room, role, token})}};
  vm.runInNewContext(readFileSync(join(__dirname, '../../private-relay-client.js'), 'utf8'),
    {window, WebSocket, crypto: webcrypto, Date, JSON, setTimeout, clearTimeout, setInterval, clearInterval});
  const api = window.CaptionRelay;
  t.after(async () => { clients.forEach(client => client.disconnect()); await relay.close(); });
  function writer(options = {}) {
    const client = api.createPublisher({room: 'source', relayToken: config.rooms.source.write, ...options});
    clients.push(client); client.connect(); return client;
  }
  function reader(options = {}) {
    const client = api.subscribe({room: 'source', token: config.rooms.source.read, ...options}); clients.push(client); return client;
  }
  return {writer, reader, relay};
}
test('browser publisher retries the same identity after a lost ACK without duplicate delivery', async t => {
  const {writer, reader, relay} = await fixture(t), received = [];
  let ready = false; reader({onState: state => { ready = state === 'connected'; }, onCaption: data => received.push(data)});
  const producer = writer(); await until(() => ready && producer.isOpen());
  const peer = [...relay.wss.clients].find(client => client.role === 'write'), send = peer.send.bind(peer);
  let dropped = false;
  peer.send = (raw, ...args) => {
    if (!dropped && JSON.parse(raw).ack) { dropped = true; return; }
    send(raw, ...args);
  };
  producer.publish({msg: true, final: 'Lost ack test', id: 1});
  await until(() => dropped && producer.getSnapshot().queueLength === 0);
  assert.equal(received.length, 1); assert.equal(relay.stats.duplicates, 1);
});
test('browser reader reconnects after the publisher and resumes each missed caption once', async t => {
  const {writer, reader} = await fixture(t), received = []; let ready = false;
  const viewer = reader({onState: state => { ready = state === 'connected'; }, onCaption: data => received.push(data.id)});
  const producer = writer(); await until(() => ready && producer.isOpen());
  producer.publish({msg: true, final: 'one', id: 1}); await until(() => received.length === 1);
  viewer.disconnect(); await sleep(30);
  producer.publish({msg: true, final: 'two', id: 2}); producer.publish({msg: true, final: 'three', id: 3});
  await until(() => producer.getSnapshot().queueLength === 0);
  viewer.reconnect(); await until(() => received.length === 3); assert.deepEqual(received, [1, 2, 3]);
});
test('publisher queue overflow is explicit and does not replace uncertain in-flight messages', async t => {
  const {writer} = await fixture(t), errors = [];
  const producer = writer({maxQueue: 2, onError: error => errors.push(error)});
  await until(() => producer.isOpen()); producer.disconnect();
  assert.equal(producer.publish({msg: true, final: 'one', id: 1}), true);
  assert.equal(producer.publish({msg: true, final: 'two', id: 2}), true);
  assert.equal(producer.publish({msg: true, final: 'three', id: 3}), false);
  assert.equal(producer.getSnapshot().queueLength, 2); assert.equal(producer.getSnapshot().droppedCount, 1);
  assert.equal(errors.length, 1);
});
