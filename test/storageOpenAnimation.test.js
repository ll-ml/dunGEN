import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { StorageOpenAnimation } from "../src/components/storageOpenAnimation.js";

test("storage opening animation coalesces, restores its model, and cancels", async () => {
  const model = new THREE.Object3D();
  model.position.y = 2;
  model.rotation.set(0, 0.3, -0.1);
  model.scale.set(8, 9, 10);
  const entity = { model, scale: 8 };
  const animation = new StorageOpenAnimation({ duration: 0.2 });
  animation.attach(entity);

  const first = animation.play();
  assert.equal(animation.play(), first);
  animation.updateVisual(0.05);
  assert.ok(model.position.y > 2);
  assert.notEqual(model.rotation.y, 0.3);
  assert.notEqual(model.scale.y, 9);

  animation.updateVisual(0.05);
  animation.updateVisual(0.05);
  animation.updateVisual(0.05);
  assert.equal(await first, true);
  assert.equal(animation.isPlaying, false);
  assert.deepEqual(model.position.toArray(), [0, 2, 0]);
  assert.deepEqual(model.rotation.toArray().slice(0, 3), [0, 0.3, -0.1]);
  assert.deepEqual(model.scale.toArray(), [8, 9, 10]);

  const cancelled = animation.play();
  animation.updateVisual(0.05);
  animation.cancel();
  assert.equal(await cancelled, false);
  assert.deepEqual(model.position.toArray(), [0, 2, 0]);
  assert.deepEqual(model.scale.toArray(), [8, 9, 10]);
});
