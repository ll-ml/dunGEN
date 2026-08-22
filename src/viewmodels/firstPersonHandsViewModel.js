import * as THREE from "three";

const DEFAULT_ASPECT = ((16 / 9) * 1) / 2;
const DEFAULT_FOV = 50;
const MAX_DELTA_SECONDS = 0.05;
const DEFAULT_REACH_DURATION_SECONDS = 0.32;

/**
 * Small, procedural first-person hands layer.
 *
 * The layer owns its scene, camera, geometry, materials, and animations.
 * It deliberately has no gameplay or input dependencies, so removing it only
 * requires removing the few optional calls made by Game.
 */
export class FirstPersonHandsViewModel {
  constructor({
    aspect = DEFAULT_ASPECT,
    fov = DEFAULT_FOV,
    skinColor = 0xc98c65,
    sleeveColor = 0x354052,
    walkCyclesPerSecond = 1.8,
    bobHeight = 0.018,
    bobWidth = 0.012,
    armSwing = 0.09,
    blendSpeed = 14,
  } = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      fov,
      Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT,
      0.01,
      10,
    );

    this.walkCyclesPerSecond = walkCyclesPerSecond;
    this.bobHeight = bobHeight;
    this.bobWidth = bobWidth;
    this.armSwing = armSwing;
    this.blendSpeed = blendSpeed;

    this.visible = false;
    this._disposed = false;
    this._walkPhase = 0;
    this._walkWeight = 0;
    this._basePosition = new THREE.Vector3(0, -0.22, -0.42);
    this._restArmPitch = -Math.PI / 2;
    this._restArmYaw = 0.08;
    this._actionElapsed = 0;
    this._actionDuration = DEFAULT_REACH_DURATION_SECONDS;
    this._actionPromise = null;
    this._resolveAction = null;

    this.root = new THREE.Group();
    this.root.name = "first-person-hands";
    this.root.position.copy(this._basePosition);
    this.root.visible = false;
    this.scene.add(this.root);

    this._forearmGeometry = new THREE.BoxGeometry(0.13, 0.38, 0.15);
    this._handGeometry = new THREE.BoxGeometry(0.17, 0.18, 0.17);

    this._skinMaterial = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
    });
    this._sleeveMaterial = new THREE.MeshStandardMaterial({
      color: sleeveColor,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });

    this.rightArm = this._createArm(1);
    this.root.add(this.rightArm);

    const ambient = new THREE.HemisphereLight(0xffead8, 0x222733, 2.2);
    const key = new THREE.DirectionalLight(0xfff4e8, 1.8);
    key.position.set(-2, 3, 4);
    this.scene.add(ambient, key);
  }

  get isActionPlaying() {
    return Boolean(this._actionPromise);
  }

  update(deltaSeconds, moving = false, visible = true) {
    if (this._disposed) return;

    this.visible = Boolean(visible);
    this.root.visible = this.visible;
    if (!this.visible) {
      this.cancelAction();
      this._walkPhase = 0;
      this._walkWeight = 0;
      this._applyPose(0, 0, 0);
      return;
    }

    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      MAX_DELTA_SECONDS,
    );
    const targetWeight = moving ? 1 : 0;
    const blend =
      this.blendSpeed <= 0 ? 1 : 1 - Math.exp(-this.blendSpeed * delta);
    this._walkWeight = THREE.MathUtils.lerp(
      this._walkWeight,
      targetWeight,
      blend,
    );

    if (moving) {
      this._walkPhase += delta * this.walkCyclesPerSecond * Math.PI * 2;
    }

    let actionProgress = 0;
    if (this._actionPromise) {
      this._actionElapsed += delta;
      actionProgress = Math.min(1, this._actionElapsed / this._actionDuration);
    }

    this._applyPose(this._walkPhase, this._walkWeight, actionProgress);
    if (actionProgress >= 1) this._finishAction(true);
  }

  /** Starts one coalesced, frame-driven reach and returns its completion. */
  playReach({
    duration = DEFAULT_REACH_DURATION_SECONDS,
  } = {}) {
    if (this._disposed) return Promise.resolve(false);
    if (this._actionPromise) return this._actionPromise;

    this._actionElapsed = 0;
    this._actionDuration = Number.isFinite(duration)
      ? Math.max(0.05, duration)
      : DEFAULT_REACH_DURATION_SECONDS;
    this._actionPromise = new Promise((resolve) => {
      this._resolveAction = resolve;
    });
    return this._actionPromise;
  }

  cancelAction() {
    if (!this._actionPromise) return false;
    this._finishAction(false);
    return true;
  }

  resize(width, height) {
    if (this._disposed) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
      return;
    }

    this.camera.aspect = Math.max(1, width) / height;
    this.camera.updateProjectionMatrix();
  }

  render(renderer) {
    if (
      this._disposed ||
      !this.visible ||
      typeof renderer?.render !== "function"
    )
      return false;

    const previousAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.clearDepth?.();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = previousAutoClear;
    }
    return true;
  }

  dispose() {
    if (this._disposed) return;
    this.cancelAction();
    this._disposed = true;
    this.visible = false;

    this._forearmGeometry.dispose();
    this._handGeometry.dispose();
    this._skinMaterial.dispose();
    this._sleeveMaterial.dispose();
    this.scene.clear();
  }

  _createArm(side) {
    const arm = new THREE.Group();
    arm.position.x = side * 0.24;
    arm.rotation.set(this._restArmPitch, side * this._restArmYaw, 0);

    const forearm = new THREE.Mesh(this._forearmGeometry, this._sleeveMaterial);
    forearm.name = side < 0 ? "left-forearm" : "right-forearm";
    forearm.position.set(0, 0.19, 0);

    const hand = new THREE.Mesh(this._handGeometry, this._skinMaterial);
    hand.name = side < 0 ? "left-hand" : "right-hand";
    hand.position.set(-side * 0.012, 0.43, 0);
    hand.rotation.z = side * 0.05;

    arm.add(forearm, hand);
    return arm;
  }

  _applyPose(phase, weight, actionProgress) {
    const reach = Math.sin(Math.PI * actionProgress);
    const turn = Math.sin(Math.PI * 2 * actionProgress) * reach;
    const walkScale = 1 - reach * 0.8;
    const stride = Math.sin(phase) * weight * walkScale;
    const lift = Math.abs(Math.cos(phase)) * weight * walkScale;

    this.root.position.set(
      this._basePosition.x + stride * this.bobWidth - reach * 0.035,
      this._basePosition.y + lift * this.bobHeight + reach * 0.04,
      this._basePosition.z - reach * 0.12,
    );
    this.root.rotation.x = -reach * 0.045;
    this.root.rotation.y = reach * 0.02;
    this.root.rotation.z = stride * 0.015 - reach * 0.025;
    this.rightArm.rotation.x =
      this._restArmPitch - stride * this.armSwing - reach * 0.1;
    this.rightArm.rotation.y = this._restArmYaw - reach * 0.14;
    this.rightArm.rotation.z = turn * 0.12 - reach * 0.035;
  }

  _finishAction(completed) {
    const resolve = this._resolveAction;
    this._actionElapsed = 0;
    this._actionPromise = null;
    this._resolveAction = null;
    this._applyPose(this._walkPhase, this._walkWeight, 0);
    resolve?.(completed);
  }
}
