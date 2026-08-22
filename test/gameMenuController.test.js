import test from "node:test";
import assert from "node:assert/strict";
import {
  GameMenuController,
  MenuMode,
} from "../src/controllers/gameMenuController.js";

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
    event.preventDefault ??= () => {
      event.defaultPrevented = true;
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
    return event;
  }
}

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  toggle(name, force) {
    if (force === undefined) {
      force = !this.names.has(name);
    }
    if (force) this.names.add(name);
    else this.names.delete(name);
    return force;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement extends FakeEventTarget {
  constructor(id, classes = []) {
    super();
    this.id = id;
    this.tagName = "DIV";
    this.classList = new FakeClassList(...classes);
    this.style = {};
    this.attributes = new Map();
    this.value = "";
    this.textContent = "";
    this.min = "";
    this.max = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  focus() {
    this.focused = true;
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.elements = new Map();
    this.pointerLockElement = null;
    this.hidden = false;
  }

  addElement(id, classes = []) {
    const element = new FakeElement(id, classes);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }
}

function makeHarness() {
  const documentRef = new FakeDocument();
  const ids = [
    "pauseModal",
    "inventoryModal",
    "resumeGame",
    "inventoryClose",
    "openInventoryFromPause",
    "mouseSensitivity",
    "mouseSensitivityValue",
    "crosshair",
    "controlHint",
    "ctxMenu",
  ];
  for (const id of ids) {
    documentRef.addElement(
      id,
      id === "pauseModal" || id === "inventoryModal" ? ["hidden"] : []
    );
  }

  const sensitivityInput = documentRef.getElementById("mouseSensitivity");
  sensitivityInput.min = "0.25";
  sensitivityInput.max = "5";
  sensitivityInput.value = "1.5";

  const canvas = {};
  const input = {
    requestCount: 0,
    releaseCount: 0,
    get isLocked() {
      return documentRef.pointerLockElement === canvas;
    },
    requestLock() {
      this.requestCount++;
    },
    releaseLock() {
      this.releaseCount++;
      documentRef.pointerLockElement = null;
      documentRef.emit("pointerlockchange");
    },
  };

  const storageValues = new Map();
  const storage = {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, value),
  };
  const sensitivityChanges = [];
  const gameplayEntries = [];
  const menu = new GameMenuController({
    input,
    documentRef,
    storage,
    onGameplayEntered: () => gameplayEntries.push(true),
    onSensitivityChange: (value) => sensitivityChanges.push(value),
  });

  const lock = () => {
    documentRef.pointerLockElement = canvas;
    documentRef.emit("pointerlockchange");
  };
  const unlock = () => {
    documentRef.pointerLockElement = null;
    documentRef.emit("pointerlockchange");
  };

  return {
    documentRef,
    input,
    menu,
    lock,
    unlock,
    gameplayEntries,
    sensitivityChanges,
  };
}

test("keeps intentional inventory unlock separate from native pause", () => {
  const harness = makeHarness();
  const { documentRef, input, menu } = harness;

  assert.equal(menu.mode, MenuMode.READY);
  assert.equal(menu.isSimulationPaused, true);
  assert.equal(
    documentRef.getElementById("controlHint").classList.contains("hidden"),
    false
  );

  harness.lock();
  assert.equal(menu.mode, MenuMode.PLAYING);
  assert.equal(menu.isSimulationPaused, false);
  assert.equal(harness.gameplayEntries.length, 1);

  documentRef.emit("keydown", { code: "KeyI", repeat: false });
  assert.equal(menu.mode, MenuMode.INVENTORY);
  assert.equal(input.releaseCount, 1);
  assert.equal(menu.activeMenu, "inventory");

  documentRef.emit("keydown", { code: "KeyI", repeat: false });
  assert.equal(input.requestCount, 1);
  assert.equal(menu.mode, MenuMode.INVENTORY);

  harness.lock();
  assert.equal(menu.mode, MenuMode.PLAYING);

  harness.unlock();
  assert.equal(menu.mode, MenuMode.PAUSED);
  assert.equal(menu.activeMenu, "pause");
  assert.equal(menu.isSimulationPaused, true);

  menu.dispose();
  assert.equal(documentRef.listeners.get("keydown")?.size ?? 0, 0);
  assert.equal(documentRef.listeners.get("pointerlockchange")?.size ?? 0, 0);
});

test("returns pause-opened inventory to pause and persists sensitivity", () => {
  const harness = makeHarness();
  const { documentRef, input, menu, sensitivityChanges } = harness;

  documentRef.emit("keydown", { code: "Escape", repeat: false });
  assert.equal(menu.mode, MenuMode.PAUSED);

  menu.openBlockingOverlay();
  assert.equal(menu.mode, MenuMode.BLOCKED);
  harness.lock();
  assert.equal(menu.mode, MenuMode.BLOCKED);
  assert.equal(input.isLocked, false);
  menu.closeBlockingOverlay();
  assert.equal(menu.mode, MenuMode.PAUSED);

  const editableInput = { tagName: "INPUT" };
  documentRef.emit("keydown", {
    code: "KeyI",
    repeat: false,
    target: editableInput,
  });
  assert.equal(menu.mode, MenuMode.PAUSED);

  documentRef.emit("keydown", { code: "KeyI", repeat: false });
  assert.equal(menu.mode, MenuMode.INVENTORY);
  documentRef.emit("keydown", { code: "KeyI", repeat: false });
  assert.equal(menu.mode, MenuMode.PAUSED);
  assert.equal(input.requestCount, 0);

  const slider = documentRef.getElementById("mouseSensitivity");
  slider.value = "3.2";
  slider.emit("input");
  assert.deepEqual(sensitivityChanges, [1.5, 3.2]);
  assert.equal(
    documentRef.getElementById("mouseSensitivityValue").textContent,
    "3.20×"
  );
});

test("rejects a late pointer lock after a resume was cancelled", () => {
  const harness = makeHarness();

  harness.lock();
  harness.unlock();
  assert.equal(harness.menu.mode, MenuMode.PAUSED);

  harness.menu.requestResume();
  assert.equal(harness.input.requestCount, 1);
  harness.menu.openInventory();
  assert.equal(harness.menu.mode, MenuMode.INVENTORY);

  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.INVENTORY);
  assert.equal(harness.input.isLocked, false);
  assert.equal(harness.gameplayEntries.length, 1);
});

