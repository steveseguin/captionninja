'use strict';
const {randomUUID, createHash} = require('node:crypto');
// All retained text and receipts share the same bounded, expiring memory budget.
class Replay {
  constructor(roomNames, limits, now = Date.now) {
    this.epoch = randomUUID(); this.limits = limits; this.now = now;
    this.rooms = new Map(roomNames.map(name => [name, {sequence: 0, events: new Map(), receipts: new Map()}]));
    this.global = new Map(); this.bytes = 0;
  }
  remove(record) {
    this.global.delete(record.key); this.bytes -= record.bytes;
    const room = this.rooms.get(record.room); room.events.delete(record.sequence);
    if (record.receipt) room.receipts.delete(record.receipt);
  }
  prune() {
    const cutoff = this.now() - this.limits.replayMs;
    for (const record of this.global.values()) {
      if (record.created > cutoff) break;
      this.remove(record);
    }
  }
  append(name, caption, delivery) {
    this.prune();
    const room = this.rooms.get(name), encoded = JSON.stringify(caption);
    const receipt = delivery ? delivery.client + ':' + delivery.sequence : null;
    const hash = createHash('sha256').update(encoded).digest('hex');
    const existing = receipt && room.receipts.get(receipt);
    if (existing) {
      if (existing.hash !== hash) throw new Error('Delivery identity conflict');
      return {record: existing, duplicate: true};
    }
    const sequence = ++room.sequence;
    const reliable = JSON.stringify({...caption, relay: {epoch: this.epoch, sequence}});
    const record = {room: name, sequence, key: name + ':' + sequence, created: this.now(),
      encoded, reliable, receipt, hash, bytes: Buffer.byteLength(encoded) + Buffer.byteLength(reliable) + 256};
    room.events.set(sequence, record); if (receipt) room.receipts.set(receipt, record);
    this.global.set(record.key, record); this.bytes += record.bytes;
    while (room.events.size > this.limits.replayMessages) this.remove(room.events.values().next().value);
    while (this.bytes > this.limits.replayBytes || this.global.size > this.limits.replayTotalMessages)
      this.remove(this.global.values().next().value);
    return {record, duplicate: false};
  }
  resume(name, cursor) {
    this.prune();
    const room = this.rooms.get(name), first = room.events.keys().next().value || room.sequence + 1;
    if (!cursor) return {next: room.sequence + 1, gap: null}; // New audiences start live.
    if (cursor.epoch !== this.epoch) return {next: first, gap: 'relay-restarted'};
    if (cursor.sequence > room.sequence) throw new Error('Invalid future cursor');
    return {next: Math.max(first, cursor.sequence + 1), gap: cursor.sequence + 1 < first ? 'history-expired' : null};
  }
}
module.exports = {Replay};
