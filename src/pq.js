export class PriorityQueue {
    /**
     * @param {Function} [comparator]  A function(a, b) returning a negative
     *   number if a has higher priority than b, positive if lower, or zero.
     *   Default is (a, b) => a - b for numeric min-heap.
     */
    constructor(comparator = (a, b) => a - b) {
      this._heap = [];
      this._cmp = comparator;
    }
  
    isEmpty() {
      return this._heap.length === 0;
    }
  
    push(value) {
      this._heap.push(value);
      this._bubbleUp(this._heap.length - 1);
    }
  
    pop() {
      const n = this._heap.length;
      if (n === 0) return undefined;
  
      const top = this._heap[0];
      const last = this._heap.pop();
  
      if (n > 1) {
        this._heap[0] = last;
        this._bubbleDown(0);
      }
  
      return top;
    }
  
    _bubbleUp(idx) {
      const { _heap: h, _cmp: cmp } = this;
      while (idx > 0) {
        const parent = (idx - 1) >> 1;
        if (cmp(h[idx], h[parent]) >= 0) break;
        [h[parent], h[idx]] = [h[idx], h[parent]];
        idx = parent;
      }
    }
  
    _bubbleDown(idx) {
      const { _heap: h, _cmp: cmp } = this;
      const n = h.length;
      while (true) {
        let left = 2 * idx + 1;
        let right = 2 * idx + 2;
        let smallest = idx;
  
        if (left < n && cmp(h[left], h[smallest]) < 0) {
          smallest = left;
        }
        if (right < n && cmp(h[right], h[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === idx) break;
        [h[idx], h[smallest]] = [h[smallest], h[idx]];
        idx = smallest;
      }
    }
  }
