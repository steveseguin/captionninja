'use strict';
// Exact-source offline regression tests. Browser, transport, publisher, storage
// and timers are inert doubles; no real browser, sockets or network are used.
// Run with: node --test relay/test/editor-auto-send.test.cjs
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = path.resolve(__dirname, '../../editor.html');
const html = fs.readFileSync(sourcePath, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
assert.equal(scripts.length, 1, 'Execute the actual single inline editor script');

function createHarness({mode='timed', delay=5, source=scripts[0]}={}) {
  const nodes = new Map();
  const output = [];
  const sockets = [];
  let now = 1000, nextTimer = 1;
  const timeouts = new Map(), intervals = new Map();
  const events = new Map();
  function node(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      nodes.set(id, {
        id, value:'', textContent:'', disabled:false, hidden:false,
        classList:{toggle(){}, add(){}},
        parentElement:{querySelector(){ return node('parent-strong'); }},
        focus(){}, setSelectionRange(){}, append(){},
        addEventListener(type, callback){
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(callback);
        },
        dispatch(type, event={}) {
          for(const fn of listeners.get(type)||[]) fn.call(this,event);
        }
      });
    }
    return nodes.get(id);
  }
  class InertWebSocket {
    static OPEN=1; static CONNECTING=0; static CLOSED=3;
    constructor(url){ this.url=url; this.readyState=0; sockets.push(this); }
    send(){} close(){this.readyState=3;}
  }
  const location = new URL(`https://offline.invalid/editor.html?room=source123456&output=output123456&mode=${mode}&delay=${delay}`);
  const window = {location, history:{replaceState(){}}, addEventListener(type, callback){ events.set(type,callback); }, prompt(){}};
  const storage = new Map();
  const publisher = {connect(){}, disconnect(){}, publish(payload){output.push(JSON.parse(JSON.stringify(payload)));}};
  const context = vm.createContext({
    window, document:{getElementById:node, querySelector:node, body:node('body'), createElement:node},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    navigator:{clipboard:{writeText:()=>Promise.resolve()}},
    CaptionRelay:{url:()=> 'wss://offline.invalid', custom:()=>false, join:()=>({}), link:x=>x, addViewerLink(){}},
    createWSPublisher:()=>publisher, WebSocket:InertWebSocket,
    URL, URLSearchParams, Date:{now:()=>now}, console,
    setTimeout(fn,ms=0){const id=nextTimer++;timeouts.set(id,{fn,at:now+ms});return id;},
    clearTimeout(id){timeouts.delete(id);},
    setInterval(fn,ms){const id=nextTimer++;intervals.set(id,{fn,ms});return id;},
    clearInterval(id){intervals.delete(id);}
  });
  vm.runInContext(source,context,{filename:'editor.html:inline-script'});
  assert.equal(sockets.length,1);
  return {
    node, output,
    receive(data){ sockets[0].onmessage({data:JSON.stringify(data)}); },
    edit(value){node('editor').value=value;node('editor').dispatch('input');},
    mode(value){node('publishMode').value=value;node('publishMode').dispatch('change');},
    delay(value){node('reviewDelay').value=String(value);node('reviewDelay').dispatch('change');},
    click(id){assert.equal(node(id).disabled,false);node(id).dispatch('click');},
    intervalAt(time){now=time;for(const {fn} of intervals.values()) fn();},
    drain(){let guard=0;while(true){ const next=[...timeouts].find(([,t])=>t.at<=now);if(!next)break; const [id,t]=next;timeouts.delete(id);t.fn();if(++guard>200)throw Error('Timer loop');}},
    pending:()=>timeouts.size,
    final:()=>output.filter(p=>Object.hasOwn(p,'final')),
    snapshot(){return {time:now,editor:node('editor').value,queue:node('queueCount').textContent,timing:node('currentTiming').textContent,sendEnabled:!node('sendButton').disabled,output:JSON.parse(JSON.stringify(output))};}
  };
}

const open = (options={}) => createHarness({...options, source:scripts[0]});
const tick = (h,time) => {h.intervalAt(time);h.drain();};
const texts = h => h.final().map(p=>p.final);

