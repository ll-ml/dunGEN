import * as THREE from "three";
import { OverworldEntity } from "./overworldEntity.js";
import { TILE_SIZE } from "./types.js";

const DEFAULT_MODEL = "./public/character-soldier.glb";

export class NPC extends OverworldEntity {
  constructor(gridX, gridY, opts = {}) {
    super(DEFAULT_MODEL, gridX, gridY, {
      scale: opts.scale ?? TILE_SIZE,
      height: opts.height ?? 0,
      colormap: opts.colormap ?? "./public/Textures/colormap3.png",
      kind: "NPC",
      id: opts.id ?? "Wanderer",
    });

    this.path = [];
    this._targetWorldPos = null;
    this.moveSpeed = opts.moveSpeed ?? TILE_SIZE * 1.4;
    this._map = null;
    this._paused = false;

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this._loadPromise.then((model) => this._initAnimations(model));
  }

  _initAnimations(model) {
    this.mixer = new THREE.AnimationMixer(model);

    const find = (name) => (this.animations || []).find((c) => c.name === name);
    const idleClip = find("idle");
    const walkClip = find("walk");
    if (!idleClip || !walkClip) return;

    this.actions.idle = this.mixer.clipAction(idleClip);
    this.actions.walk = this.mixer.clipAction(walkClip);

    this.currentAction = this.actions.idle;
    this.currentAction.play();
  }

  think(map) {
    if (!map) return;
    this._map = map;
    if (this._paused) return;
    if (this._targetWorldPos || this.path.length) return;

    const next = this._pickRandomNeighbor(map);
    if (!next) return;

    this.path = [next];
    this._advanceTarget(map);
    this._setAction("walk");
  }

  _pickRandomNeighbor(map) {
    const dirs = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1),
      new THREE.Vector2(0, -1),
    ];

    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const dir of dirs) {
      const next = this.coords.clone().add(dir);
      if (!map.isWalkableAt?.(next.x, next.y)) continue;
      return next;
    }

    return null;
  }

  _advanceTarget(map) {
    if (!this.path.length) {
      this._targetWorldPos = null;
      this._setAction("idle");
      return;
    }

    const next = this.path[0];
    const world = map.gridToWorld(next.x, next.y);
    this._targetWorldPos = new THREE.Vector3(
      world.x,
      world.y + this.height,
      world.z
    );

    this.model.lookAt(
      this._targetWorldPos.x,
      this.model.position.y,
      this._targetWorldPos.z
    );
  }

  updateMovement(deltaSeconds, map = null) {
    if (this._paused) {
      this._setAction("idle");
      return;
    }
    const activeMap = map ?? this._map;
    if (!activeMap || !this._targetWorldPos) return;

    const dir = this._targetWorldPos.clone().sub(this.model.position);
    const dist = dir.length();
    const step = this.moveSpeed * deltaSeconds;

    if (dist <= step) {
      this.model.position.copy(this._targetWorldPos);
      const reached = this.path.shift();
      this.coords.set(reached.x, reached.y);
      this.updatePosition(activeMap);
      this._advanceTarget(activeMap);
    } else {
      dir.normalize();
      this.model.position.add(dir.multiplyScalar(step));
    }
  }

  _setAction(name) {
    const next = this.actions[name];
    if (!next || next === this.currentAction) return;
    next.reset().fadeIn(0.2).play();
    this.currentAction.fadeOut(0.2);
    this.currentAction = next;
  }

  pause() {
    this._paused = true;
    this.path = [];
    this._targetWorldPos = null;
  }

  resume() {
    this._paused = false;
  }
}
