const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../overlay.html'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing source section: ${start}`);
  return source.slice(a, b);
}
function setup(langTo = null, remote = false) {
  const nodes = {output: {innerHTML: ''}, interm: {innerHTML: ''}};
  const requests = [];
  const workerMessages = [];
  const ctx = {
    console, langTo, langFrom: 'en', autoDetectLang: false, useContext: false,
    interimMaxLines: null, intermClear: false, dualOverlay: false, currentLanguage: 'en', remoteTranslationEnabled: remote,
    document: {getElementById: id => nodes[id]}, window: {}, urlParams: new URLSearchParams(),
    tts: {speak() {}}, clearOnNew: false, idle: null, timeoutSpeed: 0,
    enforceMaxLines() {}, adjustIntermVisibility() {}, clearInterval,
    buildLineMarkup: text => text ? `<span>${text}</span><br/>` : '',
    worker: remote ? null : {postMessage: data => workerMessages.push(structuredClone(data))},
    translateViaProvider: text => new Promise(resolve => requests.push({text, resolve})),
  };
  vm.createContext(ctx);
  const initialization = source.match(/var overlayClearGeneration = 0;/)?.[0] || '';
  vm.runInContext(initialization + '\n' +
    section('var translateCall = async', '\n\r\n\t\tif (worker)') +
    section('function handleSocketMessage(event)', '\n\tvar privateViewer') +
    section('function processReply(data)', '\n\t// connectWebSocket owns'), ctx);
  if (ctx.worker) {
    vm.runInContext(section('worker.onmessage = function (e)', '\r\n\t\t\t};') + '\n};', ctx);
  }
  const pending = [];
  const translate = ctx.translateCall;
  ctx.translateCall = (...args) => { const promise = translate(...args); pending.push(promise); return promise; };
  return {ctx, nodes, requests, workerMessages, pending,
    send: data => ctx.handleSocketMessage({data: JSON.stringify(data)})};
}
const editor = fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8');
const clearExpression = editor.match(/publisher\.publish\((\{ msg: true, final: '', id: publishCounter, c: true \})\)/)[1];
const clear = vm.runInNewContext('(' + clearExpression + ')', {publishCounter: 2});

for (const language of [null, 'en', 'es']) {
  test(`editor clear removes both caption layers with translation ${language}`, async () => {
    const h = setup(language);
    h.nodes.output.innerHTML = 'Previous final'; h.nodes.interm.innerHTML = 'Previous interim';
    h.send(clear);
    await Promise.all(h.pending);
    assert.equal(h.nodes.output.innerHTML, ''); assert.equal(h.nodes.interm.innerHTML, '');
    assert.equal(h.workerMessages.length, 0);
  });
}
for (const kind of ['final', 'interm']) {
  test(`remote ${kind} translation pending at clear cannot restore old text`, async () => {
    const h = setup('es', true);
    h.send({[kind]: 'old', id: 1});
    h.send(clear);
    h.send({final: 'new', id: 3});
    h.requests[1].resolve('nuevo'); await h.pending[1];
    h.requests[0].resolve('viejo'); await h.pending[0];
    assert.equal(h.nodes.output.innerHTML, '<span>nuevo</span><br/>');
    assert.equal(h.nodes.interm.innerHTML, '');
  });
  test(`local worker ${kind} result pending at clear cannot restore old text`, async () => {
    const h = setup('es');
    h.send({[kind]: 'old', id: 1}); await Promise.all(h.pending);
    const old = h.workerMessages[0];
    h.send(clear);
    h.ctx.worker.onmessage({data: ['translate_reply', ['viejo'], old[4], old[5]]});
    assert.equal(h.nodes.output.innerHTML, ''); assert.equal(h.nodes.interm.innerHTML, '');
    h.send({[kind]: 'new', id: 3}); await Promise.all(h.pending);
    const fresh = h.workerMessages[1];
    h.ctx.worker.onmessage({data: ['translate_reply', ['nuevo'], fresh[4], fresh[5]]});
    assert.equal(h.nodes[kind === 'final' ? 'output' : 'interm'].innerHTML, '<span>nuevo</span><br/>');
  });
}
test('ordinary interim, final append, and nonempty replacement captions retain behavior', () => {
  const h = setup();
  h.send({interm: 'partial', id: 1});
  assert.equal(h.nodes.interm.innerHTML, '<span>partial</span><br/>');
  h.send({final: 'one', id: 1}); h.send({final: 'two', id: 2});
  assert.equal(h.nodes.output.innerHTML, '<span>one</span><br/><span>two</span><br/>');
  assert.equal(h.nodes.interm.innerHTML, '');
  h.send({final: 'replacement', c: true, id: 3});
  assert.equal(h.nodes.output.innerHTML, '<span>replacement</span><br/>');
});
