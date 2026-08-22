import test from "node:test";
import assert from "node:assert/strict";
import { StatusBar } from "../src/statusBar.js";

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(name) {
    this.names.add(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.className = "";
    this.textContent = "";
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
    };
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
}

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.now + delay });
    return id;
  };

  clearTimeout = (id) => {
    this.tasks.delete(id);
  };

  advance(milliseconds) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;

      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.callback();
    }
    this.now = target;
  }
}

function makeHarness(statusOptions = { holdMs: 10, fadeMs: 5 }) {
  const statusArea = new FakeElement();
  const documentRef = {
    getElementById: (id) => id === "statusArea" ? statusArea : null,
    createElement: () => new FakeElement(),
  };
  const clock = new FakeClock();
  const status = new StatusBar(documentRef, {
    maxMessages: 3,
    ...statusOptions,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
  });
  return { clock, status, statusArea };
}

test("recent events begin fading after five seconds by default", () => {
  const { clock, status, statusArea } = makeHarness({});
  status.addStatus("one");

  clock.advance(4999);
  assert.equal(
    statusArea.children[0].classList.contains("is-fading"),
    false
  );

  clock.advance(1);
  assert.equal(
    statusArea.children[0].classList.contains("is-fading"),
    true
  );

  clock.advance(599);
  assert.equal(statusArea.children.length, 1);
  clock.advance(1);
  assert.equal(statusArea.children.length, 0);
});

test("browser timer methods keep their global receiver", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const clock = new FakeClock();
  const statusArea = new FakeElement();
  const documentRef = {
    getElementById: (id) => id === "statusArea" ? statusArea : null,
    createElement: () => new FakeElement(),
  };

  globalThis.setTimeout = function browserSetTimeout(callback, delay) {
    assert.equal(this, globalThis);
    return clock.setTimeout(callback, delay);
  };
  globalThis.clearTimeout = function browserClearTimeout(timer) {
    assert.equal(this, globalThis);
    return clock.clearTimeout(timer);
  };

  try {
    const status = new StatusBar(documentRef, { holdMs: 10, fadeMs: 5 });
    assert.doesNotThrow(() => status.addStatus("one"));
    clock.advance(10);
    assert.equal(
      statusArea.children[0].classList.contains("is-fading"),
      true
    );
    clock.advance(5);
    assert.equal(statusArea.children.length, 0);

    status.addStatus("two");
    assert.doesNotThrow(() => status.dispose());
    assert.equal(clock.tasks.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("recent events keep only three literal text entries", () => {
  const { status, statusArea } = makeHarness();

  status.addStatus("first");
  status.addStatus("<img src=x onerror=alert(1)>");
  status.addStatus("third");
  status.addStatus("fourth");

  assert.deepEqual(status.statusMessages, [
    "<img src=x onerror=alert(1)>",
    "third",
    "fourth",
  ]);
  assert.deepEqual(
    statusArea.children.map((element) => element.textContent),
    status.statusMessages
  );
});

test("recent events fade, expire, and dispose without stale timers", () => {
  const { clock, status, statusArea } = makeHarness();
  status.addStatus("one");
  status.addStatus("two");

  clock.advance(10);
  assert.equal(
    statusArea.children.every((element) =>
      element.classList.contains("is-fading")
    ),
    true
  );

  clock.advance(5);
  assert.equal(statusArea.children.length, 0);
  assert.deepEqual(status.statusMessages, []);

  status.addStatus("later");
  status.dispose();
  status.dispose();
  assert.equal(clock.tasks.size, 0);
  assert.equal(statusArea.children.length, 0);
  assert.equal(status.addStatus("ignored"), null);
});
