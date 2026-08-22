import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Game } from "../src/Game.js";
import { MenuMode } from "../src/controllers/gameMenuController.js";

test("hands stay visible in menus after gameplay has begun", async () => {
  const game = new Game();
  game.player = { isDead: false };
  game.input = { isLocked: false };
  game.menuController = {
    mode: MenuMode.READY,
    isSimulationPaused: true,
  };

  assert.equal(game._updateHandsVisibility(), false);
  for (const mode of [MenuMode.PAUSED, MenuMode.INVENTORY, MenuMode.BLOCKED]) {
    game.menuController.mode = mode;
    assert.equal(game._updateHandsVisibility(), false);
  }
  game._handleInputLockChange(true);
  assert.equal(game._updateHandsVisibility(), false);
  game._markGameplayEntered();
  assert.equal(game._updateHandsVisibility(), true);

  game.input.isLocked = false;
  for (const mode of [
    MenuMode.PAUSED,
    MenuMode.INVENTORY,
    MenuMode.BLOCKED,
  ]) {
    game.menuController.mode = mode;
    assert.equal(game._updateHandsVisibility(), true);
  }

  game._isMapTransitioning = true;
  assert.equal(game._updateHandsVisibility(), false);
  game._isMapTransitioning = false;
  game.player.isDead = true;
  assert.equal(game._updateHandsVisibility(), false);
  game.player.isDead = false;
  game._stopped = true;
  assert.equal(game._updateHandsVisibility(), false);
  assert.equal(await game.playHandReach(), true);
});

test("shares one dungeon-entry promise while a transition is in flight", async () => {
  const game = new Game();
  let finishTransition;
  const transition = new Promise((resolve) => {
    finishTransition = resolve;
  });
  let transitionCalls = 0;
  game._enterDungeon = () => {
    transitionCalls++;
    return transition;
  };

  const first = game.enterDungeon({ width: 20 });
  const duplicate = game.enterDungeon({ width: 99 });
  const conflictingExit = game.exitDungeon();

  assert.equal(first, duplicate);
  assert.equal(transitionCalls, 1);
  assert.equal(await conflictingExit, false);

  finishTransition("ready");
  assert.equal(await first, "ready");
  assert.equal(game._mapTransitionPromise, null);
});

test("returns the same player and inventory to the retained overworld", async () => {
  const game = new Game();
  const scene = new THREE.Scene();
  const dungeonGroup = new THREE.Group();
  const overworldGroup = new THREE.Group();
  const dungeonMap = { isDungeon: true, entities: [], env: {} };
  const overworldMap = {
    isDungeon: false,
    entities: [],
    env: {},
    width: 10,
    height: 10,
    isWalkableAt: () => true,
  };
  const inventory = [{ id: "ruby", quantity: 2 }];
  const player = {
    coords: new THREE.Vector2(1, 1),
    model: new THREE.Object3D(),
    inventory,
    async addTo(parent) {
      parent.add(this.model);
      this.model.position.set(this.coords.x, 0, this.coords.y);
      return this.model;
    },
  };
  player.model.position.set(5, 0, 6);
  dungeonGroup.add(player.model);
  scene.add(dungeonGroup);

  let inputResets = 0;
  let targetClears = 0;
  let cameraSyncs = 0;
  const messages = [];
  Object.assign(game, {
    scene,
    currentMap: dungeonMap,
    currentMapGroup: dungeonGroup,
    player,
    _overworldMap: overworldMap,
    _overworldGroup: overworldGroup,
    _overworldReturnState: {
      coords: new THREE.Vector2(7, 8),
      position: new THREE.Vector3(70, 0, 80),
    },
    input: { resetTransientState: () => inputResets++ },
    interactionController: { clearTarget: () => targetClears++ },
    playerController: { syncFromPlayer: () => cameraSyncs++ },
    status: { addStatus: (message) => messages.push(message) },
  });
  game._updateOverworldEditorAvailability = () => {};

  const result = await game.exitDungeon();

  assert.equal(result, overworldMap);
  assert.equal(game.currentMap, overworldMap);
  assert.equal(game.currentMapGroup, overworldGroup);
  assert.equal(game.player, player);
  assert.equal(game.player.inventory, inventory);
  assert.deepEqual(player.coords.toArray(), [7, 8]);
  assert.deepEqual(player.model.position.toArray(), [70, 0, 80]);
  assert.equal(player.model.parent, overworldGroup);
  assert.equal(scene.children.includes(dungeonGroup), false);
  assert.equal(inputResets, 2);
  assert.equal(targetClears, 1);
  assert.equal(cameraSyncs, 1);
  assert.deepEqual(messages, ["Returned to the overworld."]);
  assert.equal(game._mapTransitionPromise, null);
  assert.equal(game._mapTransitionKind, null);
});

test("stopping the game cancels an in-flight dungeon exit", async () => {
  const game = new Game();
  const scene = new THREE.Scene();
  const dungeonGroup = new THREE.Group();
  const overworldGroup = new THREE.Group();
  const dungeonMap = { isDungeon: true, entities: [], env: {} };
  const overworldMap = {
    isDungeon: false,
    entities: [],
    env: {},
    width: 4,
    height: 4,
    isWalkableAt: () => true,
  };
  let finishAdd;
  const player = {
    coords: new THREE.Vector2(1, 1),
    model: new THREE.Object3D(),
    addTo(parent) {
      parent.add(this.model);
      return new Promise((resolve) => {
        finishAdd = () => resolve(this.model);
      });
    },
  };
  player.model.position.set(5, 0, 6);
  dungeonGroup.add(player.model);
  scene.add(dungeonGroup);
  Object.assign(game, {
    scene,
    currentMap: dungeonMap,
    currentMapGroup: dungeonGroup,
    player,
    _overworldMap: overworldMap,
    _overworldGroup: overworldGroup,
    _overworldReturnState: {
      coords: new THREE.Vector2(2, 2),
      position: new THREE.Vector3(20, 0, 20),
    },
  });
  game._updateOverworldEditorAvailability = () => {};

  const transition = game.exitDungeon();
  assert.equal(typeof finishAdd, "function");
  game.stop();
  finishAdd();

  assert.equal(await transition, false);
  assert.equal(game.currentMap, dungeonMap);
  assert.equal(game.currentMapGroup, dungeonGroup);
  assert.equal(player.model.parent, dungeonGroup);
  assert.deepEqual(player.coords.toArray(), [1, 1]);
  assert.deepEqual(player.model.position.toArray(), [5, 0, 6]);
  assert.equal(scene.children.includes(overworldGroup), false);
});

test("rejects other map mutations while a transition is active", async () => {
  const originalDocument = globalThis.document;
  const feedback = { textContent: "" };
  globalThis.document = {
    getElementById(id) {
      return id === "overworldEditorFeedback" ? feedback : null;
    },
  };

  try {
    const game = new Game();
    let regenerationCalls = 0;
    game.currentMap = {
      isDungeon: false,
      regenerate() {
        regenerationCalls++;
      },
    };
    game._isMapTransitioning = true;

    await game._regenerateOverworld({});
    assert.equal(regenerationCalls, 0);
    assert.equal(feedback.textContent, "A map transition is already in progress.");
    assert.equal(await game.enterDungeon(), false);
  } finally {
    globalThis.document = originalDocument;
  }
});
