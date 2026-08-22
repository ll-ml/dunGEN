import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../src/Game.js";
import { ModelComponent } from "../src/components/modelComponent.js";
import { NPC } from "../src/NPC.js";

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

function makeElement(...classes) {
  return {
    classList: new FakeClassList(...classes),
    attributes: new Map(),
    innerHTML: "",
    textContent: "",
    children: [],
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    appendChild(child) {
      this.children.push(child);
    },
    focus() {
      this.focused = true;
    },
  };
}

test("NPC dialogs keep the world live and pause only the selected NPC", () => {
  let openOptions = null;
  let closeOptions = null;
  let pauseCount = 0;
  let resumeCount = 0;
  const npc = {
    pause() {
      pauseCount++;
    },
    resume() {
      resumeCount++;
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    _npcModal: makeElement("hidden"),
    _npcText: makeElement(),
    _npcOptions: makeElement(),
    _npcClose: makeElement(),
    _activeNpc: null,
    _pickNpcOptions: () => [],
    menuController: {
      openBlockingOverlay(options) {
        openOptions = options;
        return true;
      },
      closeBlockingOverlay(options) {
        closeOptions = options;
        return true;
      },
    },
  });

  assert.equal(game._openNpcDialog(npc), true);
  assert.equal(openOptions.pauseSimulation, false);
  assert.equal(pauseCount, 1);
  assert.equal(game._activeNpc, npc);
  assert.equal(game._npcModal.classList.contains("hidden"), false);

  assert.equal(game._closeNpcDialog(), true);
  assert.equal(closeOptions.resumeGameplay, true);
  assert.equal(resumeCount, 1);
  assert.equal(game._activeNpc, null);
  assert.equal(game._npcModal.classList.contains("hidden"), true);
});

test("NPC pause preserves an in-progress route until resume", () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= new Promise(() => {});
    return this._loadPromise;
  };

  try {
    const npc = new NPC(0, 0);
    npc.model = new THREE.Object3D();
    npc.model.position.set(5, 0, 0);
    npc.path = [new THREE.Vector2(1, 0)];
    npc._targetWorldPos = new THREE.Vector3(10, 0, 0);
    const originalTarget = npc._targetWorldPos;
    const map = {
      gridToWorld: (x, y) => new THREE.Vector3(x * 10, 0, y * 10),
      isWalkableAt: () => true,
    };

    npc.pause();
    npc.think(map);
    npc.updateMovement(1, map);
    assert.equal(npc.path.length, 1);
    assert.equal(npc._targetWorldPos, originalTarget);
    assert.deepEqual(npc.model.position.toArray(), [5, 0, 0]);
    assert.deepEqual(npc.coords.toArray(), [0, 0]);

    npc.resume();
    npc.updateMovement(1, map);
    assert.deepEqual(npc.coords.toArray(), [1, 0]);
    assert.deepEqual(npc.model.position.toArray(), [10, 0, 0]);
    assert.equal(npc.path.length, 0);
    assert.equal(npc._targetWorldPos, null);
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});
