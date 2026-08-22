import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { DungeonEntrance } from "../src/DungeonEntrance.js";
import { ModelComponent } from "../src/components/modelComponent.js";
import { FirstPersonInteractionController } from "../src/controllers/firstPersonInteractionController.js";
import { InteractionTargetResolver } from "../src/controllers/interactionTargetResolver.js";
import { FirstPersonHandsViewModel } from "../src/viewmodels/firstPersonHandsViewModel.js";
import { Dungeon } from "../src/dungeon.js";
import { Game } from "../src/Game.js";
import { InventoryItem } from "../src/inventory.js";
import { generateLoot } from "../src/loot.js";
import { Player } from "../src/player.js";
import { buildDungeon } from "../src/render.js";
import { DroppedItem, StorageItem } from "../src/storageItem.js";
import { TileType } from "../src/types.js";

function canReachExit(dungeon, start, exit) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const targets = new Set(
    directions
      .map(([dx, dy]) => ({ x: exit.coords.x + dx, y: exit.coords.y + dy }))
      .filter(({ x, y }) => dungeon.isWalkableAt(x, y))
      .map(({ x, y }) => `${x},${y}`)
  );
  const queue = [{ x: start.x, y: start.y }];
  const visited = new Set();

  for (let index = 0; index < queue.length; index++) {
    const position = queue[index];
    const key = `${position.x},${position.y}`;
    if (visited.has(key) || !dungeon.isWalkableAt(position.x, position.y)) continue;
    if (targets.has(key)) return true;
    visited.add(key);
    for (const [dx, dy] of directions) {
      queue.push({ x: position.x + dx, y: position.y + dy });
    }
  }

  return false;
}

