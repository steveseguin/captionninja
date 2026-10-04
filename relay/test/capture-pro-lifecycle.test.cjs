const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const html = fs.readFileSync(process.env.CAPTURE_PRO_SOURCE || require('node:path').join(__dirname, '../../capture-pro.html'), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup() {
  const elements = new Map(), instances = [], timers = new Map(), published = [];
  let timerId = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent:'', innerHTML:'', value: id==='pauseMs'?'600':id==='lineLen'?'42':'', checked:false, style:{},
      classList:{add(){},remove(){},toggle(){}}, handlers:{},
      addEventListener(type, fn){this.handlers[type]=fn},
      click(){this.handlers.click?.call(this)}, appendChild(){}, remove(){},
    });
    return elements.get(id);
  }
  class Recognition {
    constructor(){this.active=false;this.starts=0;instances.push(this)}
    start(){if(this.active) throw new Error('InvalidStateError');this.active=true;this.starts++;this.onstart?.()}
    stop(){this.active=false}
    end(){this.active=false;this.onend?.()}
  }
  const context = {
    console, URL, URLSearchParams, Uint8Array, Date,
    location:{search:'?room=test',href:'https://caption.ninja/capture-pro?room=test'}, history:{replaceState(){}},
    webkitSpeechRecognition:Recognition, addEventListener(){},
    document:{URL:'https://caption.ninja/capture-pro?room=test', getElementById:element, createElement:()=>element(Symbol()), querySelector:element, addEventListener(){}},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    navigator:{clipboard:{writeText:()=>Promise.resolve()}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id}, clearTimeout(id){timers.delete(id)}, setInterval(){},
    alert(){}, confirm:()=>true,
    createWSPublisher:()=>({connect(){},publish(value){published.push(value)}}),
  };
  context.window=context;
  vm.createContext(context); vm.runInContext(source,context);
  return {context,instances,published,element,click:()=>element('btnToggle').click(),run(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn()}}};
}
test('control: ordinary Pause leaves recognition stopped',()=>{
  const h=setup();h.click();h.click();h.instances[0].end();h.run(500);
  assert.equal(h.instances.filter(r=>r.active).length,0);
});
test('control: natural end restarts after backoff while running',()=>{
  const h=setup();h.click();h.instances[0].end();h.run(500);
  assert.equal(h.instances[0].starts,2);
  assert.equal(h.instances.filter(r=>r.active).length,1);
});
test('control: manual resume continues capturing and auto-restarting',()=>{
  const h=setup();h.click();h.click();h.instances[0].end();h.click();
  assert.equal(h.context.isRunning,true);
  assert.equal(h.context.isPaused,false);
  h.instances[1].end();h.run(500);
  assert.equal(h.instances[1].starts,2);
  assert.equal(h.instances.filter(r=>r.active).length,1);
});
test('control: failed automatic restart can replace the recognizer',()=>{
  const h=setup();h.click();h.instances[0].end();
  h.instances[0].start=()=>{throw new Error('recognizer unavailable')};h.run(500);
  assert.equal(h.instances.length,2);
  assert.equal(h.instances[1].active,true);
});
test('regression: Pause during restart backoff must not restart capture',()=>{
  const h=setup();h.click();h.instances[0].end();h.click();h.run(500);
  assert.equal(h.context.isPaused,true);
  assert.equal(h.instances.filter(r=>r.active).length,0,'queued retry restarted microphone after Pause');
});
test('regression: captions must not publish from a restart that fires while paused',()=>{
  const h=setup();h.click();h.instances[0].end();h.click();h.run(500);
  const interim=Object.assign([{transcript:'synthetic paused caption'}],{isFinal:false});
  if (h.instances[0].active) h.instances[0].onresult({resultIndex:0,results:[interim]});
  assert.equal(h.context.isPaused,true);
  assert.equal(h.published.length,0,'paused session published subsequent recognition result');
});
test('regression: old end after Pause/Resume must not create another recognizer',()=>{
  const h=setup();h.click();const old=h.instances[0];h.click();h.click();old.end();h.run(500);
  assert.equal(h.instances.length,2,'stale onend scheduled retry against new recognizer, then fallback allocated another');
  assert.equal(h.instances.filter(r=>r.active).length,1);
});
test('regression: queued retry across Pause/Resume must not create another recognizer',()=>{
  const h=setup();h.click();h.instances[0].end();h.click();h.click();h.run(500);
  assert.equal(h.instances.length,2,'old retry used global recognition and allocated an extra active recognizer');
  assert.equal(h.instances.filter(r=>r.active).length,1);
});
