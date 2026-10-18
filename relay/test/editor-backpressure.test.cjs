'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

// Actual page and publisher code, with inert browser, clock and transport boundaries.
async function fixture(mode = 'live', privateRelay = true) {
  let now = 1000, id = 0, receive, publisher;
  const attempts = [];
  const timers = new Map(), intervals = new Map(), elements = new Map(), sockets = [], errors = [];
  function element(name) {
    if (!elements.has(name)) elements.set(name, {value: '', textContent: '', disabled: false,
      classList: {add() {}, toggle() {}}, focus() {}, setSelectionRange() {}, append() {},
      addEventListener(event, fn) { this[event] = fn; }, querySelector: () => element('strong'),
      get parentElement() { return element('parent'); }});
    return elements.get(name);
  }
  class Socket {
    static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
    constructor() { this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    message(data) { this.onmessage?.({data: JSON.stringify(data)}); }
  }
  const location = new URL('https://fixture.invalid/editor.html?room=source&output=audience&mode=' + mode);
  const relay = {custom: () => privateRelay, url: () => 'wss://fixture.invalid',
    setup: async ({room, output}) => ({room, output}), link: url => url,
    join: (room, role) => ({join: room, role}), addViewerLink() {},
    showStatus: (message, error) => { if (error) errors.push(message); }, showGap() {}};
  const context = vm.createContext({URL, URLSearchParams, Uint32Array, JSON,
    Date: class extends Date { static now() { return now; } },
    crypto: {randomUUID: () => 'test-client'}, WebSocket: Socket,
    document: {getElementById: element, querySelector: element, createElement: element, body: element('body')},
    localStorage: {getItem() { return null; }, setItem() {}}, navigator: {},
    console: {error() {}}, setTimeout: (fn, delay) => { timers.set(++id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id), setInterval: fn => { intervals.set(++id, fn); return id; },
    clearInterval: id => intervals.delete(id), CaptionRelay: relay});
  context.window = context; context.location = location;
  context.history = {replaceState() {}}; context.addEventListener = () => {};
  for (const file of ['private-relay-client.js', 'ws-publisher.js'])
    vm.runInContext(readFileSync(join(__dirname, '../..', file), 'utf8'), context);
  const factory = privateRelay ? relay.createPublisher : context.createWSPublisher;
  const captureFactory = options => {
    publisher = factory(options);
    const publish = publisher.publish;
    publisher.publish = payload => { attempts.push(payload); return publish(payload); };
    return publisher;
  };
  if (privateRelay) relay.createPublisher = captureFactory; else context.createWSPublisher = captureFactory;
  relay.subscribe = options => { receive = options.onCaption; return {disconnect() {}}; };
  const html = readFileSync(join(__dirname, '../../editor.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  await vm.runInContext(script, context);
  if (!privateRelay) receive = data => sockets[1].message(data);
  function runReady() {
    for (const [key, timer] of [...timers]) if (!timer.delay) { timers.delete(key); timer.fn(); }
  }
  function tick() { for (const fn of [...intervals.values()]) fn(); runReady(); }
  function drain() {
    const socket = sockets[0];
    if (socket.readyState !== 1) { socket.open(); socket.message({joined: 'audience', role: 'write', protocol: 2, epoch: 'epoch'}); }
    while (publisher.getSnapshot().queueLength) {
      const payload = socket.sent.at(-1);
      socket.message({ack: payload.delivery});
    }
  }
  return {element, receive, publisher, errors, sockets, tick, runReady, drain, attempts,
    advance(ms) { now += ms; tick(); },
    scheduleDue(ms) { now += ms; for (const fn of [...intervals.values()]) fn(); },
    edit(text) { element('editor').value = text; element('editor').input(); },
    mode(value) { element('publishMode').value = value; element('publishMode').change(); },
    send() { element('sendButton').click(); }};
}

for (const trigger of ['click', 'Enter', 'timed', 'live']) {
  test('private rejected final retains corrected caption and successor: ' + trigger, async () => {
    const f = await fixture('live');
    f.receive({final: 'original', label: 'speaker', ln: 'en'});
    f.receive({final: 'successor'});
    for (let i = 0; i < 100 && f.publisher.getSnapshot().queueLength < 100; i++) f.edit('accepted interim');
    assert.equal(f.publisher.getSnapshot().queueLength, 100);
    f.edit('unique unsaved correction');
    if (trigger === 'timed') f.mode('timed');
    if (trigger === 'Enter') f.element('editor').keydown({key: 'Enter', preventDefault() {}});
    else if (trigger === 'timed' || trigger === 'live') f.advance(6000);
    else f.send();
    assert.equal(f.element('editor').value, 'unique unsaved correction');
    assert.match(f.element('queueCount').textContent, /^Queue: 1/);
    assert.equal(f.element('sendButton').disabled, false);
    const drops = f.publisher.getSnapshot().droppedCount;
    for (let i = 0; i < 10; i++) f.advance(250);
    assert.equal(f.publisher.getSnapshot().droppedCount, drops, 'no timer retry loop');
    const finalAttempts = f.attempts.filter(p => Object.hasOwn(p, 'final')).length;
    f.mode('manual'); f.mode('timed'); f.runReady();
    assert.equal(f.attempts.filter(p => Object.hasOwn(p, 'final')).length, finalAttempts, 'mode changes do not retry final');
    f.drain(); f.send();
    assert.equal(f.element('editor').value, 'successor');
    const finals = f.sockets[0].sent.filter(p => p.final === 'unique unsaved correction');
    assert.equal(finals.length, 1);
    assert.equal(finals[0].label, 'speaker'); assert.equal(finals[0].ln, 'en');
    assert.equal(finals[0].delivery.sequence, 101);
  });
}
test('accepted private final advances and explicit skip still discards', async () => {
  const f = await fixture('manual'); f.receive({final: 'one'}); f.receive({final: 'two'});
  f.send(); assert.equal(f.element('editor').value, 'two');
  assert.equal(f.publisher.getSnapshot().queueLength, 1);
  f.element('skipButton').click(); assert.equal(f.element('editor').value, '');
});
test('legacy offline false means queued and must still advance', async () => {
  const f = await fixture('manual', false); f.receive({final: 'one'}); f.receive({final: 'two'});
  f.send(); assert.equal(f.element('editor').value, 'two');
  assert.equal(f.publisher.getSnapshot().queueLength, 1);
});

test('a pending auto-send cannot retry a final rejected by an early click', async () => {
  const f = await fixture('live'); f.receive({final: 'original'});
  for (let i = 0; i < 100 && f.publisher.getSnapshot().queueLength < 100; i++) f.edit('interim');
  assert.equal(f.publisher.getSnapshot().queueLength, 100);
  f.edit('keep this correction'); f.scheduleDue(6000); f.send();
  const attempts = f.attempts.length;
  f.runReady();
  assert.equal(f.attempts.length, attempts);
  assert.equal(f.element('editor').value, 'keep this correction');
  assert.match(f.element('currentTiming').textContent, /press Send to retry/);
});