test("gameplay overlays resume directly after pointer lock is confirmed", () => {
  const harness = makeHarness();

  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.PLAYING);

  assert.equal(
    harness.menu.openBlockingOverlay({ owner: "storage" }),
    true
  );
  assert.equal(harness.menu.mode, MenuMode.BLOCKED);
  assert.equal(harness.menu.isSimulationPaused, true);
  assert.equal(harness.input.releaseCount, 1);

  assert.equal(
    harness.menu.closeBlockingOverlay({ owner: "storage" }),
    true
  );
  assert.equal(harness.menu.mode, MenuMode.BLOCKED);
  assert.equal(harness.input.requestCount, 1);
  assert.equal(
    harness.documentRef.getElementById("pauseModal").classList.contains("hidden"),
    true
  );

  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.PLAYING);
  assert.equal(harness.menu.isSimulationPaused, false);
});

test("live NPC overlays keep simulation running while player input is unlocked", () => {
  const harness = makeHarness();

  harness.lock();
  harness.menu.openBlockingOverlay({
    owner: "npc",
    pauseSimulation: false,
  });

  assert.equal(harness.menu.mode, MenuMode.BLOCKED);
  assert.equal(harness.menu.isSimulationPaused, false);
  assert.equal(harness.input.isLocked, false);

  harness.menu.closeBlockingOverlay({ owner: "npc" });
  assert.equal(harness.input.requestCount, 1);
  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.PLAYING);
});

test("cancel and lock failure fall back to Pause without a late resume", () => {
  const harness = makeHarness();

  harness.lock();
  harness.menu.openBlockingOverlay({ owner: "storage" });
  harness.menu.closeBlockingOverlay({ owner: "storage" });
  harness.menu.closeBlockingOverlay({
    owner: "storage",
    resumeGameplay: false,
  });
  assert.equal(harness.menu.mode, MenuMode.PAUSED);

  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.PAUSED);
  assert.equal(harness.input.isLocked, false);

  harness.menu.requestResume();
  harness.lock();
  harness.menu.openBlockingOverlay({ owner: "storage" });
  harness.menu.closeBlockingOverlay({ owner: "storage" });
  harness.menu.handlePointerLockError();
  assert.equal(harness.menu.mode, MenuMode.PAUSED);
});

test("Escape delegates to the active external overlay", () => {
  const harness = makeHarness();
  let cancelled = 0;

  harness.lock();
  harness.menu.openBlockingOverlay({
    owner: "npc",
    pauseSimulation: false,
    onCancel: () => {
      cancelled++;
      harness.menu.closeBlockingOverlay({
        owner: "npc",
        resumeGameplay: false,
      });
    },
  });

  const event = harness.documentRef.emit("keydown", {
    code: "Escape",
    repeat: false,
  });
  assert.equal(event.defaultPrevented, true);
  assert.equal(cancelled, 1);
  assert.equal(harness.menu.mode, MenuMode.PAUSED);
});

test("a forced death overlay rejects a pending dialog resume", () => {
  const harness = makeHarness();

  harness.lock();
  harness.menu.openBlockingOverlay({ owner: "npc", pauseSimulation: false });
  harness.menu.closeBlockingOverlay({ owner: "npc" });
  assert.equal(harness.input.requestCount, 1);

  harness.menu.closeBlockingOverlay({
    resumeGameplay: false,
    force: true,
  });
  harness.menu.openBlockingOverlay({ owner: "death" });

  harness.lock();
  assert.equal(harness.menu.mode, MenuMode.BLOCKED);
  assert.equal(harness.menu.isSimulationPaused, true);
  assert.equal(harness.input.isLocked, false);
});