test("storage and dungeon gates expose first-person interactions", async () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const storage = new StorageItem("Barrel", 2, 3, [{ id: "loot" }]);
    storage.model = new THREE.Object3D();
    storage.model.scale.setScalar(storage.scale);
    let openedStorage = null;
    let openedStorageMap = null;
    let handDuration = null;
    let finishHandAnimation = null;
    const storageMap = { id: "storage-map" };
    assert.equal(storage.interaction.getLabel(), "Search Barrel");
    assert.equal(storage.interaction.rangeTiles, 1.5);
    const openingStorage = storage.interaction.execute({
      map: storageMap,
      game: {
        playHandReach: ({ duration }) => {
          handDuration = duration;
          return new Promise((resolve) => {
            finishHandAnimation = resolve;
          });
        },
        ui: {
          openStorageModal: (entity, map) => {
            openedStorage = entity;
            openedStorageMap = map;
            return true;
          },
        },
      },
    });
    assert.equal(openedStorage, null);
    assert.equal(handDuration, storage.openAnimation.duration);
    storage.updateVisual(0.05);
    assert.ok(storage.model.position.y > 0);
    for (let i = 0; i < 6; i++) storage.updateVisual(0.05);
    await Promise.resolve();
    assert.equal(openedStorage, null);
    finishHandAnimation(true);
    assert.equal(await openingStorage, true);
    assert.equal(openedStorage, storage);
    assert.equal(openedStorageMap, storageMap);

    const emptyStorage = new StorageItem("Empty Barrel", 2, 3);
    assert.equal(emptyStorage.interaction.isAvailable(), false);

    const dropped = new DroppedItem(
      "Cake",
      2,
      3,
      "./public/cake.glb",
      { name: "Cake", quantity: 1 },
      { tileSize: 8 }
    );
    let pickedUpEntity = null;
    let pickedUpMap = null;
    await dropped.interaction.execute({
      map: storageMap,
      game: {
        pickUpDroppedItem: (entity, map) => {
          pickedUpEntity = entity;
          pickedUpMap = map;
          return true;
        },
      },
    });
    assert.equal(dropped.interaction.getLabel(), "Pick up Cake");
    assert.equal(dropped.interaction.rangeTiles, 1.5);
    assert.equal(dropped.scale, 4);
    assert.equal(pickedUpEntity, dropped);
    assert.equal(pickedUpMap, storageMap);

    const entrance = new DungeonEntrance(4, 5, {
      modelPath: "./public/wall-gate.glb",
      scale: 8,
      id: "Dungeon Gate",
      label: "Enter next dungeon",
    });
    let transitionOptions = null;
    const transitionResult = await entrance.interaction.execute({
      game: {
        enterDungeon: (options) => {
          transitionOptions = options;
          return Promise.resolve("next-dungeon");
        },
      },
    });
    assert.equal(entrance.interaction.getLabel(), "Enter next dungeon");
    assert.equal(transitionOptions.entrance, entrance);
    assert.equal(transitionResult, "next-dungeon");

    const exit = new DungeonEntrance(6, 7, {
      destination: "overworld",
    });
    let exitOptions = null;
    const exitResult = await exit.interaction.execute({
      game: {
        exitDungeon: (options) => {
          exitOptions = options;
          return Promise.resolve("overworld");
        },
      },
    });
    assert.equal(exit.interaction.id, "exit-dungeon");
    assert.equal(exit.interaction.getLabel(), "Return to overworld");
    assert.equal(exitOptions.entrance, exit);
    assert.equal(exitResult, "overworld");
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("cancelled or stale storage animations cannot open a late modal", async () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const storage = new StorageItem("Barrel", 2, 3, [{ id: "loot" }]);
    storage.model = new THREE.Object3D();
    storage.model.scale.setScalar(storage.scale);
    const map = { entities: [storage] };
    let modalCalls = 0;
    const game = new Game();
    const hands = new FirstPersonHandsViewModel();
    game.handsViewModel = hands;
    game._storageModal = {
      classList: { remove() {} },
      setAttribute() {},
    };
    game._storageSlots = [];
    Object.assign(game, {
      currentMap: map,
      input: { isLocked: true },
      menuController: {
        isSimulationPaused: false,
        openBlockingOverlay: () => true,
      },
    });
    game.ui = {
      openStorageModal: (entity, ownerMap) => {
        const opened = game._openStorageModal(entity, ownerMap);
        if (opened) modalCalls++;
        return opened;
      },
    };

    const cancelled = storage.interaction.execute({ game, map });
    storage.updateVisual(0.05);
    hands.update(0.05, false, true);
    game._cancelInteractionAnimations();
    assert.equal(await cancelled, false);
    assert.equal(modalCalls, 0);

    const stale = storage.interaction.execute({ game, map });
    game.currentMap = { entities: [] };
    for (let i = 0; i < 7; i++) {
      storage.updateVisual(0.05);
      hands.update(0.05, false, true);
    }
    assert.equal(await stale, false);
    assert.equal(modalCalls, 0);

    game.currentMap = map;
    const replay = storage.interaction.execute({ game, map });
    for (let i = 0; i < 7; i++) {
      storage.updateVisual(0.05);
      hands.update(0.05, false, true);
    }
    assert.equal(await replay, true);
    assert.equal(modalCalls, 1);
    assert.equal(hands.isActionPlaying, false);
    hands.dispose();
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("removing an opening storage entity settles its animation", async () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const storage = new StorageItem("Barrel", 2, 3, [{ id: "loot" }]);
    storage.model = new THREE.Object3D();
    const dungeon = new Dungeon(6, 6);
    dungeon.entities.push(storage);

    const opening = storage.openAnimation.play();
    storage.updateVisual(0.05);

    assert.equal(dungeon.removeEntity(storage), true);
    assert.equal(await opening, false);
    assert.equal(storage.openAnimation.isPlaying, false);
    assert.equal(dungeon.entities.includes(storage), false);
    assert.equal(dungeon.removeEntity(storage), false);
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("dungeon door tiles spawn one blocking entrance entity", () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const dungeon = new Dungeon(8, 8, { tileSize: 8 });
    dungeon.denseMatrix = Array.from(
      { length: dungeon.height },
      () => Array(dungeon.width).fill(TileType.FLOOR)
    );
    dungeon.dungeonRooms = [{ x: 1, y: 2, width: 4, height: 3 }];
    dungeon.denseMatrix[1][3] = TileType.WALL;

    dungeon.placeDoors();

    assert.equal(dungeon.denseMatrix[1][3], TileType.DOOR);
    assert.equal(dungeon.entities.length, 1);
    assert.ok(dungeon.entities[0] instanceof DungeonEntrance);
    assert.equal(dungeon.entities[0].destination, "overworld");
    assert.equal(dungeon.entities[0].interaction.getLabel(), "Return to overworld");
    assert.equal(dungeon.entities[0].scale, dungeon.tileSize);
    assert.equal(dungeon.isWalkableAt(3, 1), false);
    assert.equal(dungeon.blocksInteractionAt(3, 1), false);
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("every generated dungeon has exactly one overworld exit", async () => {
  const originalLoad = ModelComponent.prototype.load;
  const originalRandom = Math.random;
  let state = 0x12345678;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  try {
    const dungeon = new Dungeon(40, 30, { tileSize: 8 });
    for (let generation = 0; generation < 25; generation++) {
      await dungeon.generateDungeon();
      const gates = dungeon.entities.filter(
        (entity) => entity instanceof DungeonEntrance
      );
      const exits = gates.filter(
        (gate) => gate.destination === "overworld"
      );
      const doorCount = dungeon.denseMatrix.flat().filter(
        (tile) => tile === TileType.DOOR
      ).length;

      assert.ok(gates.length >= 1);
      assert.equal(exits.length, 1);
      assert.equal(doorCount, gates.length);
      assert.equal(dungeon.overworldExit, exits[0]);
      assert.equal(exits[0].interaction.getLabel(), "Return to overworld");
      assert.equal(dungeon.isWalkableAt(exits[0].coords.x, exits[0].coords.y), false);
      assert.equal(
        dungeon.blocksInteractionAt(exits[0].coords.x, exits[0].coords.y),
        false
      );

      const player = {
        coords: new THREE.Vector2(),
        path: null,
        _targetWorldPos: null,
      };
      dungeon.placePlayer(player);
      assert.equal(dungeon.isWalkableAt(player.coords.x, player.coords.y), true);
      assert.equal(
        dungeon.entities.some((entity) => entity.coords.equals(player.coords)),
        false
      );
      assert.equal(canReachExit(dungeon, player.coords, exits[0]), true);
    }
  } finally {
    Math.random = originalRandom;
    ModelComponent.prototype.load = originalLoad;
  }
});

test("a solid dungeon gate remains targetable but walls occlude it", () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const dungeon = new Dungeon(5, 5, { tileSize: 8 });
    dungeon.denseMatrix = Array.from(
      { length: dungeon.height },
      () => Array(dungeon.width).fill(TileType.FLOOR)
    );
    dungeon.denseMatrix[1][2] = TileType.DOOR;

    const gate = new DungeonEntrance(2, 1, {
      modelPath: "./public/wall-gate.glb",
      scale: dungeon.tileSize,
      label: "Enter next dungeon",
    });
    const gateRoot = new THREE.Group();
    const gateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 2),
      new THREE.MeshBasicMaterial()
    );
    gateMesh.position.y = 3;
    gateRoot.add(gateMesh);
    gateRoot.position.copy(dungeon.gridToWorld(2, 1));
    gate.model = gateRoot;
    dungeon.entities = [gate];

    const mapRoot = new THREE.Group();
    mapRoot.add(gateRoot);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.copy(dungeon.gridToWorld(2, 3));
    camera.position.y = 3;
    const lookAt = dungeon.gridToWorld(2, 1);
    lookAt.y = 3;
    camera.lookAt(lookAt);

    const resolver = new InteractionTargetResolver({
      camera,
      getMap: () => dungeon,
      getRoot: () => mapRoot,
      getPlayer: () => ({ model: new THREE.Object3D() }),
    });

    assert.equal(dungeon.isWalkableAt(2, 1), false);
    assert.equal(resolver.resolve()?.entity, gate);

    dungeon.denseMatrix[2][2] = TileType.WALL;
    assert.equal(resolver.resolve(), null);
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("a dropped item uses the crosshair resolver before the target behind it", () => {
  const originalLoad = ModelComponent.prototype.load;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };

  try {
    const dungeon = new Dungeon(5, 5, { tileSize: 8 });
    dungeon.denseMatrix = Array.from(
      { length: dungeon.height },
      () => Array(dungeon.width).fill(TileType.FLOOR)
    );
    const dropped = new DroppedItem(
      "Cake",
      2,
      2,
      "./public/cake.glb",
      { id: "cake", name: "Cake", quantity: 1 },
      { tileSize: dungeon.tileSize }
    );
    const entrance = new DungeonEntrance(2, 1, {
      modelPath: "./public/wall-gate.glb",
      scale: dungeon.tileSize,
      label: "Enter next dungeon",
    });

    const droppedRoot = new THREE.Group();
    const droppedMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial()
    );
    droppedMesh.position.y = 3;
    droppedRoot.add(droppedMesh);
    droppedRoot.position.copy(dungeon.gridToWorld(2, 2));
    dropped.model = droppedRoot;

    const entranceRoot = new THREE.Group();
    const entranceMesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 2),
      new THREE.MeshBasicMaterial()
    );
    entranceMesh.position.y = 3;
    entranceRoot.add(entranceMesh);
    entranceRoot.position.copy(dungeon.gridToWorld(2, 1));
    entrance.model = entranceRoot;

    dungeon.entities = [dropped, entrance];
    const mapRoot = new THREE.Group();
    mapRoot.add(droppedRoot, entranceRoot);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    camera.position.copy(dungeon.gridToWorld(2, 3));
    camera.position.y = 3;
    const lookAt = dungeon.gridToWorld(2, 1);
    lookAt.y = 3;
    camera.lookAt(lookAt);

    const resolver = new InteractionTargetResolver({
      camera,
      getMap: () => dungeon,
      getRoot: () => mapRoot,
      getPlayer: () => ({ model: new THREE.Object3D() }),
    });
    assert.equal(resolver.resolve()?.entity, dropped);

    const game = Object.assign(Object.create(Game.prototype), {
      currentMap: dungeon,
      player: {
        inventory: [],
        addItem: () => 1,
      },
      ui: { renderInventory() {} },
      status: { addStatus() {} },
    });
    assert.equal(game.pickUpDroppedItem(dropped, dungeon), true);
    assert.equal(resolver.resolve()?.entity, entrance);
  } finally {
    ModelComponent.prototype.load = originalLoad;
  }
});

