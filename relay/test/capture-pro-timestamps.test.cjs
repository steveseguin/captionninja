const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(
  process.env.CAPTURE_PRO_SOURCE || path.join(__dirname, '../../capture-pro.html'),
  'utf8'
);
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).join('\n');

function setup() {
  let now = 1700000000000;
  let timerId = 0;
  const elements = new Map();
  const timers = new Map();
  const downloads = [];
  const published = [];
  const documentHandlers = {};
  const storage = new Map();

  function element(id, tag = 'div') {
    if (!elements.has(id)) {
      elements.set(id, {
        tagName: tag.toUpperCase(), textContent: '', innerHTML: '', style: {},
        value: id === 'pauseMs' ? '600' : id === 'lineLen' ? '42' : '',
        checked: id === 'speakerTag',
        classList: { add() {}, remove() {}, toggle() {} },
        handlers: {},
        addEventListener(type, fn) { this.handlers[type] = fn; },
        click() {
          this.handlers.click?.call(this);
          if (this.tagName === 'A') {
            downloads.push({
              name: this.download,
              text: decodeURIComponent(this.href.slice(this.href.indexOf(',') + 1))
            });
          }
        },
        appendChild() {}, remove() {}
      });
    }
    return elements.get(id);
  }

  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  class Recognition { start() {} stop() {} }

  const context = {
    console, URL, URLSearchParams, Uint8Array, Date: ClockDate,
    location: {
      search: '?room=timestamp-test',
      href: 'https://caption.ninja/capture-pro.html?room=timestamp-test'
    },
    history: { replaceState() {} },
    webkitSpeechRecognition: Recognition,
    addEventListener() {},
    document: {
      URL: 'https://caption.ninja/capture-pro.html?room=timestamp-test',
      activeElement: null,
      getElementById: element,
      createElement: tag => element(Symbol(tag), tag),
      querySelector: element,
      addEventListener(type, fn) { documentHandlers[type] = fn; },
      body: { appendChild() {}, removeChild() {} }
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    setTimeout(fn, delay) {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    setInterval() {}, alert() {}, confirm: () => true,
    createWSPublisher: () => ({
      connect() {}, publish: message => published.push(message)
    })
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'capture-pro.html' });

  return {
    context, element, downloads, published, storage,
    advance(ms) { now += ms; },
    result(text, isFinal) {
      const result = Object.assign([{ transcript: text }], { isFinal });
      context.recognition.onresult({ resultIndex: 0, results: [result] });
    },
    flushTimer() {
      const [id, timer] = [...timers].find(([, value]) => value.delay === 600);
      timers.delete(id);
      now += timer.delay;
      timer.fn();
    },
    shortcut() {
      let prevented = false;
      documentHandlers.keydown({ ctrlKey: true, key: 's', preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    }
  };
}

for (const [ms, expected] of [
  [0, '00:00:00,000'],
  [1, '00:00:00,001'],
  [99, '00:00:00,099'],
  [500, '00:00:00,500'],
  [999, '00:00:00,999'],
  [1000, '00:00:01,000'],
  [1100, '00:00:01,100'],
  [1600, '00:00:01,600'],
  [59999, '00:00:59,999'],
  [60000, '00:01:00,000'],
  [60001, '00:01:00,001'],
  [3599999, '00:59:59,999'],
  [3600000, '01:00:00,000'],
  [3600123, '01:00:00,123'],
  [86399999, '23:59:59,999']
]) {
  test(`formatSrtTime preserves ${ms} ms`, () => {
    assert.equal(setup().context.formatSrtTime(ms), expected);
  });
}

for (const flow of ['download', 'silence', 'pause', 'shortcut']) {
  test(`SRT ${flow} preserves a positive subsecond cue`, () => {
    const h = setup();
    h.element('btnToggle').click();
    h.advance(1100);
    h.result('Short', false);
    h.advance(500);
    h.result('Short caption', true);
    if (flow === 'silence') h.flushTimer();
    if (flow === 'pause') h.element('btnToggle').click();
    if (flow === 'shortcut') h.shortcut();
    else h.element('btnDownload').click();

    assert.equal(h.context.cues.length, 1);
    assert.equal(h.context.cues[0].startMs, 1100);
    assert.equal(h.context.cues[0].endMs, 1600);
    assert.equal(h.downloads.length, 1);
    assert.match(h.downloads[0].name, /^transcription_timestamp-test_\d+\.srt$/);
    assert.equal(h.downloads[0].text,
      '1\n00:00:01,100 --> 00:00:01,600\n>> Short caption\n\n');
    assert.equal(h.published.filter(message => message.final).length, 1);
    const saved = JSON.parse([...h.storage.values()][0]);
    assert.equal(saved.cues[0].startMs, 1100);
    assert.equal(saved.cues[0].endMs, 1600);
  });
}

test('SRT and WebVTT helper share precise timestamps without mutating cues', () => {
  const h = setup();
  h.context.cues = [
    { startMs: 1900, endMs: 2100, text: 'Cross-second cue' },
    { startMs: 59999, endMs: 60001, text: 'Cross-minute cue' }
  ];
  const before = JSON.stringify(h.context.cues);
  assert.match(h.context.buildSrt(), /00:00:01,900 --> 00:00:02,100/);
  assert.match(h.context.buildSrt(), /00:00:59,999 --> 00:01:00,001/);
  assert.match(h.context.buildVtt(), /^WEBVTT\n\n00:00:01\.900 --> 00:00:02\.100/);
  assert.match(h.context.buildVtt(), /00:00:59\.999 --> 00:01:00\.001/);
  assert.equal(JSON.stringify(h.context.cues), before);
});

test('whole-second export, speaker option and empty output remain compatible', () => {
  const h = setup();
  assert.equal(h.context.buildSrt(), '');
  assert.equal(h.context.buildVtt(), 'WEBVTT\n\n');
  h.context.cues = [{ startMs: 1000, endMs: 3000, text: 'Control caption' }];
  h.element('speakerTag').checked = false;
  assert.equal(h.context.buildSrt(), '1\n00:00:01,000 --> 00:00:03,000\nControl caption\n\n');
  assert.equal(h.context.buildTxt(), 'Control caption\n');
});
