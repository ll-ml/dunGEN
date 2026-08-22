import test from "node:test";
import assert from "node:assert/strict";
import { FirstPersonInput } from "../src/controllers/firstPersonInput.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    event.preventDefault ??= () => {};
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test("tracks pointer-lock input and clears state on unlock", () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const fakeDocument = new FakeEventTarget();
  const fakeWindow = new FakeEventTarget();
  const canvas = new FakeEventTarget();
  let attacks = 0;
  let interactions = 0;
  let lockErrors = 0;
  const lockChanges = [];

  fakeDocument.pointerLockElement = null;
  fakeDocument.exitPointerLock = () => {
    fakeDocument.pointerLockElement = null;
    fakeDocument.emit("pointerlockchange");
  };
  canvas.requestPointerLock = () => {
    fakeDocument.pointerLockElement = canvas;
    fakeDocument.emit("pointerlockchange");
    return Promise.resolve();
  };

  globalThis.document = fakeDocument;
  globalThis.window = fakeWindow;

  try {
    const input = new FirstPersonInput({
      domElement: canvas,
      onAttack: () => attacks++,
      onInteract: () => interactions++,
      onLockChange: (locked) => lockChanges.push(locked),
      onLockError: () => lockErrors++,
    });

    canvas.emit("mousedown", { button: 0 });
    assert.equal(input.isLocked, true);
    assert.equal(attacks, 0);

    canvas.emit("mousedown", { button: 0 });
    assert.equal(attacks, 1);

    fakeDocument.emit("keydown", { code: "KeyW" });
    fakeDocument.emit("keydown", { code: "Space", repeat: false });
    fakeDocument.emit("keydown", { code: "Space", repeat: true });
    const axes = input.getMovementAxes();
    assert.deepEqual(axes, { forward: 1, right: 0 });
    assert.equal(interactions, 1);

    fakeDocument.emit("mousemove", { movementX: 8, movementY: -3 });
    const look = {
      set(x, y) {
        this.x = x;
        this.y = y;
        return this;
      },
    };
    input.consumeLookDelta(look);
    assert.deepEqual({ x: look.x, y: look.y }, { x: 8, y: -3 });

    input.releaseLock();
    assert.deepEqual(input.getMovementAxes(), { forward: 0, right: 0 });
    fakeDocument.emit("keydown", { code: "Space", repeat: false });
    assert.equal(interactions, 1);
    fakeDocument.emit("pointerlockerror");
    assert.equal(lockErrors, 1);

    canvas.emit("mousedown", { button: 0 });
    const lockChangesBeforeDispose = lockChanges.length;
    input.dispose();
    assert.equal(fakeDocument.pointerLockElement, null);
    assert.equal(lockChanges.length, lockChangesBeforeDispose);
    assert.equal(fakeDocument.listeners.get("keydown")?.size ?? 0, 0);
    assert.equal(fakeDocument.listeners.get("pointerlockerror")?.size ?? 0, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
