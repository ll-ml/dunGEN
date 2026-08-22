import test from "node:test";
import assert from "node:assert/strict";
import { setupInventoryContext } from "../src/inventory.js";
import { ModelComponent } from "../src/components/modelComponent.js";

class FakeElement {
  constructor() {
    this.style = {};
    this.children = [];
    this.oncontextmenu = null;
    this.onclick = null;
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(child) {
    return this.appendChild(child);
  }

  contains(target) {
    return target === this || this.children.includes(target);
  }
}

test("inventory context menu owns outside-click cleanup and disposal", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const slot = new FakeElement();
  const menu = new FakeElement();
  const listeners = new Map();
  const map = { entities: [] };
  const scene = {};
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  globalThis.document = {
    querySelectorAll: () => [slot],
    getElementById: (id) => id === "ctxMenu" ? menu : null,
    createElement: () => new FakeElement(),
  };
  globalThis.window = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };

  try {
    const player = {
      inventory: [],
      coords: { x: 0, y: 0 },
      combat: { hp: 10 },
      removeItem(index, quantity) {
        this.inventory[index].quantity -= quantity;
      },
    };
    const dispose = setupInventoryContext({
      player,
      getMap: () => map,
      getScene: () => scene,
      ui: {},
    });

    player.inventory.push({
      id: "test-item",
      name: "Test Item",
      description: "A test item.",
      imagePath: "./Items/test.png",
      type: "default",
      quantity: 5,
      onUse() {},
    });

    slot.oncontextmenu({
      preventDefault() {},
      pageX: 12,
      pageY: 34,
    });
    assert.equal(menu.style.display, "block");
    assert.equal(menu.children.length, 3);

    listeners.get("click")({ target: new FakeElement() });
    assert.equal(menu.style.display, "none");

    slot.oncontextmenu({
      preventDefault() {},
      pageX: 12,
      pageY: 34,
    });
    menu.children[2].onclick();
    assert.equal(map.entities.length, 1);
    assert.notEqual(map.entities[0].item, player.inventory[0]);
    assert.equal(map.entities[0].item.quantity, 1);
    assert.equal(player.inventory[0].quantity, 4);

    slot.oncontextmenu({
      preventDefault() {},
      pageX: 12,
      pageY: 34,
    });
    dispose();
    assert.equal(slot.oncontextmenu, null);
    assert.equal(menu.style.display, "none");
    assert.equal(listeners.has("click"), false);
  } finally {
    ModelComponent.prototype.load = originalLoad;
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
