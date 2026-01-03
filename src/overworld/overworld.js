import * as THREE from "three";
import { generateOverworldWFC, TILE_DEFS, TileId } from "./wfc.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class Overworld {
  constructor(width, height, { seed = null, weights = null } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.weights = weights;

    this.denseMatrix = generateOverworldWFC(this.width, this.height, {
      weights: this.weights,
    });
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
      ["./public/overworld_sand.glb",   GLYPH_SAND,  null],

      ["./public/tree_default.glb",     "TREE",      null],
    ];

    await Promise.all(defs.map(([url, key, cmap]) => loadModel(url, key, cmap)));
    return modelMap;
  }
}
