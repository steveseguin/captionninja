'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

function fixture() {
  const html = readFileSync(join(__dirname, '../../translate_premium.html'), 'utf8');
  const source = html.slice(html.indexOf('const app = {'), html.indexOf("document.addEventListener('DOMContentLoaded'"));
  const elements = new Map(), requests = [], published = [], errors = [];
  let now = 1000;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {value: '', checked: false, listeners: {},
      classList: {add() {}, remove() {}}, addEventListener(type, handler) { this.listeners[type] = handler; }});
    return elements.get(id);
  }
  const context = vm.createContext({document: {getElementById: element}, navigator: {language: 'en-US'},
    window: {CaptionTranslationProviders: {translateText(config, text, from, to, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({resolve, reject, signal: options.signal, text});
      return promise;
    }}},
    AbortController, Date: {now: () => now}, URLSearchParams,
    setTimeout: () => 1, clearTimeout() {}, console: {log() {}, warn() {}, error() {}}
  });
  vm.runInContext(source + '\nglobalThis.subject = app;', context);
  const app = context.subject;
  app.state.myLangCode = 'en'; app.state.targetLang = 'es';
  app.elements.enabledTranscriptionCheckbox.checked = true;
  app.getTranslationConfig = () => ({provider: 'openai_compat'});
  app.getCachedTranslation = () => null; app.cacheTranslation = () => {};
  app.wsPublisher = {publish: data => published.push(JSON.parse(JSON.stringify(data)))};
  app.handleTranslationError = error => errors.push(error);
  app.setupEventListeners();
  function enabled(checked) {
    app.elements.enabledTranscriptionCheckbox.checked = checked;
    app.elements.enabledTranscriptionCheckbox.listeners.change?.();
  }
  return {app, requests, published, errors, enabled, advance: () => { now += 300; }};
}
const settle = () => new Promise(setImmediate);

test('disabling Translation Output suppresses a pending provider response', async () => {
  const f = fixture(); f.app.translateText('First caption'); await settle();
  f.enabled(false);
  f.requests[0].resolve({translatedText: 'Primera leyenda'}); await settle();
  assert.equal(f.published.length, 0);
  assert.equal(f.app.elements.outputDiv.innerHTML, undefined);
  assert.equal(f.requests[0].signal.aborted, true);
});

test('disable then re-enable does not revive the previous output request', async () => {
  const f = fixture(); f.app.translateText('Old caption'); await settle();
  f.enabled(false); f.enabled(true);
  f.requests[0].resolve({translatedText: 'Old result'}); await settle();
  assert.equal(f.published.length, 0);
  f.advance(); f.app.translateText('New caption'); await settle();
  f.requests[1].resolve({translatedText: 'New result'}); await settle();
  assert.deepEqual(f.published.map(item => item.final), ['New result']);
});

test('a superseded request cannot publish or report late provider errors', async () => {
  const f = fixture(); f.app.translateText('Older caption'); await settle();
  f.advance(); f.app.translateText('Newer caption'); await settle();
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[1].resolve({translatedText: 'Newer result'}); await settle();
  f.requests[0].resolve({translatedText: 'Older result'}); await settle();
  assert.deepEqual(f.published.map(item => item.final), ['Newer result']);
  f.advance(); f.app.translateText('Another caption'); await settle();
  f.enabled(false);
  f.requests[2].reject(new Error('Late provider error')); await settle();
  assert.equal(f.errors.length, 0);
});

test('an enabled current request still publishes one final caption', async () => {
  const f = fixture(); f.app.translateText('Current caption'); await settle();
  f.requests[0].resolve({translatedText: 'Current result'}); await settle();
  assert.deepEqual(f.published, [{msg: true, final: 'Current result', id: 1, c: false, ln: 'es'}]);
  assert.equal(f.app.state.activeRequest, null);
});
