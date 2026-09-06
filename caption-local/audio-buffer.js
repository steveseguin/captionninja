/* Bounded capture storage shared by the browser and Node regression tests. */
(function(root) {
  'use strict';
  class CaptureBuffer {
    constructor(threshold = 0.002, windowSeconds = 6) {
      if (![3, 6, 9].includes(windowSeconds)) throw new Error('Caption interval must be 3, 6 or 9 seconds');
      this.threshold = threshold; this.targetSamples = windowSeconds * 16000; this.reset();
    }
    reset() { this.parts = []; this.length = 0; this.context = 0; this.speech = false; this.quiet = 0; }
    remove(count) {
      this.length -= count;
      while (count && this.parts.length) {
        if (count >= this.parts[0].length) count -= this.parts.shift().length;
        else { this.parts[0] = this.parts[0].slice(count); count = 0; }
      }
    }
    append(audio) {
      const rms = Math.sqrt(audio.reduce((sum, x) => sum + x*x, 0) / audio.length);
      const voiced = rms >= this.threshold;
      this.quiet = voiced ? 0 : this.quiet + audio.length / 16000;
      this.speech ||= voiced;
      this.parts.push(audio); this.length += audio.length;
      if (!this.speech && this.length > 8000) this.remove(this.length - 8000);
      return rms;
    }
    snapshot(force = false) {
      const fresh = this.length - this.context;
      if (!this.speech || fresh < 160) return null;
      if (!force && fresh < this.targetSamples && !(this.quiet >= 0.6 && fresh >= 5600)) return null;
      const count = Math.min(this.length, 192000);
      const audio = new Float32Array(count); let offset = 0;
      for (const part of this.parts) {
        const size = Math.min(part.length, count - offset);
        audio.set(part.subarray(0, size), offset); offset += size;
        if (offset === count) break;
      }
      return {audio, context: this.context / 16000,
        final: count === this.length && (force || this.quiet >= 0.6)};
    }
    commit(snapshot, seconds) {
      const committed = Math.round(seconds * 16000);
      if (!Number.isFinite(committed) || committed <= this.context || committed > snapshot.audio.length) {
        throw new Error('Service returned an invalid audio boundary; audio has been retained.');
      }
      const remove = snapshot.final ? committed : Math.max(0, committed - 8000);
      this.remove(remove);
      this.context = snapshot.final ? 0 : committed - remove;
      if (snapshot.final) {
        this.speech = this.parts.some(part => Math.sqrt(part.reduce((s, x) => s+x*x, 0)/part.length) >= this.threshold);
        if (!this.speech && this.length > 8000) this.remove(this.length - 8000);
      }
    }
  }
  root.CaptureBuffer = CaptureBuffer;
  if (typeof module !== 'undefined') module.exports = CaptureBuffer;
})(typeof window === 'undefined' ? globalThis : window);
