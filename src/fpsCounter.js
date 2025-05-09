export class FrameCounter {
    /**
     * @param {object} options
     * @param {number} options.interval How often (ms) to recalc FPS (default 500)
     * @param {string} options.position CSS position
     * @param {{[key: string]: string}} options.style Extra CSS rules for the display element
     */
    constructor({ interval = 500, position = 'fixed', style = {} } = {}) {
      this.interval = interval;
      this.lastTime = performance.now();
      this.frameCount = 0;
      this.fps = 0;

      this.el = document.createElement('div');
      this.el.textContent = 'FPS: 0';
      Object.assign(this.el.style, {
        position,
        bottom: '0',
        left: '0',
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.6)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: '1000',
        ...style,
      });
      document.body.appendChild(this.el);
    }

    update() {
      const now = performance.now();
      this.frameCount++;
      const delta = now - this.lastTime;
      if (delta >= this.interval) {
        this.fps = Math.round((this.frameCount * 1000) / delta);
        this.el.textContent = `FPS: ${this.fps}`;
        this.frameCount = 0;
        this.lastTime = now;
      }
    }
  }