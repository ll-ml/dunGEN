import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FirstPersonHandsViewModel } from "../src/viewmodels/firstPersonHandsViewModel.js";

test("builds one small box-shaped hand with no asset loading", () => {
  const hands = new FirstPersonHandsViewModel({ aspect: 2 });
  const meshes = [];
  hands.scene.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });

  assert.equal(hands.scene.background, null);
  assert.equal(hands.camera.aspect, 2);
  assert.equal(hands.camera.near, 0.01);
  assert.equal(hands.camera.far, 10);
  assert.equal(meshes.length, 2);
  assert.equal(hands.root.visible, false);

  hands.scene.updateMatrixWorld(true);
  const rightForearm = hands.scene.getObjectByName("right-forearm");
  const rightHand = hands.scene.getObjectByName("right-hand");
  const forearmPosition = rightForearm.getWorldPosition(new THREE.Vector3());
  const handPosition = rightHand.getWorldPosition(new THREE.Vector3());
  assert.ok(handPosition.z < forearmPosition.z - 0.2);
  assert.ok(Math.abs(handPosition.y - forearmPosition.y) < 0.05);
  assert.equal(rightHand.geometry.type, "BoxGeometry");

  rightHand.geometry.computeBoundingBox();
  const handSize = rightHand.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(Math.max(handSize.x, handSize.y, handSize.z) <= 0.181);

  hands.dispose();
});

test("walk motion is frame-rate independent and resets when hidden", () => {
  const oneStep = new FirstPersonHandsViewModel();
  const twoSteps = new FirstPersonHandsViewModel();

  oneStep.update(1 / 30, true, true);
  twoSteps.update(1 / 60, true, true);
  twoSteps.update(1 / 60, true, true);

  assert.ok(oneStep.root.position.distanceTo(twoSteps.root.position) < 1e-12);
  assert.ok(
    Math.abs(oneStep.rightArm.rotation.x - twoSteps.rightArm.rotation.x) < 1e-12
  );
  assert.notEqual(oneStep.root.position.y, -0.22);
  assert.notEqual(oneStep.rightArm.rotation.x, -Math.PI / 2);

  oneStep.update(1 / 60, false, false);
  assert.equal(oneStep.root.visible, false);
  assert.deepEqual(oneStep.root.position.toArray(), [0, -0.22, -0.42]);
  assert.equal(oneStep.root.rotation.z, 0);
  assert.equal(oneStep.rightArm.rotation.x, -Math.PI / 2);

  oneStep.dispose();
  twoSteps.dispose();
});

test("reach animation composes with movement, coalesces, and restores its pose", async () => {
  const oneStep = new FirstPersonHandsViewModel();
  const twoSteps = new FirstPersonHandsViewModel();
  oneStep.update(0, false, true);
  twoSteps.update(0, false, true);

  const first = oneStep.playReach({ duration: 0.2 });
  assert.equal(oneStep.playReach({ duration: 1 }), first);
  const second = twoSteps.playReach({ duration: 0.2 });
  oneStep.update(0.05, true, true);
  twoSteps.update(0.025, true, true);
  twoSteps.update(0.025, true, true);

  assert.equal(oneStep.isActionPlaying, true);
  assert.ok(oneStep.root.position.z < -0.5);
  assert.ok(oneStep.root.position.x < 0);
  assert.notEqual(oneStep.rightArm.rotation.y, 0.08);
  assert.ok(oneStep.root.position.distanceTo(twoSteps.root.position) < 1e-12);
  assert.ok(
    Math.abs(oneStep.rightArm.rotation.x - twoSteps.rightArm.rotation.x) < 1e-12
  );

  for (let i = 0; i < 4; i++) oneStep.update(0.05, false, true);
  for (let i = 0; i < 7; i++) twoSteps.update(0.025, false, true);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(oneStep.isActionPlaying, false);
  oneStep.update(0, false, false);
  oneStep.update(0, false, true);
  assert.deepEqual(oneStep.root.position.toArray(), [0, -0.22, -0.42]);
  assert.ok(Math.abs(oneStep.root.rotation.x) < 1e-12);
  assert.equal(oneStep.root.rotation.y, 0);
  assert.equal(oneStep.rightArm.rotation.x, -Math.PI / 2);
  assert.equal(oneStep.rightArm.rotation.y, 0.08);
  assert.equal(oneStep.rightArm.rotation.z, 0);

  const cancelled = oneStep.playReach();
  oneStep.update(0.05, false, true);
  assert.equal(oneStep.cancelAction(), true);
  assert.equal(await cancelled, false);
  assert.equal(oneStep.cancelAction(), false);
  assert.deepEqual(oneStep.root.position.toArray(), [0, -0.22, -0.42]);

  const hidden = oneStep.playReach();
  oneStep.update(0.05, false, false);
  assert.equal(await hidden, false);
  assert.equal(oneStep.root.visible, false);
  assert.equal(oneStep.isActionPlaying, false);

  oneStep.dispose();
  twoSteps.dispose();
});

test("renders after a depth clear, restores renderer state, and resizes", () => {
  const hands = new FirstPersonHandsViewModel();
  hands.update(0, false, true);
  const calls = [];
  const renderer = {
    autoClear: true,
    clearDepth() {
      calls.push("clearDepth");
    },
    render(scene, camera) {
      calls.push({ scene, camera, autoClear: this.autoClear });
    },
  };

  assert.equal(hands.render(renderer), true);
  assert.equal(calls[0], "clearDepth");
  assert.deepEqual(calls[1], {
    scene: hands.scene,
    camera: hands.camera,
    autoClear: false,
  });
  assert.equal(renderer.autoClear, true);

  const failingRenderer = {
    autoClear: true,
    clearDepth() {},
    render() {
      throw new Error("render failed");
    },
  };
  assert.throws(() => hands.render(failingRenderer), /render failed/);
  assert.equal(failingRenderer.autoClear, true);

  const oldProjection = hands.camera.projectionMatrix.clone();
  hands.resize(300, 600);
  assert.equal(hands.camera.aspect, 0.5);
  assert.equal(hands.camera.projectionMatrix.equals(oldProjection), false);

  hands.dispose();
});

test("dispose releases resources, settles actions, and disables rendering", async () => {
  const hands = new FirstPersonHandsViewModel();
  const resources = new Set();
  hands.scene.traverse((object) => {
    if (!object.isMesh) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) resources.add(material);
  });

  let disposeCount = 0;
  for (const resource of resources) {
    resource.dispose = () => {
      disposeCount++;
    };
  }

  const action = hands.playReach();
  hands.dispose();
  hands.dispose();

  assert.equal(await action, false);
  assert.equal(disposeCount, resources.size);
  assert.equal(hands.scene.children.length, 0);
  assert.equal(hands.render({ render() {} }), false);
  assert.doesNotThrow(() => hands.update(1, true, true));
});
