import * as THREE from "three";

const MAX_DELTA_SECONDS = 0.05;

/**
 * Lightweight squash, hop, and twist used when a storage model is opened.
 * The component owns no timers or DOM state; Game advances it with frame time.
 */
export class StorageOpenAnimation {
  constructor({
    duration = 0.32,
    hopScale = 0.055,
    squashAmount = 0.045,
    twistAmount = 0.12,
    tiltAmount = 0.055,
  } = {}) {
    this.duration = Number.isFinite(duration) ? Math.max(0.05, duration) : 0.32;
    this.hopScale = hopScale;
    this.squashAmount = squashAmount;
    this.twistAmount = twistAmount;
    this.tiltAmount = tiltAmount;

    this.entity = null;
    this.isPlaying = false;
    this._elapsed = 0;
    this._model = null;
    this._resolve = null;
    this._promise = null;
    this._base = {
      positionY: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    };
  }

  attach(entity) {
    this.entity = entity;
  }

  play() {
    if (this.isPlaying) return this._promise;

    const model = this.entity?.model;
    // Missing presentation should not prevent the underlying interaction.
    // This also keeps the component harmless in headless/unit-test contexts.
    if (!model) return Promise.resolve(true);

    this._model = model;
    this._elapsed = 0;
    this.isPlaying = true;
    this._captureBase(model);
    this._promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
    return this._promise;
  }

  updateVisual(deltaSeconds) {
    if (!this.isPlaying || !this._model) return;

    const delta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      MAX_DELTA_SECONDS
    );
    this._elapsed += delta;
    const progress = Math.min(1, this._elapsed / this.duration);
    const arc = Math.sin(Math.PI * progress);
    const wobble = Math.sin(Math.PI * 2 * progress) * (1 - progress);
    const hop = Math.max(0, Number(this.entity?.scale) || 0) * this.hopScale;

    this._model.position.y = this._base.positionY + arc * hop;
    this._model.rotation.y =
      this._base.rotationY + wobble * this.twistAmount;
    this._model.rotation.z =
      this._base.rotationZ + wobble * this.tiltAmount;

    const squash = arc * this.squashAmount;
    this._model.scale.set(
      this._base.scaleX * (1 + squash),
      this._base.scaleY * (1 - squash),
      this._base.scaleZ * (1 + squash)
    );

    if (progress >= 1) this._finish(true);
  }

  cancel() {
    if (!this.isPlaying) return;
    this._finish(false);
  }

  _captureBase(model) {
    this._base.positionY = model.position.y;
    this._base.rotationY = model.rotation.y;
    this._base.rotationZ = model.rotation.z;
    this._base.scaleX = model.scale.x;
    this._base.scaleY = model.scale.y;
    this._base.scaleZ = model.scale.z;
  }

  _restoreBase() {
    if (!this._model) return;
    this._model.position.y = this._base.positionY;
    this._model.rotation.y = this._base.rotationY;
    this._model.rotation.z = this._base.rotationZ;
    this._model.scale.set(
      this._base.scaleX,
      this._base.scaleY,
      this._base.scaleZ
    );
  }

  _finish(completed) {
    this._restoreBase();
    const resolve = this._resolve;
    this.isPlaying = false;
    this._elapsed = 0;
    this._model = null;
    this._resolve = null;
    this._promise = null;
    resolve?.(completed);
  }
}
