import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const TILE_SIZE = 11;
const WIDTH     = 40;
const HEIGHT    = 30;
const offsetX   = -(WIDTH  * TILE_SIZE) / 2;
const offsetZ   = -(HEIGHT * TILE_SIZE) / 2;

export class DungeonObject {
  static loader      = new GLTFLoader();
  static modelCache  = {};

  constructor(modelPath, gridX, gridY, opts = {}) {
    this.modelPath = modelPath;
    this.coords    = new THREE.Vector2(gridX, gridY);
    this.height    = opts.height ?? 0;
    this.scale     = opts.scale  ?? TILE_SIZE;
    this.model     = null;

    // our world‐space box & helper
    this.hitbox = new THREE.Box3();
    this.helper = new THREE.Box3Helper(this.hitbox, 0xff0000);

    this._loadPromise = this._loadAndSetup();
  }

  _loadAndSetup() {
    let p = DungeonObject.modelCache[this.modelPath];
    if (!p) {
      p = new Promise((res, rej) =>
        DungeonObject.loader.load(this.modelPath, res, null, rej)
      );
      DungeonObject.modelCache[this.modelPath] = p;
    }

    return p.then(gltf => {
      // clone actual mesh
      this.animations = gltf.animations || [];
      const raw       = gltf.scene;
      this.model      = SkeletonUtils.clone(raw);
      this.model.scale.setScalar(this.scale);
      this.updatePosition();

      this._recomputeBox();

      return this.model;
    });
  }

  addTo(scene) {
    return this._loadPromise.then(model => {
      scene.add(model);
      return model;
    });
  }

  updatePosition() {
    if (!this.model) return;
    const wx = offsetX + this.coords.x * TILE_SIZE + TILE_SIZE/2;
    const wz = offsetZ + this.coords.y * TILE_SIZE + TILE_SIZE/2;
    const wy = this.height;
    this.model.position.set(wx, wy, wz);

    // now push that movement into the hitbox
    this._recomputeBox();
    // for debugging
    this.helper.box.copy(this.hitbox);
    this.helper.updateMatrixWorld(true);
  }

  // shared routine to rebuild the Box3 from all Mesh children
  _recomputeBox() {
    this.model.updateWorldMatrix(true, false);
    this.hitbox.makeEmpty();
    this.model.traverse(o => {
      if (o.isMesh) {
        // ensure geometry bbox is computed
        if (!o.geometry.boundingBox) {
          o.geometry.computeBoundingBox();
        }
        // take the mesh’s local bbox, bring into world‐space
        const mb = o.geometry.boundingBox.clone();
        mb.applyMatrix4(o.matrixWorld);
        this.hitbox.union(mb);
      }
    });
  }
}