'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../../capture-pro.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function harness() {
  let now = 100000, nextTimer = 1, approved = true;
  const timers = new Map(), elements = new Map(), published = [], downloads = [], listeners = {};
  function element(id) {
    const handlers = {};
    return { id, style: {}, value: '', checked: false, textContent: '', innerHTML: '',
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { handlers[type] = fn; },
      click() { if (id === 'a') downloads.push(decodeURIComponent(this.href.split(',').slice(1).join(','))); if (handlers.click) handlers.click.call(this); },
      appendChild() {}, removeChild() {}, remove() {} };
  }
  const document = { URL: 'https://example.test/capture-pro.html?room=test', activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement: element, body: element('body'), querySelector() { return element('toolbar'); },
    addEventListener(type, fn) { listeners[type] = fn; } };
  document.getElementById('pauseMs').value = '600';
  document.getElementById('lineLen').value = '42';
  document.getElementById('speakerTag').checked = true;
  const storage = {};
  const localStorage = { setItem(k, v) { storage[k] = v; }, getItem(k) { return storage[k] ?? null; }, removeItem(k) { delete storage[k]; } };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  function Recognition() { this.start = () => {}; this.stop = () => {}; }
  const context = { document, URL, URLSearchParams, Date: ClockDate, console, localStorage,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    confirm: () => approved, alert() {}, webkitSpeechRecognition: Recognition,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    createWSPublisher: () => ({ connect() {}, publish(data) { published.push(data); } }),
    location: { search: '?room=test', href: document.URL }, history: { replaceState() {} },
    addEventListener(type, fn) { listeners[type] = fn; } };
  context.window = context;
  vm.createContext(context); vm.runInContext(script, context);
  const click = id => document.getElementById(id).click();
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = end;
  }
  function result(text, final = true) {
    const item = [{ transcript: text }]; item.isFinal = final;
    context.recognition.onresult({ resultIndex: 0, results: [item] });
  }
  click('btnToggle');
  return { context, elements, published, downloads, storage, timers, click, advance, result,
    cancel() { approved = false; },
    keySave() { listeners.keydown({ ctrlKey: true, key: 's', preventDefault() {} }); },
    unload() { listeners.beforeunload(); } };
}
function assertEmpty(h) {
  assert.equal(h.context.cues.length, 0);
  assert.equal(h.elements.get('final').innerHTML, '');
  assert.equal(h.elements.get('interm').textContent, '');
  assert.equal(h.published.filter(p => 'final' in p).length, 0);
}

for (const action of ['deadline', 'download', 'shortcut', 'pause', 'unload']) {
  test(`Clear discards buffered final before ${action}`, () => {
    const h = harness(); h.advance(100); h.result('discard this'); h.click('btnMark'); h.click('btnClear');
    if (action === 'deadline') h.advance(1000);
    if (action === 'download') h.click('btnDownload');
    if (action === 'shortcut') h.keySave();
    if (action === 'pause') h.click('btnToggle');
    if (action === 'unload') h.unload();
    assertEmpty(h); assert.equal(h.context.chapters.length, 0);
    assert.ok(h.downloads.every(text => text === ''));
    assert.ok(Object.values(h.storage).every(text => !text.includes('discard this')));
  });
}
test('Clear cancels the old deadline before new captions and keeps their own deadline', () => {
  const h = harness(); h.result('old'); h.advance(100); h.click('btnClear');
  assert.equal(h.timers.size, 0);
  h.result('new interim', false); h.advance(500); assertEmptyFinal();
  h.result('fresh final'); h.advance(599); assertEmptyFinal(); h.advance(1);
  assert.equal(h.context.cues.length, 1); assert.equal(h.context.cues[0].text, 'fresh final');
  assert.equal(h.published.filter(p => 'final' in p).length, 1);
  h.advance(1000); assert.equal(h.context.cues.length, 1);
  function assertEmptyFinal() { assert.equal(h.context.cues.length, 0); }
});
test('Clear resets interim-only aggregation without changing session timing or recognition', () => {
  const h = harness(); h.advance(100); h.result('old interim', false);
  const recognition = h.context.recognition, epoch = h.context.startEpoch;
  h.click('btnClear'); h.advance(200); h.result('new interim', false); h.advance(100); h.result('new final'); h.advance(600);
  assert.equal(h.context.cues[0].startMs, 300); assert.equal(h.context.cues[0].text, 'new final');
  assert.equal(h.context.startEpoch, epoch); assert.equal(h.context.recognition, recognition);
  assert.equal(h.context.isRunning, true);
});
test('Canceling Clear preserves buffered captions, chapters and timer', () => {
  const h = harness(); h.result('keep this'); h.click('btnMark'); const timer = h.context.silenceTimer;
  h.cancel(); h.click('btnClear'); assert.equal(h.context.silenceTimer, timer);
  h.advance(600); assert.equal(h.context.cues[0].text, 'keep this'); assert.equal(h.context.chapters.length, 1);
  assert.equal(h.published.filter(p => 'final' in p).length, 1);
});
test('Repeated Clear while running or paused remains empty and permits fresh captions', () => {
  const h = harness(); h.result('discard'); h.click('btnClear'); h.click('btnClear'); h.click('btnToggle');
  h.click('btnClear'); h.advance(1000); assertEmpty(h);
  h.click('btnToggle'); h.result('resumed'); h.advance(600);
  assert.equal(h.context.cues.length, 1); assert.equal(h.context.cues[0].text, 'resumed');
});
test('Clear removes completed cues and their persisted snapshot', () => {
  const h = harness(); h.result('completed'); h.advance(600);
  assert.ok(h.storage[h.context.saveKey]); h.click('btnClear');
  assert.equal(h.context.cues.length, 0); assert.equal(h.storage[h.context.saveKey], undefined);
  h.click('btnDownload'); assert.equal(h.downloads[0], '');
});