test('timed review waits until the deadline and sends exactly once',()=>{
 const h=open();h.receive({final:'Caption'});tick(h,5999);assert.deepEqual(texts(h),[]);tick(h,6000);assert.deepEqual(texts(h),['Caption']);tick(h,10000);assert.deepEqual(texts(h),['Caption']);
});
test('live review previews edits and finalizes the latest text at its original deadline',()=>{
 const h=open({mode:'live'});h.receive({final:'Caption'});h.edit('Correction');assert.deepEqual(h.output.map(p=>p.interm),['Caption','Correction']);tick(h,6000);assert.deepEqual(texts(h),['Correction']);
});
test('manual review keeps completed captions private until Send now',()=>{
 const h=open({mode:'manual'});h.receive({final:'Caption'});h.edit('Correction');tick(h,60000);assert.deepEqual(h.output,[]);h.click('sendButton');assert.deepEqual(texts(h),['Correction']);
});
test('empty current text cannot be sent by Enter or by automatic review',()=>{
 const h=open();h.receive({final:'Caption'});h.edit('');let prevented=false;h.node('editor').dispatch('keydown',{key:'Enter',shiftKey:false,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.node('sendButton').disabled,true);tick(h,6000);tick(h,10000);assert.deepEqual(texts(h),[]);assert.equal(h.node('skipButton').disabled,false);
});
test('text typed without a current caption is not implicitly sent',()=>{
 const h=open({mode:'manual'});h.edit('Unassociated text');h.node('editor').dispatch('keydown',{key:'Enter',shiftKey:false,preventDefault(){}});tick(h,60000);assert.deepEqual(texts(h),[]);assert.equal(h.node('sendButton').disabled,true);
});
for(const mode of ['timed','live']) test(`${mode} recovers after a blank deadline and preserves the queued successor`,()=>{
 const h=open({mode});h.receive({final:'First',label:'Speaker 1',ln:'en'});h.edit('');tick(h,6000);h.receive({final:'Second',label:'Speaker 2'});h.edit('Corrected first');tick(h,6250);assert.deepEqual(texts(h),['Corrected first']);assert.equal(h.final()[0].label,'Speaker 1');assert.equal(h.final()[0].ln,'en');assert.equal(h.node('editor').value,'Second');tick(h,11000);assert.deepEqual(texts(h),['Corrected first','Second']);assert.equal(h.final()[1].label,'Speaker 2');
});
test('whitespace at expiry remains unsent, then a nonempty correction can auto-send',()=>{
 const h=open();h.receive({final:'Caption'});h.edit(' \n\t ');tick(h,6000);tick(h,20000);assert.deepEqual(texts(h),[]);h.edit(' Correction ');tick(h,20250);assert.deepEqual(texts(h),['Correction']);
});
test('blank deadline followed by Manual approval remains private; returning to timed recovers',()=>{
 const h=open();h.receive({final:'Caption'});h.edit('');tick(h,6000);h.mode('manual');h.edit('Correction');tick(h,10000);assert.deepEqual(texts(h),[]);h.mode('timed');h.drain();assert.deepEqual(texts(h),['Correction']);
});
test('queued automatic callback respects a switch to Manual approval',()=>{
 const h=open();h.receive({final:'Caption'});h.intervalAt(6000);assert.equal(h.pending(),1);h.mode('manual');h.drain();tick(h,60000);assert.deepEqual(texts(h),[]);h.click('sendButton');assert.deepEqual(texts(h),['Caption']);
});
test('queued callback cancelled by manual mode can be scheduled again after returning to timed',()=>{
 const h=open();h.receive({final:'Caption'});h.intervalAt(6000);h.mode('manual');h.drain();assert.deepEqual(texts(h),[]);h.mode('timed');h.drain();assert.deepEqual(texts(h),['Caption']);
});
test('queued automatic callback respects an increased delay and reschedules at the new deadline',()=>{
 const h=open();h.receive({final:'Caption'});h.intervalAt(6000);h.delay(30);h.drain();assert.deepEqual(texts(h),[]);tick(h,30999);assert.deepEqual(texts(h),[]);tick(h,31000);assert.deepEqual(texts(h),['Caption']);
});
test('decreasing the delay makes an already old caption eligible',()=>{
 const h=open({delay:30});h.receive({final:'Caption'});tick(h,10000);h.delay(5);h.drain();assert.deepEqual(texts(h),['Caption']);
});
test('stale callback after Skip cannot send a newer current caption',()=>{
 const h=open();h.receive({final:'First'});h.intervalAt(5999);h.receive({final:'Second'});h.intervalAt(6000);h.click('skipButton');h.drain();assert.deepEqual(texts(h),[]);assert.equal(h.node('editor').value,'Second');tick(h,10999);assert.deepEqual(texts(h),['Second']);
});
test('stale callback after explicit Send cannot duplicate or send a newer current caption',()=>{
 const h=open();h.receive({final:'First'});h.intervalAt(5999);h.receive({final:'Second'});h.intervalAt(6000);h.click('sendButton');h.drain();assert.deepEqual(texts(h),['First']);assert.equal(h.node('editor').value,'Second');tick(h,10999);assert.deepEqual(texts(h),['First','Second']);
});
test('Skip still advances an empty manual caption without publishing it',()=>{
 const h=open({mode:'manual'});h.receive({final:'First'});h.receive({final:'Second'});h.edit('');h.click('skipButton');assert.deepEqual(texts(h),[]);assert.equal(h.node('editor').value,'Second');h.click('sendButton');assert.deepEqual(texts(h),['Second']);
});
test('mode change before expiry cancels automatic sending without requiring an expiry callback',()=>{
 const h=open();h.receive({final:'Caption'});h.intervalAt(5999);h.mode('manual');tick(h,6100);assert.deepEqual(texts(h),[]);
});
test('successive edits do not extend the existing fixed review deadline',()=>{
 const h=open();h.receive({final:'Caption'});tick(h,5900);h.edit('Final correction');tick(h,6000);assert.deepEqual(texts(h),['Final correction']);
});