test("generated loot items do not share mutable stack state", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const [first, second] = generateLoot(2);
    assert.notEqual(first, second);
    first.quantity = 9;
    assert.equal(second.quantity, 1);
    assert.equal(generateLoot(1)[0].quantity, 1);

    Math.random = () => 0.99;
    assert.equal(generateLoot(1)[0].glbPath, "./public/coin.glb");
  } finally {
    Math.random = originalRandom;
  }
});

test("dungeon loot barrels never share a tile", () => {
  const originalLoad = ModelComponent.prototype.load;
  const originalRandom = Math.random;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };
  Math.random = () => 0;

  try {
    const dungeon = new Dungeon(6, 6);
    dungeon.denseMatrix = Array.from(
      { length: dungeon.height },
      () => Array(dungeon.width).fill(TileType.FLOOR)
    );
    dungeon.dungeonRooms = [{ x: 1, y: 1, width: 2, height: 2 }];
    dungeon.randInt = (min) => min;

    dungeon.spawnLoot();

    const barrels = dungeon.entities.filter(
      (entity) => entity instanceof StorageItem
    );
    const occupiedTiles = new Set(
      barrels.map((barrel) => `${barrel.coords.x},${barrel.coords.y}`)
    );
    assert.equal(barrels.length, 2);
    assert.equal(occupiedTiles.size, barrels.length);
  } finally {
    Math.random = originalRandom;
    ModelComponent.prototype.load = originalLoad;
  }
});

