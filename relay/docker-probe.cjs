'use strict';
// Isolated Linux Docker validation. Creates and cleans up only its own resources.
const {execFileSync} = require('node:child_process');
const {mkdtempSync, writeFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve, dirname} = require('node:path');
const {randomBytes} = require('node:crypto');
const {once} = require('node:events');
const WebSocket = require('ws');
async function main() {
  if (process.platform !== 'linux') throw new Error('This probe targets Linux Docker; native Windows tests are separate');
  const id = randomBytes(8).toString('hex'), name = 'caption-relay-probe-' + id, image = 'caption-relay-probe:' + id;
  const directory = mkdtempSync(join(tmpdir(), 'caption-relay-probe-'));
  const filename = join(directory, 'rooms.json');
  const config = {origins: ['https://caption.example'], rooms: {source: {
    read: randomBytes(32).toString('base64url'), write: randomBytes(32).toString('base64url')}}};
  writeFileSync(filename, JSON.stringify(config), {mode: 0o600});
  const docker = (...args) => execFileSync('docker', args, {cwd: __dirname, encoding: 'utf8', timeout: 180000}).trim();
  const sockets = [];
  try {
    docker('build', '--quiet', '-t', image, '.');
    docker('run', '--detach', '--rm', '--name', name, '--user', `${process.getuid()}:${process.getgid()}`,
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '128m',
      '--publish', '127.0.0.1::8787', '--mount', `type=bind,src=${filename},dst=/run/rooms.json,readonly`, image);
    const host = docker('port', name, '8787/tcp');
    if (!/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('Expected a loopback-only container port');
    let health;
    for (let i = 0; i < 100; i++) {
      try { health = await (await fetch(`http://${host}/health`)).json(); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    if (health?.protocol !== 2) throw new Error('Container did not become ready');
    async function connect(role) {
      const ws = new WebSocket(`ws://${host}`); sockets.push(ws); await once(ws, 'open');
      const ack = once(ws, 'message'); ws.send(JSON.stringify({join: 'source', role, protocol: 2, token: config.rooms.source[role]}));
      await ack; return ws;
    }
    const reader = await connect('read'), writer = await connect('write');
    const delivery = once(reader, 'message'), ack = once(writer, 'message');
    writer.send(JSON.stringify({msg: true, final: 'Synthetic container caption', id: 42,
      delivery: {client: 'container-producer-01', sequence: 1}}));
    if (JSON.parse((await delivery)[0]).id !== 42 || JSON.parse((await ack)[0]).ack.sequence !== 1)
      throw new Error('Container protocol failed');
    sockets.forEach(ws => ws.terminate());
    docker('stop', '--time', '5', name);
    console.log(JSON.stringify({passed: true, scope: 'Linux Docker build, unprivileged read-only container, loopback authenticated relay delivery and shutdown',
      docker: docker('version', '--format', '{{.Server.Version}}'), node: process.version}));
  } finally {
    sockets.forEach(ws => ws.terminate());
    try { docker('rm', '--force', name); } catch {}
    try { docker('image', 'rm', image); } catch {}
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected temporary directory');
    rmSync(directory, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
