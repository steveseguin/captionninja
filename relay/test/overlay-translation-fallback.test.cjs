const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'overlay.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing source section: ${start}`);
  return text.slice(a, b);
}
function fixture() {
  const rendered = [], statuses = [], replies = [];
  const ctx = {worker: {}, processReply: (meta, interim) => rendered.push({meta, interim}),
    status: text => statuses.push(text), document: {getElementById() {throw Error('Unexpected metadata-free render');}}};
  vm.createContext(ctx);
  vm.runInContext(section(source, 'worker.onmessage = function (e)', '\r\n\t\t\t};') + '\n};', ctx);
  const w = {Date, log() {}, postMessage: message => replies.push(structuredClone(message)),
    translate: (from, to, paragraphs) => {throw Error('Synthetic unavailable model');}};
  vm.createContext(w);
  vm.runInContext(section(workerSource, 'async function handleTranslationMessage(e)', 'const getRemoteFallbackURL'), w);
  async function deliver(meta, kind = 'final', translated = null) {
    if (translated) w.translate = () => translated;
    await w.handleTranslationMessage({data:['translate', 'en', 'fr', [meta[kind]], structuredClone(meta), kind === 'interm']});
    ctx.worker.onmessage({data:replies.at(-1)});
  }
  return {ctx, w, rendered, statuses, replies, deliver};
}
for (const kind of ['final', 'interm']) {
  test(`failed local ${kind} returns unchanged original metadata through normal renderer`, async () => {
    const h = fixture();
    const meta = {[kind]:'Original 日本語 caption', id:7, label:'Speaker', ln:'en', _overlayClearGeneration:3,
      [kind === 'final' ? 'originalFinal' : 'originalInterm']:'Original 日本語 caption'};
    await h.deliver(meta, kind);
    assert.equal(h.replies[0][1], '');
    assert.deepEqual(h.rendered, [{meta, interim:kind === 'interm'}]);
    assert.match(h.statuses[0], /original captions/);
  });
  test(`successful local ${kind} still renders translation`, async () => {
    const h = fixture(); await h.deliver({[kind]:'Original', id:8}, kind, ['Traduit']);
    assert.equal(h.rendered.length, 1); assert.equal(h.rendered[0].meta[kind], 'Traduit');
    assert.deepEqual(h.statuses, []);
  });
}
test('failure does not poison a subsequent successful caption', async () => {
  const h = fixture(); await h.deliver({final:'First', id:1});
  await h.deliver({final:'Second', id:2}, 'final', ['Deuxième']);
  assert.deepEqual(h.rendered.map(x => x.meta.final), ['First', 'Deuxième']);
});
test('metadata-less failure does not invent source text or render empty content', () => {
  const h = fixture(); h.ctx.worker.onmessage({data:['translate_reply','',null,false]});
  assert.equal(h.rendered.length, 0);
});
