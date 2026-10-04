'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const CaptureBuffer = require('../../caption-local/audio-buffer.js');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function fixture() {
  const elements = new Map(), requests = [];
  const values = {language: 'en', mode: 'transcribe', relayOutput: 'transcript',
    sensitivity: '0.002', captionInterval: '6', microphone: ''};
  class Option {
    constructor(text, value) { this.text = text; this.value = value; this.disabled = false; }
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, {value: values[id] || '', checked: false,
      options: [new Option('Original', values[id] || '')],
      selectedOptions: [{disabled: false}],
      replaceChildren(...items) { this.options = items; }, add(item) { this.options.push(item); }
    });
    return elements.get(id);
  }
  class AudioContext {
    constructor() { this.sampleRate = 16000; this.state = 'running'; this.audioWorklet = {addModule: async () => {}}; }
    async resume() {}
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    async close() { this.state = 'closed'; }
  }
  class AudioWorkletNode {
    constructor() { this.port = {postMessage: () => this.port.onmessage({data: 'stopped'})}; }
    connect() {} disconnect() {}
  }
  const context = vm.createContext({
    document: {getElementById: element, currentScript: {src: 'http://localhost/static/app.js'}},
    window: {captionLocalConnection: {connected: false, setBusy() {}, fetch: async () => ({ok: true})}, addEventListener() {}},
    navigator: {mediaDevices: {enumerateDevices: async () => [], addEventListener() {},
      getUserMedia: async () => { const track = {stop() {}}; return {getTracks: () => [track]}; }},
      wakeLock: {request() { const request = deferred(); requests.push(request); return request.promise; }}},
    AudioContext, AudioWorkletNode, Option, CaptureBuffer, crypto: webcrypto, URL, URLSearchParams,
    performance, AbortSignal, setTimeout, clearTimeout, setInterval() {}, console
  });
  vm.runInContext(readFileSync(join(__dirname, '../../caption-local/app.js'), 'utf8'), context);
  vm.runInContext("supportedModes = ['transcribe']; multilingual = true; ready = true;", context);
  async function start() {
    const count = requests.length;
    const promise = element('start').onclick();
    // Wait until the real handler reaches the pending wake-lock request.
    for (let i = 0; i < 10 && requests.length === count; i++) await new Promise(setImmediate);
    assert.equal(requests.length, count + 1, element('error').textContent);
    return {promise};
  }
  return {start, stop: () => element('stop').onclick(), requests,
    currentLock: () => vm.runInContext('wakeLock', context)};
}
function lock() { return {releases: 0, async release() { this.releases++; }}; }

test('Stop releases a wake lock that resolves after capture has stopped', async () => {
  const capture = fixture(), {promise} = await capture.start();
  assert.equal(capture.requests.length, 1);
  await capture.stop();
  const stale = lock(); capture.requests[0].resolve(stale); await promise;
  assert.equal(stale.releases, 1);
  assert.equal(capture.currentLock(), null);
});

test('a previous capture cannot replace a newer session wake lock', async () => {
  const capture = fixture(), first = await capture.start();
  await capture.stop();
  const second = await capture.start();
  for (let i = 0; i < 10 && capture.requests.length < 2; i++) await Promise.resolve();
  assert.equal(capture.requests.length, 2);
  const active = lock(); capture.requests[1].resolve(active); await second.promise;
  const stale = lock(); capture.requests[0].resolve(stale); await first.promise;
  assert.equal(stale.releases, 1);
  assert.equal(capture.currentLock(), active);
  await capture.stop(); assert.equal(active.releases, 1);
});

test('normal Stop releases the current capture wake lock once', async () => {
  const capture = fixture(), {promise} = await capture.start();
  const active = lock(); capture.requests[0].resolve(active); await promise;
  assert.equal(capture.currentLock(), active);
  await capture.stop(); assert.equal(active.releases, 1);
  assert.equal(capture.currentLock(), null);
});