test("empty storage is removed from its owning map", () => {
  const storage = {
    contents: [{ id: "loot", name: "Ruby", quantity: 1 }],
    model: new THREE.Group(),
  };
  const scene = new THREE.Group();
  scene.add(storage.model);

  let removedFromOwner = null;
  let removedFromCurrent = null;
  let modalClosed = false;
  const statusMessages = [];
  const ownerMap = {
    removeEntity(entity) {
      removedFromOwner = entity;
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    _activeStorage: storage,
    _activeStorageMap: ownerMap,
    currentMap: {
      removeEntity(entity) {
        removedFromCurrent = entity;
      },
    },
    player: {
      inventory: [],
      addItem: () => 1,
    },
    ui: { renderInventory() {} },
    status: { addStatus: (message) => statusMessages.push(message) },
    _closeStorageModal() {
      modalClosed = true;
    },
  });

  game._takeStorageItem(0);

  assert.equal(removedFromOwner, storage);
  assert.equal(removedFromCurrent, null);
  assert.equal(storage.model.parent, null);
  assert.equal(modalClosed, true);
  assert.deepEqual(statusMessages, ["Picked up Ruby."]);
});

test("storage stacks decrease by the exact amount accepted", () => {
  const makeItem = (quantity) => new InventoryItem(
    "berry",
    "Berry",
    "./Items/berry.png",
    "A berry.",
    "food",
    null,
    { stackable: true, maxStackSize: 10, quantity }
  );
  const player = Object.assign(Object.create(Player.prototype), {
    inventory: [
      makeItem(8),
      ...Array.from({ length: 8 }, (_, index) => new InventoryItem(
        `filler-${index}`,
        `Filler ${index}`,
        "./Items/filler.png",
        "Filler.",
        "loot",
        null,
        { stackable: false, quantity: 1 }
      )),
    ],
    maxInvenotrySlots: 9,
  });
  const storageItem = makeItem(5);
  const storage = {
    contents: [storageItem],
    model: new THREE.Group(),
  };
  let storageRenders = 0;
  let modalClosed = false;
  const messages = [];
  const ownerMap = {
    entities: [storage],
    removeEntity(entity) {
      this.entities.splice(this.entities.indexOf(entity), 1);
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    player,
    _activeStorage: storage,
    _activeStorageMap: ownerMap,
    ui: { renderInventory() {} },
    status: { addStatus: (message) => messages.push(message) },
    _renderStorageSlots() {
      storageRenders += 1;
    },
    _closeStorageModal() {
      modalClosed = true;
    },
  });

  game._takeStorageItem(0);

  assert.equal(player.inventory[0].quantity, 10);
  assert.equal(storageItem.quantity, 3);
  assert.equal(storageRenders, 1);
  assert.equal(modalClosed, false);

  player.inventory.pop();
  game._takeStorageItem(0);

  assert.equal(storage.contents.length, 0);
  assert.equal(ownerMap.entities.length, 0);
  assert.equal(modalClosed, true);
  assert.deepEqual(messages, [
    "Picked up Berry ×2.",
    "Picked up Berry ×3.",
  ]);
});

