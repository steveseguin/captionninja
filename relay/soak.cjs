'use strict';
// Real sockets and the browser's reliable client, entirely on loopback.
const {randomBytes, webcrypto, createHash} = require('node:crypto');
const {readFileSync, writeFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const WebSocket = require('ws');
const {createRelay} = require('./server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const seconds = Number(process.argv[2]), output = process.argv[3], audience = Number(process.argv[4] || 100);
  if (!output || !Number.isFinite(seconds) || seconds < 10 || seconds > 7200 ||
      !Number.isInteger(audience) || audience < 32 || audience > 400)
    throw new Error('Usage: node soak.cjs SECONDS OUTPUT.json [TOTAL_VIEWERS=100]');
  const rooms = Object.fromEntries(Array.from({length: 32}, (_, i) => ['stream' + i,
    {read: randomBytes(32).toString('base64url'), write: randomBytes(32).toString('base64url')}]));
  // All 132+ clients share one loopback IP. Record this explicit admission setting.
  const relay = createRelay({origins: ['http://localhost'], rooms, limits: {perIp: 512}});
  const address = await relay.listen(0);
  const window = {CaptionRelay: {url: () => `ws://127.0.0.1:${address.port}/`, join: (room, role, token) => ({join: room, role, token})}};
  const source = readFileSync(join(__dirname, '../private-relay-client.js'), 'utf8');
  const hashes = {client: createHash('sha256').update(source).digest('hex'),
    server: createHash('sha256').update(readFileSync(join(__dirname, 'server.cjs'))).digest('hex'),
    replay: createHash('sha256').update(readFileSync(join(__dirname, 'replay.cjs'))).digest('hex')};
  vm.runInNewContext(source, {window, WebSocket, crypto: webcrypto, Date, JSON, setTimeout, clearTimeout, setInterval, clearInterval});
  const api = window.CaptionRelay, writers = [], readers = [], samples = [], timers = [];
  const histogram = new Uint32Array(60001), counts = new Uint32Array(audience);
  let ready = 0, errors = 0, gaps = 0, duplicates = 0, delivered = 0, maximum = 0, sum = 0, injected = 0;
  const languages = ['en', 'es', 'fr', 'de', 'ja', 'ar'];
  const captions = ['Hello world.', 'Hola, mundo.', 'Bonjour le monde.', 'Hallo Welt.', 'こんにちは。', 'مرحبا بالعالم.'];
  try {
    for (let i = 0; i < audience; i++) {
      const room = 'stream' + i % 32; let last = -1, initial = true;
      readers.push(api.subscribe({room, token: rooms[room].read,
        onState(state) { if (initial && state === 'connected') { initial = false; ready++; } if (state === 'denied') errors++; },
        onGap() { gaps++; },
        onCaption(data) {
          const [label, timestamp] = data.label.split('|');
          if (data.id <= last) duplicates++;
          if (label !== room || data.id !== last + 1) errors++;
          last = data.id; counts[i]++; delivered++;
          const latency = performance.now() - Number(timestamp); maximum = Math.max(maximum, latency); sum += latency;
          histogram[Math.min(60000, Math.max(0, Math.ceil(latency * 10)))]++;
        }}));
    }
    for (let i = 0; i < 32; i++) {
      const room = 'stream' + i; let initial = true;
      const writer = api.createPublisher({room, relayToken: rooms[room].write, maxQueue: 100,
        onStateChange(state) { if (initial && state === 'connected') { initial = false; ready++; } if (state === 'denied') errors++; },
        onError() { errors++; }});
      writers.push(writer); writer.connect();
    }
    const deadline = Date.now() + 10000;
    while (ready < audience + 32 && Date.now() < deadline) await sleep(20);
    if (ready !== audience + 32) throw new Error('Not all clients became ready');
    const start = performance.now(), cpuStart = process.cpuUsage(), startedAt = new Date().toISOString();
    const rounds = Math.floor(seconds * 5);
    for (let id = 0; id < rounds; id++) {
      await sleep(Math.max(0, start + id * 200 - performance.now()));
      if (id > 0 && id % 300 === 50 || id === 25) {
        const index = injected++ % audience; readers[index].disconnect();
        timers.push(setTimeout(() => readers[index].reconnect(), 2000));
        const writer = writers[index % 32]; writer.disconnect();
        timers.push(setTimeout(() => writer.connect(), 1000));
      }
      for (let i = 0; i < 32; i++) writers[i].publish({msg: true, final: captions[i % 6], ln: languages[i % 6],
        label: 'stream' + i + '|' + performance.now(), id});
      if (id % 50 === 0) samples.push({seconds: (performance.now()-start)/1000, rss: process.memoryUsage().rss,
        heap: process.memoryUsage().heapUsed, retainedBytes: relay.replay.bytes, retainedMessages: relay.replay.global.size,
        maximumQueue: Math.max(...writers.map(w => w.getSnapshot().queueLength)), errors, gaps, delivered});
      if (id % 300 === 0) console.log(JSON.stringify({seconds: Math.round((performance.now()-start)/1000), delivered, errors, gaps}));
    }
    await sleep(Math.max(0, start + seconds * 1000 - performance.now()));
    const drain = Date.now() + 10000;
    while ((delivered < rounds * audience || writers.some(w => w.getSnapshot().queueLength)) && Date.now() < drain) await sleep(20);
    const elapsed = (performance.now()-start)/1000, cpu = process.cpuUsage(cpuStart);
    const percentile = q => { let total = 0; for (let i = 0; i < histogram.length; i++) { total += histogram[i]; if (total >= delivered * q) return i/10; } return null; };
    const result = {scope: 'real private protocol v2; Node clients and server share a loopback process, no speech inference',
      startedAt, node: process.version, platform: process.platform, producerStreams: 32, viewers: audience, connections: audience + 32,
      requestedSeconds: seconds, elapsedSeconds: elapsed, rounds, captionHz: 5, expectedDeliveries: rounds * audience,
      delivered, errors, duplicates, gaps, injectedDisconnectPairs: injected,
      latencyMs: {mean: sum/delivered, p95: percentile(.95), p99: percentile(.99), max: maximum, histogramResolution: .1},
      meanCpuCores: (cpu.user + cpu.system)/(elapsed * 1e6), peakRssMiB: Math.max(...samples.map(s => s.rss))/1048576,
      warmRssGrowthMiB: (Math.max(...samples.slice(Math.min(12, samples.length-1)).map(s => s.rss)) - samples[Math.min(12, samples.length-1)].rss)/1048576,
      limits: relay.limits, stats: relay.stats, samples,
      sourceSha256: hashes,
      passed: errors === 0 && duplicates === 0 && gaps === 0 && delivered === rounds * audience &&
        [...counts].every(count => count === rounds) && writers.every(w => w.getSnapshot().queueLength === 0 && w.getSnapshot().droppedCount === 0)};
    writeFileSync(output, JSON.stringify(result, null, 2)+'\n');
    console.log(JSON.stringify({...result, samples: result.samples.length}, null, 2));
    if (!result.passed) process.exitCode = 1;
  } finally { timers.forEach(clearTimeout); writers.forEach(w => w.disconnect()); readers.forEach(r => r.disconnect()); await relay.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
