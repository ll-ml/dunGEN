export class TickManager {
  constructor(tickInterval) {
    this.tickInterval  = tickInterval;  // e.g. 600 ms
    this.accumulator   = 0;
    this.tickCallbacks = [];
  }

  onTick(callback) {
    this.tickCallbacks.push(callback);
  }

  update(delta) {
    this.accumulator += delta;
    while (this.accumulator >= this.tickInterval) {
      const tickSeconds = this.tickInterval / 1000;
      this.tickCallbacks.forEach(cb => cb(tickSeconds));
      this.accumulator -= this.tickInterval;
    }
  }
}
  
