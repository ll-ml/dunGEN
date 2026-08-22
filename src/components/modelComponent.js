import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export class ModelComponent {
  static loader = new GLTFLoader();
  static modelCache = {};

  constructor(modelPath, { scale = 11, colormap = null } = {}) {
    this.modelPath = modelPath;
    this.scale = scale;
    this.colormap = colormap;

    this._loadPromise = null;
    this.entity = null;
  }

  attach(entity) {
    this.entity = entity;
  }

  load() {
    if (this._loadPromise) return this._loadPromise;

    let cached = ModelComponent.modelCache[this.modelPath];
    if (!cached) {
      cached = new Promise((res, rej) =>
        ModelComponent.loader.load(this.modelPath, res, null, rej)
      );
      ModelComponent.modelCache[this.modelPath] = cached;
    }

    this._loadPromise = cached.then((gltf) => {
      const entity = this.entity;
      if (!entity) return null;

      entity.animations = gltf.animations || [];
      const raw = gltf.scene;
      entity.model = SkeletonUtils.clone(raw);
      entity.model.scale.setScalar(this.scale);

      if (this.colormap) {
        const texLoader = new THREE.TextureLoader();
        texLoader.load(
          this.colormap,
          (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = false;

            entity.model.traverse((node) => {
              if (!node.isMesh) return;

              const mat = node.material.clone();
              mat.map = tex;
              mat.needsUpdate = true;

              mat.metalnessMap = null;
              mat.roughnessMap = null;
              mat.metalness = 0;
              mat.roughness = 2;

              node.material = mat;
            });
          },
          undefined,
          (err) => console.error("Failed to load colormap", err)
        );
      }

      return entity.model;
    });

    return this._loadPromise;
  }

  addTo(parent) {
    return this.load().then((model) => {
      if (model) parent.add(model);
      return model;
    });
  }
}
