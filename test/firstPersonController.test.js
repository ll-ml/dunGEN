import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FirstPersonController } from "../src/controllers/firstPersonController.js";
import { findNearestWalkable } from "../src/gridNavigation.js";

function makeMap({ blocked = new Set(), tileSize = 11 } = {}) {
  const width = 5;
  const height = 5;
  const offsetX = -(width * tileSize) / 2;
  const offsetZ = -(height * tileSize) / 2;

  return {
    width,
    height,
    tileSize,
    worldToGrid({ x, z }) {
      const gridX = Math.floor((x - offsetX) / tileSize);
      const gridY = Math.floor((z - offsetZ) / tileSize);
      if (gridX < 0 || gridY < 0 || gridX >= width || gridY >= height) {
        return null;
      }
      return { x: gridX, y: gridY };
    },
    isWalkableAt(x, y) {
      return (
        x >= 0 && y >= 0 && x < width && y < height &&
        !blocked.has(`${x},${y}`)
      );
    },
  };
}

function makeHarness({ axes = {}, blocked, tileSize } = {}) {
  const map = makeMap({ blocked, tileSize });
  const player = {
    model: new THREE.Object3D(),
    coords: new THREE.Vector2(2, 2),
    path: [],
    isDead: false,
    _playAction() {},
  };
  const input = {
    isLocked: true,
    consumeLookDelta(target) {
      return target.set(0, 0);
    },
    getMovementAxes(target) {
      target.forward = axes.forward ?? 0;
      target.right = axes.right ?? 0;
      return target;
    },
  };
  const camera = new THREE.PerspectiveCamera();
  const controller = new FirstPersonController({
    camera,
    input,
    getPlayer: () => player,
    getMap: () => map,
  });
  controller.syncFromPlayer();

  return { map, player, input, camera, controller };
}

test("normalizes diagonal movement and keeps the camera on the player", () => {
  const straight = makeHarness({ axes: { forward: 1 } });
  assert.equal(straight.controller.update(0.05), true);
  assert.equal(straight.controller.isMoving, true);
  const straightDistance = straight.player.model.position.length();

  const diagonal = makeHarness({ axes: { forward: 1, right: 1 } });
  diagonal.controller.update(0.05);

  assert.ok(Math.abs(straightDistance - 2.2) < 1e-9);
  assert.ok(Math.abs(diagonal.player.model.position.length() - straightDistance) < 1e-9);
  assert.equal(straight.camera.position.x, straight.player.model.position.x);
  assert.equal(straight.camera.position.z, straight.player.model.position.z);
  assert.ok(Math.abs(straight.camera.position.y - 7.26) < 1e-9);
  assert.equal(straight.player.model.visible, false);
});

test("reports movement only when the player actually changes position", () => {
  const idle = makeHarness();
  assert.equal(idle.controller.update(0.05), false);
  assert.equal(idle.controller.isMoving, false);

  const blocked = makeHarness({
    axes: { forward: 1 },
    blocked: new Set(["2,2"]),
  });
  assert.equal(blocked.controller.update(0.05), false);
  assert.equal(blocked.controller.isMoving, false);

  const dead = makeHarness({ axes: { forward: 1 } });
  dead.player.isDead = true;
  assert.equal(dead.controller.update(0.05), false);
  assert.equal(dead.controller.isMoving, false);
});

test("slides along blocked tiles and keeps grid coordinates integral", () => {
  const harness = makeHarness({
    axes: { forward: 1, right: 1 },
    blocked: new Set(["3,2"]),
  });
  harness.player.model.position.x = 3.2;

  harness.controller.update(0.05);

  assert.equal(harness.player.model.position.x, 3.2);
  assert.ok(harness.player.model.position.z < 0);
  assert.equal(Number.isInteger(harness.player.coords.x), true);
  assert.equal(Number.isInteger(harness.player.coords.y), true);
});

test("clamps large frame deltas to prevent tile tunneling", () => {
  const expected = makeHarness({ axes: { forward: 1 } });
  expected.controller.update(0.05);

  const delayed = makeHarness({ axes: { forward: 1 } });
  delayed.controller.update(10);

  assert.ok(
    delayed.player.model.position.distanceTo(expected.player.model.position) < 1e-9
  );
});

test("finds the nearest safe tile for a blocked spawn", () => {
  const map = {
    width: 3,
    height: 3,
    isWalkableAt: (x, y) => x === 2 && y === 1,
  };

  assert.deepEqual(findNearestWalkable(map, 1, 1), { x: 2, y: 1 });
});

test("applies a finite, clamped mouse-sensitivity multiplier", () => {
  const harness = makeHarness();
  harness.input.consumeLookDelta = (target) => target.set(10, 0);
  harness.controller.lookSmoothing = 0;

  assert.equal(harness.controller.setLookSensitivityMultiplier(2), 2);
  harness.controller.update(0);
  assert.ok(Math.abs(harness.controller.yaw + 0.08) < 1e-9);

  assert.equal(harness.controller.setLookSensitivityMultiplier(99), 5);
  assert.equal(harness.controller.setLookSensitivityMultiplier(0.01), 0.25);
  assert.equal(harness.controller.setLookSensitivityMultiplier(Number.NaN), 0.25);
});

test("smooths mouse look consistently across frame rates", () => {
  const oneFrame = makeHarness();
  const twoFrames = makeHarness();

  let oneFrameDelta = 12;
  oneFrame.input.consumeLookDelta = (target) => {
    const delta = oneFrameDelta;
    oneFrameDelta = 0;
    return target.set(delta, 0);
  };

  let twoFrameDelta = 12;
  twoFrames.input.consumeLookDelta = (target) => {
    const delta = twoFrameDelta;
    twoFrameDelta = 0;
    return target.set(delta, 0);
  };

  oneFrame.controller.update(1 / 60);
  twoFrames.controller.update(1 / 120);
  twoFrames.controller.update(1 / 120);

  assert.ok(Math.abs(oneFrame.controller.yaw - twoFrames.controller.yaw) < 1e-9);
  assert.ok(Math.abs(oneFrame.controller.yaw) < 12 * 0.004);

  const settledYaw = oneFrame.controller.yaw;
  oneFrame.controller.resetLookSmoothing();
  oneFrame.controller.update(1 / 60);
  assert.ok(Math.abs(oneFrame.controller.yaw - settledYaw) < 1e-9);
});
