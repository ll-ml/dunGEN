import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { InteractionComponent } from "../src/components/interactionComponent.js";
import { FirstPersonInteractionController } from "../src/controllers/firstPersonInteractionController.js";
import { InteractionTargetResolver } from "../src/controllers/interactionTargetResolver.js";

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

function makeEntity({
  z,
  x = 0,
  interaction = true,
  rangeTiles = 2,
  visible = true,
} = {}) {
  const root = new THREE.Group();
  const nested = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  );
  nested.add(mesh);
  root.add(nested);
  root.position.set(x, 0, z);
  root.visible = visible;

  const entity = {
    model: root,
    raycastMesh: mesh,
    interaction: null,
  };

  if (interaction) {
    new InteractionComponent({
      label: "Use target",
      rangeTiles,
      execute: () => true,
    }).attach(entity);
  }

  return entity;
}

function makeResolverHarness(entities, { tileSize = 10 } = {}) {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  const root = new THREE.Group();
  for (const entity of entities) root.add(entity.model);

  const map = { tileSize, entities };
  const player = { model: new THREE.Object3D() };
  const resolver = new InteractionTargetResolver({
    camera,
    getMap: () => map,
    getRoot: () => root,
    getPlayer: () => player,
    maxRangeTiles: 2,
  });

  return { camera, map, player, resolver, root };
}

test("resolves a nested center-ray model and enforces tile-relative range", () => {
  const centered = makeEntity({ z: -10, rangeTiles: 1 });
  const harness = makeResolverHarness([centered]);
  let matrixUpdates = 0;
  const updateMatrixWorld = centered.raycastMesh.updateMatrixWorld.bind(
    centered.raycastMesh
  );
  centered.raycastMesh.updateMatrixWorld = (force) => {
    matrixUpdates++;
    return updateMatrixWorld(force);
  };

  const target = harness.resolver.resolve();
  assert.equal(target.entity, centered);
  assert.ok(Math.abs(target.distance - 9) < 1e-9);
  assert.ok(matrixUpdates > 0);

  centered.model.position.z = -12;
  assert.equal(harness.resolver.resolve(), null);

  centered.model.position.set(8, 0, -10);
  assert.equal(harness.resolver.resolve(), null);
});

test("allows a nearer non-interactable or hidden root to block or be skipped", () => {
  const blocker = makeEntity({ z: -5, interaction: false });
  const targetEntity = makeEntity({ z: -10 });
  const harness = makeResolverHarness([blocker, targetEntity]);

  assert.equal(harness.resolver.resolve(), null);

  blocker.model.visible = false;
  assert.equal(harness.resolver.resolve().entity, targetEntity);
});

test("uses the map coordinate contract to reject terrain-occluded targets", () => {
  const targetEntity = makeEntity({ z: -15 });
  const harness = makeResolverHarness([targetEntity]);
  let blocked = true;
  harness.map.worldToGrid = ({ z }) => ({ x: 0, y: z <= -10 ? 1 : 0 });
  harness.map.blocksInteractionAt = (_x, y) => blocked && y === 1;

  assert.equal(harness.resolver.resolve(), null);
  blocked = false;
  assert.equal(harness.resolver.resolve().entity, targetEntity);
});

test("revalidates targets and prevents duplicate async interactions", async () => {
  let executeCount = 0;
  let finishExecution;
  const execution = new Promise((resolve) => {
    finishExecution = resolve;
  });
  const entity = { interaction: null };
  const interaction = new InteractionComponent({
    label: "Enter dungeon",
    execute: () => {
      executeCount++;
      return execution;
    },
  });
  interaction.attach(entity);

  let currentTarget = { entity, interaction, point: new THREE.Vector3(), distance: 1 };
  const resolver = { resolve: () => currentTarget };
  const promptElement = {
    textContent: "",
    classList: new FakeClassList("hidden"),
  };
  const crosshairElement = { classList: new FakeClassList() };
  const game = { currentMap: {}, player: {}, ui: {} };
  const controller = new FirstPersonInteractionController({
    resolver,
    getGame: () => game,
    isEnabled: () => true,
    promptElement,
    crosshairElement,
    targetMissTolerance: 0,
  });

  controller.update();
  assert.equal(promptElement.textContent, "Space · Enter dungeon");
  assert.equal(promptElement.classList.contains("hidden"), false);

  const first = controller.interact();
  const duplicate = await controller.interact();
  assert.equal(duplicate, false);
  assert.equal(executeCount, 1);

  currentTarget = null;
  finishExecution(true);
  assert.equal(await first, true);
  assert.equal(controller.isBusy, false);
  assert.equal(promptElement.classList.contains("hidden"), true);
});
