const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const pagePath = process.env.CAPTION_OVERLAY_SOURCE || path.resolve(__dirname, '../../overlay.html');
const source = fs.readFileSync(pagePath, 'utf8');
const start = source.indexOf('\tvar sanitize = function(string)');
const end = source.indexOf('\n\t// connectWebSocket owns reconnects.', start);
assert.ok(start >= 0 && end > start, 'locate actual overlay rendering code');

// These inert DOM doubles cover serialization and the simple HTML/entity forms
// below. They do not execute HTML, contact a relay, or claim browser coverage.
function decodeText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return String(html).replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
    if (name[0] === '#') return String.fromCodePoint(parseInt(name.slice(name[1].toLowerCase() === 'x' ? 2 : 1), name[1].toLowerCase() === 'x' ? 16 : 10));
    return entities[name.toLowerCase()] || whole;
  });
}

function element() {
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = String(value); },
    get textContent() { return decodeText(html); },
    set textContent(value) { html = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    get innerText() { return decodeText(html); }
  };
}

function harness(options = {}) {
  const elements = { output: element(), interm: element() };
  const spoken = [];
  const context = {
    allowHTML: false, dualOverlay: false, label: '', interimMaxLines: 0,
    intermClear: false, clearOnNew: false, timeoutSpeed: 0, idle: null,
    document: { createElement: element, getElementById: (id) => elements[id] },
    urlParams: new URLSearchParams(), window: {}, console: { log() {}, warn() {} },
    tts: { speak: (text) => spoken.push(text) },
    enforceMaxLines() {}, adjustIntermVisibility() {},
    clearInterval() {}, setTimeout() {}, ...options
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context, { filename: 'overlay.html rendering source' });
  return { context, elements, spoken };
}

for (const [name, frame, target, expected] of [
  ['ordinary final', { final: 'Fish & chips' }, 'output', '<span>Fish &amp; chips</span><br/>'],
  ['encoded ampersand', { final: 'Fish &amp; chips' }, 'output', '<span>Fish &amp; chips</span><br/>'],
  ['encoded named markup', { final: '&lt;b&gt;example&lt;/b&gt;' }, 'output', '<span>&lt;b&gt;example&lt;/b&gt;</span><br/>'],
  ['encoded numeric markup', { final: '&#60;b&#62;example&#60;/b&#62;' }, 'output', '<span>&lt;b&gt;example&lt;/b&gt;</span><br/>'],
  ['encoded hexadecimal markup', { final: '&#x3c;b&#x3e;example&#x3c;/b&#x3e;' }, 'output', '<span>&lt;b&gt;example&lt;/b&gt;</span><br/>'],
  ['encoded interim', { interm: '&lt;b&gt;draft&lt;/b&gt;' }, 'interm', '<span>&lt;b&gt;draft&lt;/b&gt;</span><br/>'],
  ['raw markup remains stripped', { final: '<b>example</b>' }, 'output', '<span>example</span><br/>'],
  ['quotes and Unicode remain text', { final: '"Hola", déjà vu 日本語' }, 'output', '<span>"Hola", déjà vu 日本語</span><br/>'],
  ['only one decode pass', { final: '&amp;lt;b&amp;gt;' }, 'output', '<span>&amp;lt;b&amp;gt;</span><br/>'],
  ['empty final', { final: '' }, 'output', '']
]) {
  test(name, () => {
    const h = harness();
    h.context.processReply(frame);
    assert.equal(h.elements[target].innerHTML, expected);
  });
}

test('encoded speaker label stays text and preserves underscore display', () => {
  const h = harness();
  h.context.processReply({ label: '&lt;b&gt;First_Last&lt;/b&gt;', final: 'hello' });
  assert.equal(h.elements.output.innerHTML, '<span class=\'label\'>&lt;b&gt;First Last&lt;/b&gt;: </span><span>hello</span><br/>');
});

test('dual translation and original both stay text', () => {
  const h = harness({ dualOverlay: true });
  h.context.processReply({ final: '&lt;b&gt;translated&lt;/b&gt;', originalFinal: '&lt;i&gt;original&lt;/i&gt;' });
  assert.equal(h.elements.output.innerHTML, '<span class="dual-line"><span class="dual-translation">&lt;b&gt;translated&lt;/b&gt;</span><span class="dual-original">&lt;i&gt;original&lt;/i&gt;</span></span><br/>');
});

test('explicit html option still permits markup', () => {
  const h = harness({ allowHTML: true });
  h.context.processReply({ label: '<b>Host</b>', final: '<i>hello</i>' });
  assert.equal(h.elements.output.innerHTML, '<span class=\'label\'><b>Host</b>: </span><span><i>hello</i></span><br/>');
});

test('caption limit applies to decoded characters before escaping', () => {
  const h = harness();
  assert.equal(h.context.sanitize('&lt;'.repeat(501)), '&lt;'.repeat(500));
});

test('new final clears interim and clear control clears output', () => {
  const h = harness();
  h.context.processReply({ interm: '&lt;b&gt;draft&lt;/b&gt;' });
  h.context.processReply({ final: 'first' });
  assert.equal(h.elements.interm.innerHTML, '');
  h.context.processReply({ final: '', c: true });
  assert.equal(h.elements.output.innerHTML, '');
});

test('TTS receives the unmodified caption value', () => {
  const h = harness();
  h.context.processReply({ final: 'Fish &amp; chips' });
  assert.deepEqual(h.spoken, ['Fish &amp; chips']);
});
