'use strict';
// Loopback only. Synthetic captions; no inference or hosted service calls.
const {once} = require('node:events');
const {randomBytes} = require('node:crypto');
const {writeFileSync} = require('node:fs');
const {performance, monitorEventLoopDelay} = require('node:perf_hooks');
const WebSocket = require('ws');
const {createRelay} = require('./server.cjs');
async function main() {
  const seconds = Number(process.argv[2] || 60), filename = process.argv[3];
  if (!filename || !Number.isFinite(seconds) || seconds < 1 || seconds > 3600)
    throw new Error('Usage: node benchmark.cjs SECONDS OUTPUT.json');
  const count = 32, readers = 2, hz = 5;
  const rooms = Object.fromEntries(Array.from({length: count}, (_, i) => ['stream' + i,
    {read: randomBytes(32).toString('base64url'), write: randomBytes(32).toString('base64url')}]));
  const relay = createRelay({origins: ['http://localhost:8080'], rooms});
  const address = await relay.listen(0), url = `ws://127.0.0.1:${address.port}`;
  const writers = [], latency = [], received = new Map(); let errors = 0, sent = 0, peakRss = 0;
  const eventLoop = monitorEventLoopDelay({resolution: 10});
  try {
    for (let i = 0; i < count; i++) {
      const room = 'stream' + i;
      for (let j = 0; j <= readers; j++) {
        const role = j === 0 ? 'write' : 'read', ws = new WebSocket(url);
        await once(ws, 'open');
        const joined = once(ws, 'message'); ws.send(JSON.stringify({join: room, role, token: rooms[room][role]})); await joined;
        ws.on('error', () => errors++); ws.on('close', () => errors++);
        if (!j) writers.push(ws);
        else {
          let last = -1;
          ws.on('message', raw => {
            const data = JSON.parse(raw);
            if (data.label !== room || data.id !== last + 1) errors++;
            last = data.id;
            latency.push(performance.now() - Number(data.ln));
            received.set(room + ':' + j, (received.get(room + ':' + j) || 0) + 1);
          });
        }
      }
    }
    const cpuStart = process.cpuUsage(), start = performance.now(); eventLoop.enable();
    const rounds = Math.floor(seconds * hz);
    for (let id = 0; id < rounds; id++) {
      const next = start + id * 1000/hz;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, next-performance.now())));
      for (let i = 0; i < writers.length; i++) {
        writers[i].send(JSON.stringify({msg: true, id, label: 'stream' + i, ln: String(performance.now()),
          final: ['Hello world.', 'Hola, mundo.', 'Bonjour le monde.', 'Hallo Welt.', 'こんにちは。', 'مرحبا بالعالم.'][i % 6]}));
        sent++;
      }
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
    const deadline = Date.now() + 5000;
    while (latency.length < sent * readers && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10));
    const elapsed = performance.now() - start, cpu = process.cpuUsage(cpuStart); eventLoop.disable();
    latency.sort((a, b) => a-b);
    const pct = q => latency[Math.min(latency.length-1, Math.floor(q*latency.length))];
    const result = {scope: 'loopback relay + Node producers/viewers in one process; no speech inference',
      node: process.version, platform: process.platform, streams: count, viewers_per_stream: readers,
      connections: count*(readers+1), caption_hz_per_stream: hz, requested_seconds: seconds,
      elapsed_seconds: elapsed/1000, published: sent, delivered: latency.length,
      errors, passed: errors === 0 && latency.length === sent*readers && received.size === count*readers,
      latency_ms: {median: pct(.5), p95: pct(.95), p99: pct(.99), max: latency.at(-1)},
      event_loop_p99_ms: eventLoop.percentile(99)/1e6, peak_rss_mib: peakRss/1048576,
      mean_cpu_cores: (cpu.user+cpu.system)/(elapsed*1000), relay_counters: relay.stats};
    writeFileSync(filename, JSON.stringify(result, null, 2)+'\n'); console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } finally { eventLoop.disable(); await relay.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
