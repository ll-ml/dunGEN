import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const TILE_SIZE = 11; // TODO: Make sure its ok
const WIDTH = 40;   // columns
const HEIGHT = 30;  // rows

const offsetX = -(WIDTH * TILE_SIZE) / 2;
const offsetZ = -(HEIGHT * TILE_SIZE) / 2; // Z is depth, Y held constant

export class DungeonObject {
    //Loader and the cache of all previously loaded models
    static loader = new GLTFLoader();
    static modelCache = {};
 /**
   * @param {string} modelPath   URL or relative path to your .glb
   * @param {number} gridX              - column index (0..WIDTH-1)
   * @param {number} gridZ              - row    index (0..HEIGHT-1)
   * @param {Object} [opts]
   * @param {number} [opts.height=0]    - world‑Y, e.g. floor sits at 0
   * @param {number} [opts.scale=1]     - uniform scale for the clone
   */
    constructor(modelPath, gridX, gridZ, opts ={}) {
        this.modelPath = modelPath;
        this.coords = new THREE.Vector2(gridX, gridZ);
        this.height = opts.height ?? 1; 
        this.scale = opts.scale ?? 10;
        this.id = opts.id ?? "default"

        this.model = null;
        this.hitbox = new THREE.Box3;

        this.animations = [];

        this._loadPromise = this._loadAndSetup();
    }

    _loadAndSetup() {
        let loadPromise = DungeonObject.modelCache[this.modelPath];
        if (!loadPromise) {
          loadPromise = new Promise((resolve, reject) => {
            DungeonObject.loader.load(
              this.modelPath,
              gltf => resolve(gltf),
              undefined,
              err  => reject(err)
            );
          });
          DungeonObject.modelCache[this.modelPath] = loadPromise;
        }
      
        return loadPromise.then((gltf) => {
         // console.log('Loaded GLTF', this.modelPath, gltf); //dont need this log right now
          this.animations = gltf.animations || [];
          const sceneRoot = gltf.scene[0] || gltf.scenes?.[0];
          if (!sceneRoot) {
            throw new Error(`GLTF had no scene: ${this.modelPath}`);
          }
          //this.model = sceneRoot.clone(true);
          this.model = SkeletonUtils.clone(sceneRoot);
          this.model.scale.setScalar(this.scale);
          this.updatePosition();
      
          const boundingBox = new THREE.Box3().setFromObject(this.model);
          this.hitbox = boundingBox;
      
          return this.model;
        });
      }

    updatePosition() {
        if (!this.model) return;

        const wx = offsetX + this.coords.x * TILE_SIZE + TILE_SIZE / 2;
        const wy = this.height;
        const wz = offsetZ  + this.coords.y * TILE_SIZE + TILE_SIZE / 2;

        this.model.position.set(wx, wy, wz);
        this.hitbox.setFromObject(this.model);
    }

    setPosition(x, z, height = 0) {
      this.coords.set(x, z);
      this.height = height;
      return this._loadPromise.then(() => {
        this.updatePosition();
        return this.model;
      })
    }

    addTo(scene) {
        return this._loadPromise.then((model) => {
            scene.add(model);
            return model;

        });
    }
}