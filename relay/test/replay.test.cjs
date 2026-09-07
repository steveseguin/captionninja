'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {randomBytes} = require('node:crypto');
const WebSocket = require('ws');
const {createRelay} = require('../server.cjs');
const {Replay} = require('../replay.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t, limits = {}) {
  const key = () => randomBytes(32).toString('base64url');
  const config = {origins: ['http://localhost'], rooms: {source: {read: key(), write: key()}}};
  const relay = createRelay(config, limits); const address = await relay.listen(0);
  t.after(() => relay.close());
  async function join(role, cursor) {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`); await once(ws, 'open');
    const messages = []; ws.on('message', raw => messages.push(JSON.parse(raw)));
    ws.send(JSON.stringify({join: 'source', role, token: config.rooms.source[role], protocol: 2, ...(cursor ? {cursor} : {})}));
    while (!messages.length) await pause(2);
    return {ws, messages};
  }
  async function publish(writer, number, text = 'caption' + number) {
    const ready = once(writer.ws, 'message');
    writer.ws.send(JSON.stringify({msg: true, id: number, final: text, delivery: {client: 'test-producer-0001', sequence: number}}));
    return JSON.parse((await ready)[0]);
  }
  return {relay, join, publish};
}
test('reader reconnect replays missed captions in order even when producer reconnects first', async t => {
  const {relay, join, publish} = await fixture(t);
  const reader = await join('read'), writer = await join('write');
  await publish(writer, 1); await pause(10);
  const cursor = reader.messages[1].relay; reader.ws.terminate();
  await publish(writer, 2); await publish(writer, 3);
  const resumed = await join('read', cursor); await pause(10);
  assert.deepEqual(resumed.messages.filter(x => x.final).map(x => x.id), [2, 3]);
  assert.equal(relay.stats.replayed, 2);
  const fresh = await join('read'); await pause(10);
  assert.equal(fresh.messages.length, 1, 'new viewer starts live');
});
test('lost acknowledgement retries are deduplicated and identity conflicts are rejected', async t => {
  const {relay, join, publish} = await fixture(t);
  const reader = await join('read'); let writer = await join('write');
  const first = await publish(writer, 1); writer.ws.terminate();
  writer = await join('write'); const retry = await publish(writer, 1); await pause(10);
  assert.equal(first.sequence, retry.sequence); assert.equal(relay.stats.duplicates, 1);
  assert.equal(reader.messages.filter(x => x.final).length, 1);
  const closed = once(writer.ws, 'close');
  writer.ws.send(JSON.stringify({msg: true, id: 1, final: 'changed', delivery: {client: 'test-producer-0001', sequence: 1}}));
  assert.equal((await closed)[0], 1008);
});
test('count eviction and expiry produce explicit reader gaps rather than silent loss', async t => {
  const {relay, join, publish} = await fixture(t, {replayMessages: 2, replayMs: 100});
  const reader = await join('read'), cursor = {epoch: reader.messages[0].epoch, sequence: 0}; reader.ws.terminate();
  const writer = await join('write'); await publish(writer, 1); await publish(writer, 2); await publish(writer, 3);
  const resumed = await join('read', cursor); await pause(5);
  assert.equal(resumed.messages[0].gap, 'history-expired');
  assert.deepEqual(resumed.messages.filter(x => x.final).map(x => x.id), [2, 3]);
  await pause(220); assert.equal(relay.replay.global.size, 0);
});
test('restart epochs are reported and current-process history is replayed', async t => {
  const {join, publish} = await fixture(t);
  const writer = await join('write'); await publish(writer, 1);
  const resumed = await join('read', {epoch: 'previous-process', sequence: 15}); await pause(10);
  assert.equal(resumed.messages[0].gap, 'relay-restarted');
  assert.equal(resumed.messages[1].id, 1);
});
test('global byte/count budgets evict oldest entries and receipts together', () => {
  let now = 0;
  const replay = new Replay(['a', 'b'], {replayMs: 100, replayMessages: 10, replayTotalMessages: 3, replayBytes: 2000}, () => now);
  for (let i = 1; i <= 20; i++) replay.append(i % 2 ? 'a' : 'b', {msg: true, final: 'x'.repeat(100), id: i}, {client: 'test-producer-0001', sequence: i});
  assert.ok(replay.bytes <= 2000); assert.ok(replay.global.size <= 3);
  assert.equal([...replay.rooms.values()].reduce((n, room) => n + room.receipts.size, 0), replay.global.size);
  now = 101; replay.prune(); assert.equal(replay.bytes, 0);
  assert.equal([...replay.rooms.values()].reduce((n, room) => n + room.events.size, 0), 0);
});
