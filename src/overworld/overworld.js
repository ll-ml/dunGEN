import * as THREE from "three";
import { generateOverworldWFC, TILE_DEFS, TileId } from "./wfc.js";
import { DungeonEntrance } from "../DungeonEntrance.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { StatusBar } from "../statusBar.js"
 
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

    this.status = new StatusBar(); // TODO: this really should be in the UI rather than a direct member of overworld

    const worldRadius = 50;

    this.env = { 
      background: 0x98c6ff,
      fog: { color: 0xa8c6ff, near: worldRadius * 1.2, far: worldRadius * 4},
    };
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

getActionsAt({ gridX, gridY, entity }) {
  const actions = [];

  if (entity?.kind === "DroppedItem") {
    actions.push({
      label: `Pick up ${entity.item.name}`,
      run: async (game) => {
        await game.player.moveToAsync(entity.coords, this.denseMatrix);
        game.player.addItem(entity.item, 1);
        this.removeEntity(entity);
        game.ui.renderInventory(game.player.inventory);
      },
    });
  }

  if (entity?.kind === "Storage") {
    actions.push({
      label: `Search ${entity.id}`,
      run: async (game) => {
        await game.player.moveToAsync(entity.coords, this.denseMatrix);
        game.ui.openStorageModal(entity);
      },
    });
  }

  if (entity?.kind === "DungeonEntrance") {
    actions.push({
      label: "Enter dungeon",
      run: async (game) => {
        await game.player.moveToAsync(entity.coords.clone(), this);
        await game.enterDungeon({ entrance: entity });
      },
    });
  }

  actions.push({
    label: `Debug: (${gridX}, ${gridY})`,
    run: async () => this.status.addStatus(`You clicked on tile: (${gridX}, ${gridY}) this tile is of kind: ${this.tileGlyphAt(gridX, gridY)}`),
  });

  if (this.isWalkableAt?.(gridX, gridY)) {
    actions.push({
      label: "Walk here",
      run: async (game) => {
        await game.player.moveToAsync(new THREE.Vector2(gridX, gridY), this);
      },
    });
  }

  const glyph = this.tileGlyphAt(gridX, gridY);
  const FOREST_GLYPH = TILE_DEFS[TileId.FOREST].glyph;
  if (glyph === FOREST_GLYPH) {
    actions.push({
      label: "Chop tree",
      run: async (game) => {
        await game.player.moveToAsync(new THREE.Vector2(gridX, gridY), this);
        //game.ui.addStatus?.("You swing your axe at the tree.");
        this.status.addStatus("You swing your axe at the tree.");
      },
    });
  }

  return actions;
}

isWalkableTile(glyph) {
  const water = TILE_DEFS[TileId.WATER].glyph;
  return glyph !== water;
}

isWalkableAt(x, y) {
  const g = this.denseMatrix[y]?.[x];
  return g != null && this.isWalkableTile(g);

}

removeEntity(entity) {
  const idx = this.entities.indexOf(entity);
  if (idx >= 0) this.entities.splice(idx, 1);
}

spawnDungeonEntrances({ count = 8, minSpacing = 8, rng = Math.random } = {}) {
  const placed = [];

  const tryPick = () => {
    const x = Math.floor(rng() * (this.width - 2)) + 1;
    const y = Math.floor(rng() * (this.height - 2)) + 1;
    return { x, y };
  };

  const isFarEnough = (x, y) => {
    for (const p of placed) {
      const dx = p.x - x;
      const dy = p.y - y;
      if ((dx * dx + dy * dy) < (minSpacing * minSpacing)) return false;
    }
    return true;
  };

  let guard = 0;
  while (placed.length < count && guard++ < count * 200) {
    const { x, y } = tryPick();

    if (!this.isWalkableAt(x, y)) continue;
    if (!isFarEnough(x, y)) continue;

    const ent = new DungeonEntrance(x, y);
    this.entities.push(ent);
    placed.push({ x, y });
  }

  return placed.length;
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
