'use strict';
const {readFileSync} = require('node:fs');
const {once} = require('node:events');
const {performance} = require('node:perf_hooks');
const WebSocket = require('ws');
async function main() {
  const [url, configPath, caPath] = process.argv.slice(2);
  if (!url || !configPath || !caPath) throw new Error('Usage: node tls-probe.cjs WSS_URL PRIVATE_CONFIG CA_CERT');
  const config = JSON.parse(readFileSync(configPath)), ca = readFileSync(caPath);
  async function joined(role, token = config.rooms.source[role]) {
    const ws = new WebSocket(url, {ca, origin: config.origins[0]}); await once(ws, 'open');
    const response = once(ws, 'message');
    ws.send(JSON.stringify({join: 'source', role, token, protocol: 2}));
    await response; return ws;
  }
  let reader, writer;
  try {
    let certificateRejected = false;
    const untrusted = new WebSocket(url); untrusted.on('error', () => {});
    try { await once(untrusted, 'open'); } catch { certificateRejected = true; }
    finally { untrusted.terminate(); }
    if (!certificateRejected) throw new Error('Untrusted certificate was accepted');
    reader = await joined('read'); writer = await joined('write');
    const delivered = once(reader, 'message'), ack = once(writer, 'message'), started = performance.now();
    writer.send(JSON.stringify({msg: true, id: 1, final: 'Synthetic TLS caption.',
      delivery: {client: 'tls-test-producer-001', sequence: 1}}));
    const caption = JSON.parse((await delivered)[0]), accepted = JSON.parse((await ack)[0]);
    if (caption.final !== 'Synthetic TLS caption.' || accepted.ack.sequence !== 1) throw new Error('TLS routing failed');
    const deliveryMs = performance.now()-started;
    const bad = new WebSocket(url, {ca, origin: config.origins[0]}); await once(bad, 'open');
    const closed = once(bad, 'close'); bad.send(JSON.stringify({join: 'source', role: 'write', token: 'x'.repeat(43)}));
    if ((await closed)[0] !== 1008) throw new Error('Invalid token accepted');
    console.log(JSON.stringify({passed: true, node: process.version, certificateVerification: true,
      untrustedCertificateRejected: true, invalidTokenRejected: true, acknowledgedPublish: true,
      captionDeliveryMs: deliveryMs, scope: 'WSS through real TLS proxy with explicit test CA; no browser trust bypass'}));
  } finally { reader?.terminate(); writer?.terminate(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
