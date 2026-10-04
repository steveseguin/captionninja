'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({rate = 40, ack = true} = {}) {
  let now = 10000, counter = 0;
  const timers = new Map(), sockets = [], errors = [], received = [], identities = new Set();
  function timeout(fn, delay = 0, interval = 0) {
    const id = ++counter; timers.set(id, {fn, at: now + delay, interval}); return id;
  }
  function tick(ms) {
    const target = now + ms;
    for (;;) {
      const entry = [...timers].filter(([, t]) => t.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
      if (!entry) break;
      const [id,t] = entry; now = t.at; timers.delete(id);
      if (t.interval) timers.set(id, {...t, at: now+t.interval});
      t.fn();
    }
    now = target;
  }
  class Socket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.frames = 0; this.window = now;
      sockets.push(this);
      timeout(() => {this.readyState = 1; this.onopen?.();});
    }
    message(data) {this.onmessage?.({data: JSON.stringify(data)});}
    close(code = 1000, reason = '') {
      if (this.readyState === 3) return;
      this.readyState = 3; timeout(() => this.onclose?.({code,reason}));
    }
    send(body) {
      const data = JSON.parse(body); this.sent.push({at:now,data});
      if (now-this.window >= 1000) {this.window=now; this.frames=0;}
      if (++this.frames > rate) {this.close(1008,'Rate limit'); return;}
      if (data.join) {
        timeout(() => this.message({joined:data.join,role:'write',protocol:2,epoch:'one',next:1})); return;
      }
      const key = JSON.stringify(data.delivery);
      if (!identities.has(key)) {identities.add(key); received.push(data.id);}
      if (ack) timeout(() => this.message({ack:data.delivery,epoch:'one',sequence:received.length}));
    }
  }
  const window = {CaptionRelay:{url:()=> 'ws://localhost/',join:(room,role)=>({join:room,role,token:'synthetic'})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../private-relay-client.js'),'utf8'), {
    window,WebSocket:Socket,crypto:{randomUUID:()=> 'synthetic-client-0001'},Date:{now:()=>now},
    setTimeout:timeout,clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>timeout(fn,ms,ms),clearInterval:id=>timers.delete(id)
  });
  const publisher=window.CaptionRelay.createPublisher({room:'source',onError:e=>errors.push(e)});
  return {publisher,sockets,errors,received,tick,timers};
}
const caption = id => ({msg:true,final:'Synthetic caption '+id,id});

test('a 50-caption reconnect backlog stays below the default relay rate and drains in order', () => {
  const f=fixture(); f.publisher.connect(); f.tick(0); f.sockets[0].close(1006); f.tick(0);
  for(let i=1;i<=50;i++) f.publisher.publish(caption(i));
  f.tick(3000);
  assert.equal(f.publisher.getSnapshot().queueLength,0);
  assert.equal(f.publisher.getSnapshot().state,'connected');
  assert.deepEqual(f.received,Array.from({length:50},(_,i)=>i+1));
  assert.deepEqual(f.errors,[]);
  const sent=f.sockets[1].sent.filter(x=>x.data.delivery);
  for(let i=1;i<sent.length;i++) assert.ok(sent[i].at-sent[i-1].at>=30);
  f.publisher.disconnect();
});
test('an explicit rate-limit close retries after a delay and retains the delivery identity', () => {
  const f=fixture({ack:false}); f.publisher.connect(); f.tick(0); f.publisher.publish(caption(1));
  const identity=f.sockets[0].sent[1].data.delivery;
  f.sockets[0].close(1008,'Rate limit'); f.tick(999);
  assert.equal(f.sockets.length,1); assert.equal(f.publisher.getSnapshot().queueLength,1);
  f.tick(1); assert.equal(f.sockets.length,2);
  assert.deepEqual(f.sockets[1].sent[1].data.delivery,identity);
  assert.deepEqual(f.received,[1]); assert.deepEqual(f.errors,[]); f.publisher.disconnect();
});
test('rate denial without acknowledgement progress eventually stops with the queue retained', () => {
  const f=fixture({rate:1}); f.publisher.publish(caption(1)); f.publisher.connect(); f.tick(60000);
  assert.equal(f.sockets.length,6); assert.equal(f.publisher.getSnapshot().state,'denied');
  assert.equal(f.publisher.getSnapshot().queueLength,1); assert.match(f.errors[0],/rate limit/i);
  f.publisher.disconnect();
});
test('authentication denial does not reconnect', () => {
  const f=fixture({ack:false}); f.publisher.connect(); f.tick(0); f.publisher.publish(caption(1));
  f.sockets[0].close(1008,'Join denied'); f.tick(60000);
  assert.equal(f.sockets.length,1); assert.equal(f.publisher.getSnapshot().state,'denied');
  assert.equal(f.publisher.getSnapshot().queueLength,1); assert.match(f.errors[0],/credentials/);
  f.publisher.disconnect();
});
test('disconnect cancels a pending pacing send', () => {
  const f=fixture(); f.publisher.connect(); f.tick(0);
  f.publisher.publish(caption(1)); f.publisher.publish(caption(2)); f.tick(0);
  f.publisher.disconnect(); f.tick(60000);
  assert.deepEqual(f.received,[1]); assert.equal(f.publisher.getSnapshot().queueLength,1);
  assert.equal(f.timers.size,0);
});
test('disconnect cancels rate-limit backoff', () => {
  const f=fixture({rate:1}); f.publisher.publish(caption(1)); f.publisher.connect(); f.tick(0);
  f.publisher.disconnect(); f.tick(60000);
  assert.equal(f.sockets.length,1); assert.equal(f.publisher.getSnapshot().queueLength,1);
  assert.equal(f.timers.size,0);
});
