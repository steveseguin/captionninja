const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createPage() {
  const html = fs.readFileSync(path.join(__dirname, '../../transcript.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const sent = [];
  function element(id = '') {
    return {
      id, value: '', checked: false, textContent: '', innerText: '', children: [],
      appendChild(child) { this.children.push(child); },
      set innerHTML(value) { this.children = []; },
      get innerHTML() { return ''; }
    };
  }
  function get(id) {
    if (!elements.has(id)) elements.set(id, element(id));
    return elements.get(id);
  }
  for (const match of html.matchAll(/<input\b([^>]+)>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/);
    if (!id) continue;
    const value = match[1].match(/\bvalue="([^"]*)"/);
    get(id[1]).value = value ? value[1] : '';
    get(id[1]).checked = /\bchecked\b/.test(match[1]);
  }
  const location = new URL('https://caption.example/transcript.html?room=offline-test');
  const context = vm.createContext({
    URL, URLSearchParams, console,
    window: { location, history: { pushState() {} }, open() {} },
    document: { getElementById: get, createElement: () => element() },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    confirm() { return true; }, alert() {}, prompt() {},
    Date: class extends Date { static now() { return now; } },
    WebSocket: class { send(raw) { sent.push({ at: now, payload: JSON.parse(raw) }); } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(script, context, { filename: 'transcript.html' });
  return {
    get,
    click(id) { get(id).onclick.call(get(id)); },
    setText(text) { get('textInput').value = text; get('textInput').oninput(); },
    advance(ms) {
      const end = now + ms;
      let guard = 0;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next || next[1].at > end) break;
        assert.ok(++guard < 1000, 'timer loop must finish');
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
    captions() { return sent.filter(item => item.payload.msg); },
    controls() { return sent.filter(item => item.payload.roll); },
    pending() { return timers.size; },
    delay(text) { return vm.runInContext(`estimateDelayMs(${JSON.stringify(text)})`, context); }
  };
}

const words = ['Alpha.', 'Bravo.', 'Cedar.', 'Delta.', 'Eagle.', 'Foxtrot.'];
function started(options = {}) {
  const page = createPage();
  page.get('controlRoll').checked = !!options.roll;
  page.get('speed').value = String(options.speed || 1);
  page.setText(words.join(' '));
  page.click('playCurrent');
  return page;
}

test('ordinary playback emits each chunk once at its configured pace', () => {
  const page = started();
  const delay = page.delay(words[0]);
  assert.equal(page.captions().length, 1);
  page.advance(delay - 1);
  assert.equal(page.captions().length, 1);
  page.advance(1);
  assert.equal(page.captions().length, 2);
  page.advance(20000);
  assert.deepEqual(page.captions().map(item => item.payload.final), words);
  assert.equal(page.pending(), 0);
});

test('quick pause and resume cancels the old deadline', () => {
  const page = started();
  const delay = page.delay(words[0]);
  page.advance(100); page.click('pauseBtn');
  page.advance(100); page.click('pauseBtn');
  assert.equal(page.captions().length, 2, 'resume preserves immediate next-chunk behavior');
  page.advance(delay - 200);
  assert.equal(page.captions().length, 2, 'old pre-pause timer must not publish another chunk');
  page.advance(200);
  assert.equal(page.captions().length, 3);
  assert.equal(page.pending(), 1);
});

test('repeated quick pause and resume keeps one active playback timer', () => {
  const page = started();
  for (let i = 0; i < 3; i++) {
    page.advance(10); page.click('pauseBtn');
    assert.equal(page.pending(), 0);
    page.advance(10); page.click('pauseBtn');
    assert.equal(page.pending(), 1);
  }
  assert.equal(page.captions().length, 4);
  const delay = page.delay(words[0]);
  page.advance(delay - 60);
  assert.equal(page.captions().length, 4);
  page.advance(60);
  assert.equal(page.captions().length, 5);
});

test('long pause emits nothing and resumes without duplicates', () => {
  const page = started();
  page.click('pauseBtn'); page.advance(10000);
  assert.equal(page.captions().length, 1);
  page.click('pauseBtn'); page.advance(20000);
  assert.deepEqual(page.captions().map(item => item.payload.final), words);
});

test('restart while paused replaces the original schedule', () => {
  const page = started();
  page.advance(50); page.click('pauseBtn');
  page.advance(50); page.click('restartBtn');
  assert.deepEqual(page.captions().map(item => item.payload.final), ['Alpha.', 'Alpha.']);
  page.advance(page.delay(words[0]) - 100);
  assert.equal(page.captions().length, 2);
  page.advance(100);
  assert.equal(page.captions().length, 3);
  assert.equal(page.pending(), 1);
});

test('credits controls remain paired with pause and resume', () => {
  const page = started({ roll: true });
  page.advance(50); page.click('pauseBtn');
  page.advance(50); page.click('pauseBtn');
  assert.deepEqual(page.controls().map(item => item.payload.action), ['load', 'play', 'pause', 'resume']);
  page.advance(page.delay(words[0]) - 100);
  assert.equal(page.captions().length, 2);
  page.advance(20000);
  assert.deepEqual(page.controls().map(item => item.payload.action), ['load', 'play', 'pause', 'resume', 'stop']);
});

test('play all crosses section boundaries with one schedule after resume', () => {
  const page = createPage();
  page.setText('Alpha. Bravo.');
  page.click('addSection'); page.setText('Cedar. Delta.');
  page.click('prevBtn'); page.click('playAll');
  page.advance(50); page.click('pauseBtn');
  page.advance(50); page.click('pauseBtn');
  page.advance(page.delay('Alpha.') - 100);
  assert.deepEqual(page.captions().map(item => item.payload.final), ['Alpha.', 'Bravo.']);
  page.advance(20000);
  assert.deepEqual(page.captions().map(item => item.payload.final), ['Alpha.', 'Bravo.', 'Cedar.', 'Delta.']);
  assert.equal(page.pending(), 0);
});

test('faster speed retains the requested pace after a quick pause', () => {
  const page = started({ speed: 2 });
  page.advance(20); page.click('pauseBtn');
  page.advance(20); page.click('pauseBtn');
  const delay = page.delay(words[0]);
  page.advance(delay - 40);
  assert.equal(page.captions().length, 2);
  page.advance(40);
  assert.equal(page.captions().length, 3);
});
