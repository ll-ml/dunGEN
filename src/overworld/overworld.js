import * as THREE from "three";
import { generateOverworldWFC, TILE_DEFS, TileId } from "./wfc.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class Overworld {
  constructor(width, height, { seed = null, weights = null, tileSize = 11 } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.weights = weights;
    this.tileSize = tileSize;

    this.offsetX = -(this.width * this.tileSize) / 2;
    this.offsetZ = -(this.height * this.tileSize) / 2;

    this.denseMatrix = generateOverworldWFC(this.width, this.height, {
      weights: this.weights,
    });

    this.entities = [];

    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  gridToWorld(x, y) {
    return new THREE.Vector3(
      this.offsetX + x * this.tileSize + this.tileSize / 2,
      0,
      this.offsetZ + y * this.tileSize + this.tileSize / 2
    );
  }

  worldToGrid(worldPt) {
    const gx = Math.floor((worldPt.x - this.offsetX) / this.tileSize);
    const gy = Math.floor((worldPt.z - this.offsetZ) / this.tileSize);
    if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return null;
    return { x: gx, y: gy };
  }

  tileGlyphAt(x, y) {
    return this.denseMatrix[y]?.[x] ?? null;
  }

  pickWorldPoint(raycaster) {
    const out = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(this.groundPlane, out)) return null;
    return out;
  }

  pickEntity(raycaster) {
  let best = null;
  let bestDist = Infinity;
  const tmp = new THREE.Vector3();

  for (const obj of this.entities) {
    if (!obj.model) continue;

    obj._recomputeBox();

    if (raycaster.ray.intersectBox(obj.hitbox, tmp)) {
      const d = raycaster.ray.origin.distanceTo(tmp);
      if (d < bestDist) {
        bestDist = d;
        best = obj;
      }
    }
  }

  return best;
}


  async loadModelMap() {
    const loader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();
    const modelMap = {};

    async function loadModel(url, key, colormapUrl = null) {
      const gltf = await loader.loadAsync(url);
      const sceneClone = gltf.scene.clone(true);

      if (colormapUrl) {
        const map = await texLoader.loadAsync(colormapUrl);
        map.encoding = THREE.sRGBEncoding;
        map.colorSpace = THREE.SRGBColorSpace;
        map.flipY = false;

        sceneClone.traverse((node) => {
          if (!node.isMesh) return;
          const mat = node.material.clone();
          mat.map = map;
          mat.needsUpdate = true;

          mat.metalnessMap = null;
          mat.roughnessMap = null;
          mat.metalness = 0;
          mat.roughness = 1;

          node.material = mat;
        });
      }

      modelMap[key] = sceneClone;
    }

    const GLYPH_GRASS = TILE_DEFS[TileId.GRASS].glyph;         // "."
    const GLYPH_WATER = TILE_DEFS[TileId.WATER].glyph;         // "~"
    const GLYPH_DENSE = TILE_DEFS[TileId.DENSE_GRASS].glyph;   // "\""
    const GLYPH_SAND  = TILE_DEFS[TileId.SAND].glyph;          // ","

    const defs = [
      ["./public/ground_grass.glb",     GLYPH_GRASS, null],
      ["./public/ground_riverOpen.glb", GLYPH_WATER, null],
      ["./public/grass_large.glb",      GLYPH_DENSE, null],
      ["./public/alternate-floor.glb",   GLYPH_SAND,  "./public/Textures/colormap3.png"],

      ["./public/tree_default.glb",     "TREE",      null],
    ];

    await Promise.all(defs.map(([url, key, cmap]) => loadModel(url, key, cmap)));
    return modelMap;
  }
}
