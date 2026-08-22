import * as THREE from "three";

const DEFAULT_TILE_SIZE = 11;
const DEFAULT_LOOK_SENSITIVITY = 0.004;
const DEFAULT_LOOK_SMOOTHING = 32;
const COLLISION_SIGNS = [-1, 1];

/**
 * Translates first-person input into camera-relative player movement.
 * Collision remains map-driven so both dungeon and overworld maps can use the
 * same controller without exposing their tile representations here.
 */
export class FirstPersonController {
  constructor({
    camera,
    input,
    getPlayer,
    getMap,
    moveSpeedTiles = 4,
    eyeHeightTiles = 0.66,
    collisionRadiusTiles = 0.2,
    lookSensitivity = DEFAULT_LOOK_SENSITIVITY,
    lookSmoothing = DEFAULT_LOOK_SMOOTHING,
    maxPitch = Math.PI / 2 - 0.05,
    maxDeltaSeconds = 0.05,
    hidePlayerModel = true,
  } = {}) {
    if (!camera || !input) {
      throw new Error("FirstPersonController requires a camera and input");
    }
    if (typeof getPlayer !== "function" || typeof getMap !== "function") {
      throw new Error("FirstPersonController requires player and map getters");
    }

    this.camera = camera;
    this.input = input;
    this.getPlayer = getPlayer;
    this.getMap = getMap;

    this.moveSpeedTiles = moveSpeedTiles;
    this.eyeHeightTiles = eyeHeightTiles;
    this.collisionRadiusTiles = collisionRadiusTiles;
    this.lookSensitivity = lookSensitivity;
    this.lookSmoothing = Math.max(
      0,
      Number.isFinite(lookSmoothing) ? lookSmoothing : DEFAULT_LOOK_SMOOTHING
    );
    this.maxPitch = maxPitch;
    this.maxDeltaSeconds = maxDeltaSeconds;
    this.hidePlayerModel = hidePlayerModel;

    this.baseLookSensitivity = lookSensitivity;
    this.lookSensitivityMultiplier = 1;

    this.yaw = 0;
    this.pitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;

    this._lookDelta = new THREE.Vector2();
    this._movementAxes = { forward: 0, right: 0 };
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._movement = new THREE.Vector3();
    this._probe = { x: 0, z: 0 };
    this.isMoving = false;

    this.camera.rotation.order = "YXZ";
    this._applyRotation();
  }

  setLookSensitivityMultiplier(multiplier) {
    if (!Number.isFinite(multiplier)) return this.lookSensitivityMultiplier;

    this.lookSensitivityMultiplier = THREE.MathUtils.clamp(multiplier, 0.25, 5);
    this.lookSensitivity =
      this.baseLookSensitivity * this.lookSensitivityMultiplier;
    return this.lookSensitivityMultiplier;
  }

  resetLookSmoothing() {
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
  }

  syncFromPlayer() {
    this.isMoving = false;
    const player = this.getPlayer();
    const map = this.getMap();
    if (!player?.model || !map) return;

    player.path = [];
    player._targetWorldPos = null;
    if (this.hidePlayerModel) player.model.visible = false;

    this._syncCameraPosition(player, map);
    this.resetLookSmoothing();
    this._applyRotation();
  }

  update(deltaSeconds) {
    this.isMoving = false;
    const player = this.getPlayer();
    const map = this.getMap();
    if (!player?.model || !map) return false;

    const safeDelta = THREE.MathUtils.clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      0,
      this.maxDeltaSeconds
    );

    this.input.consumeLookDelta(this._lookDelta);
    this._targetYaw -= this._lookDelta.x * this.lookSensitivity;
    this._targetPitch -= this._lookDelta.y * this.lookSensitivity;
    this._targetPitch = THREE.MathUtils.clamp(
      this._targetPitch,
      -this.maxPitch,
      this.maxPitch
    );

    const lookBlend = this.lookSmoothing === 0
      ? 1
      : 1 - Math.exp(-this.lookSmoothing * safeDelta);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this._targetYaw, lookBlend);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this._targetPitch, lookBlend);
    this._applyRotation();

    let moved = false;
    if (this.input.isLocked && !player.isDead) {
      moved = this._movePlayer(player, map, safeDelta);
    }

    player.model.rotation.y = this.yaw;
    if (!player.isDead) player._playAction?.(moved ? "walk" : "idle");
    this._syncCameraPosition(player, map);
    this.isMoving = moved;
    return moved;
  }

  _movePlayer(player, map, deltaSeconds) {
    const axes = this.input.getMovementAxes(this._movementAxes);
    if (axes.forward === 0 && axes.right === 0) return false;

    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this._movement
      .copy(this._forward)
      .multiplyScalar(axes.forward)
      .addScaledVector(this._right, axes.right);

    if (this._movement.lengthSq() > 1) this._movement.normalize();

    const tileSize = map.tileSize ?? DEFAULT_TILE_SIZE;
    const distance = tileSize * this.moveSpeedTiles * deltaSeconds;
    this._movement.multiplyScalar(distance);

    const position = player.model.position;
    const startX = position.x;
    const startZ = position.z;

    const nextX = startX + this._movement.x;
    if (this._canOccupy(nextX, startZ, map, tileSize)) position.x = nextX;

    const nextZ = startZ + this._movement.z;
    if (this._canOccupy(position.x, nextZ, map, tileSize)) position.z = nextZ;

    const grid = map.worldToGrid(position);
    if (grid) player.coords.set(grid.x, grid.y);

    return position.x !== startX || position.z !== startZ;
  }

  _canOccupy(worldX, worldZ, map, tileSize) {
    const radius = tileSize * this.collisionRadiusTiles;

    for (const signX of COLLISION_SIGNS) {
      for (const signZ of COLLISION_SIGNS) {
        this._probe.x = worldX + radius * signX;
        this._probe.z = worldZ + radius * signZ;
        const grid = map.worldToGrid(this._probe);
        if (!grid || !map.isWalkableAt?.(grid.x, grid.y)) return false;
      }
    }

    return true;
  }

  _syncCameraPosition(player, map) {
    const eyeHeight = (map.tileSize ?? DEFAULT_TILE_SIZE) * this.eyeHeightTiles;
    this.camera.position.set(
      player.model.position.x,
      player.model.position.y + eyeHeight,
      player.model.position.z
    );
  }

  _applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
