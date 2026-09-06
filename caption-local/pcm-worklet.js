// Flush transfers the incomplete frame before acknowledging stop. No tail loss.
class PCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.frame = new Float32Array(1600); this.offset = 0; this.stopped = false;
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        this.stopped = true;
        if (this.offset) this.port.postMessage(this.frame.slice(0, this.offset));
        this.port.postMessage('stopped');
      }
    };
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (input) for (const value of input) {
      this.frame[this.offset++] = value;
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(1600); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm', PCM);
