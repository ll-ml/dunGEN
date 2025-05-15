export class TickManager {
  constructor(tickInterval) {
    this.tickInterval  = tickInterval;  // e.g. 600 ms
    this.accumulator   = 0;
    this.tickCallbacks = [];
  }

  // register a "game‐logic tick" callback that expects (dtMS)
  onTick(callback) {
    this.tickCallbacks.push(callback);
  }

  // call every frame with the elapsed ms since last frame
  update(delta) {
    this.accumulator += delta;
    while (this.accumulator >= this.tickInterval) {
      // now we hand each callback the fixed tickInterval
      this.tickCallbacks.forEach(cb => cb(this.tickInterval));
      this.accumulator -= this.tickInterval;
    }
  }
}
  