test("storage source is committed before pickup presentation", () => {
  const item = new InventoryItem(
    "ruby",
    "Ruby",
    "./Items/ruby.png",
    "A ruby.",
    "loot",
    null,
    { stackable: true, maxStackSize: 10, quantity: 1 }
  );
  const storage = { contents: [item], model: new THREE.Group() };
  const player = Object.assign(Object.create(Player.prototype), {
    inventory: [],
    maxInvenotrySlots: 9,
  });
  const ownerMap = {
    entities: [storage],
    removeEntity(entity) {
      this.entities.splice(this.entities.indexOf(entity), 1);
    },
  };
  const statusMessages = [];
  const game = Object.assign(Object.create(Game.prototype), {
    player,
    _activeStorage: storage,
    _activeStorageMap: ownerMap,
    ui: {
      renderInventory() {
        throw new Error("presentation failed");
      },
    },
    status: { addStatus: (message) => statusMessages.push(message) },
    _closeStorageModal() {},
  });

  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  try {
    assert.doesNotThrow(() => game._takeStorageItem(0));
    assert.equal(player.inventory[0].quantity, 1);
    assert.equal(storage.contents.length, 0);
    assert.equal(ownerMap.entities.length, 0);
    assert.deepEqual(statusMessages, ["Picked up Ruby."]);
    assert.equal(loggedErrors.length, 1);

    game._takeStorageItem(0);
    assert.equal(player.inventory[0].quantity, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("ground pickup removes complete stacks and preserves partial stacks", () => {
  const completeModel = new THREE.Group();
  const partialModel = new THREE.Group();
  const scene = new THREE.Group();
  scene.add(completeModel, partialModel);

  const complete = {
    item: { id: "coins", name: "Gold coins", quantity: 3 },
    model: completeModel,
  };
  const partial = {
    item: { id: "cake", name: "Cake", quantity: 2 },
    model: partialModel,
  };
  const removed = [];
  const statusMessages = [];
  let nextTaken = 3;
  const game = Object.assign(Object.create(Game.prototype), {
    player: {
      inventory: [],
      addItem: () => nextTaken,
    },
    ui: { renderInventory() {} },
    status: { addStatus: (message) => statusMessages.push(message) },
  });
  const map = {
    entities: [complete, partial],
    removeEntity(entity) {
      removed.push(entity);
      this.entities.splice(this.entities.indexOf(entity), 1);
    },
  };
  game.currentMap = map;

  assert.equal(game.pickUpDroppedItem(complete, map), true);
  assert.deepEqual(removed, [complete]);
  assert.equal(completeModel.parent, null);

  nextTaken = 1;
  assert.equal(game.pickUpDroppedItem(partial, map), true);
  assert.deepEqual(removed, [complete]);
  assert.equal(partial.item.quantity, 1);
  assert.equal(partialModel.parent, scene);

  nextTaken = 0;
  assert.equal(game.pickUpDroppedItem(partial, map), false);
  assert.equal(partial.item.quantity, 1);
  assert.equal(game.pickUpDroppedItem(complete, map), false);
  assert.deepEqual(statusMessages, [
    "Picked up Gold coins ×3.",
    "Picked up Cake.",
    "Inventory is full.",
  ]);
});

test("ground pickup stays successful when inventory presentation fails", async () => {
  const originalLoad = ModelComponent.prototype.load;
  const originalConsoleError = console.error;
  ModelComponent.prototype.load = function loadStub() {
    this._loadPromise ??= Promise.resolve(null);
    return this._loadPromise;
  };
  console.error = () => {};

  try {
    const item = new InventoryItem(
      "cake",
      "Cake",
      "./Items/cake.png",
      "A cake.",
      "food",
      null,
      { stackable: false, quantity: 1 }
    );
    const dropped = new DroppedItem(
      "Cake",
      1,
      1,
      "./public/cake.glb",
      item
    );
    dropped.model = new THREE.Group();
    const root = new THREE.Group();
    root.add(dropped.model);
    const map = {
      tileSize: 11,
      entities: [dropped],
      removeEntity(entity) {
        this.entities.splice(this.entities.indexOf(entity), 1);
      },
    };
    const player = Object.assign(Object.create(Player.prototype), {
      inventory: [],
      maxInvenotrySlots: 9,
    });
    const statusMessages = [];
    const game = Object.assign(Object.create(Game.prototype), {
      currentMap: map,
      player,
      status: { addStatus: (message) => statusMessages.push(message) },
      ui: {
        renderInventory() {
          throw new Error("presentation failed");
        },
      },
    });
    game.ui.addStatus = (message) => game._addStatus(message);

    const makeTarget = () => ({
      entity: dropped,
      interaction: dropped.interaction,
      point: new THREE.Vector3(),
      distance: 1,
    });
    const resolver = {
      resolve: () => map.entities.includes(dropped) ? makeTarget() : null,
    };
    const classList = { toggle() {} };
    const controller = new FirstPersonInteractionController({
      resolver,
      getGame: () => game,
      isEnabled: () => true,
      promptElement: { textContent: "", classList },
      crosshairElement: { classList },
      targetMissTolerance: 0,
    });

    assert.equal(await controller.interact(), true);
    assert.equal(player.inventory[0].quantity, 1);
    assert.equal(map.entities.length, 0);
    assert.equal(dropped.model.parent, null);
    assert.deepEqual(statusMessages, ["Picked up Cake."]);
  } finally {
    ModelComponent.prototype.load = originalLoad;
    console.error = originalConsoleError;
  }
});

test("dungeon renderer leaves gate rendering to the entrance entity", () => {
  const group = new THREE.Group();
  const floor = new THREE.Group();
  floor.userData.tileModel = "floor";
  const gate = new THREE.Group();
  gate.userData.tileModel = "gate";

  buildDungeon(
    group,
    {
      [TileType.FLOOR]: floor,
      [TileType.DOOR]: gate,
    },
    [[TileType.DOOR]],
    8
  );

  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].userData.tileModel, "floor");
});
