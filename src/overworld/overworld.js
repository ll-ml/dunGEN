import * as THREE from "three";
import { generateOverworldWFC, TILE_DEFS, TileId } from "./wfc.js";
import { STRUCTURE_BLUEPRINTS, STRUCTURE_SPAWNS } from "./structureBlueprints.js";
import {
  findAnchorCandidates,
  isOccupied,
  makeOccupancy,
  pickWeightedAnchor,
  placeStructure,
} from "./structurePlacement.js";
import { startFishing, updateFishingTick } from "../skills/fishing.js";
import { DungeonEntrance } from "../DungeonEntrance.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { StatusBar } from "../statusBar.js"
import { NPC } from "../NPC.js";

function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const str = String(seed ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  if (seed == null) return Math.random;
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollTransform(spawn, rng) {
  return {
    rotation: spawn.allowRotation ? Math.floor(rng() * 4) : 0,
    mirrorX: spawn.allowMirrorX ? rng() < 0.5 : false,
    mirrorY: spawn.allowMirrorY ? rng() < 0.5 : false,
  };
}
 
export class Overworld {
  constructor(width, height, { seed = null, weights = null, tileSize = 11 } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.weights = weights;
    this.tileSize = tileSize;

    this._rng = makeRng(this.seed);
    this._structureOccupancy = makeOccupancy();

    this.offsetX = -(this.width * this.tileSize) / 2;
    this.offsetZ = -(this.height * this.tileSize) / 2;

    this.entities = [];

    this._resetGenerationState({ weights: this.weights });

    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.status = new StatusBar(); // TODO: this really should be in the UI rather than a direct member of overworld

    const worldRadius = 50;

    this.env = { 
      background: 0x98c6ff,
      fog: { color: 0xa8c6ff, near: worldRadius * 1.2, far: worldRadius * 4},
    };

    this.isDungeon = false;
  }

  regenerate({ weights = null } = {}) {
    this._resetGenerationState({ weights });
    return this.denseMatrix;
  }

  _resetGenerationState({ weights = null } = {}) {
    this.weights = weights ?? this.weights;
    this._rng = makeRng(this.seed);
    this.entities = [];
    this._structureOccupancy = makeOccupancy();
    this.denseMatrix = generateOverworldWFC(this.width, this.height, {
      weights: this.weights,
      rng: this._rng,
    });
    this._placeStructures();
  }

  _placeStructures({ spawns = STRUCTURE_SPAWNS } = {}) {
    if (!Array.isArray(spawns) || spawns.length === 0) return;
    const rng = this._rng ?? Math.random;

    for (const spawn of spawns) {
      const blueprint = STRUCTURE_BLUEPRINTS[spawn.id];
      if (!blueprint) continue;

      const count = Math.max(0, spawn.count ?? 1);
      const tries = spawn.tries ?? undefined;

      for (let i = 0; i < count; i++) {
        const transform = rollTransform(spawn, rng);
        const candidates = findAnchorCandidates(this, blueprint, {
          rng,
          tries,
          occupancy: this._structureOccupancy,
          transform,
        });
        const anchor = pickWeightedAnchor(candidates, rng);
        if (!anchor) continue;

        placeStructure(this, blueprint, anchor, {
          occupancy: this._structureOccupancy,
          rotation: transform.rotation,
          mirrorX: transform.mirrorX,
          mirrorY: transform.mirrorY,
          applyTiles: spawn.applyTiles ?? true,
          spawnProps: spawn.spawnProps ?? true,
        });
      }
    }
  }

  addStatus(message) {
    this.status.addStatus(message);
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
        await game.player.moveToAsync(entity.coords, this);
        game.player.addItem(entity.item, 1);
        this.removeEntity(entity);
        game.currentMapGroup?.remove(entity.model);
        game.ui.renderInventory(game.player.inventory);
      },
    });
  }

  if (entity?.kind === "Storage") {
    actions.push({
      label: `Search ${entity.id}`,
      run: async (game) => {
        await game.player.moveToAsync(entity.coords, this);
        game.ui.openStorageModal(entity);
      },
    });
  }

  if (entity?.kind === "NPC") {
    actions.push({
      label: `Talk to ${entity.id}`,
      run: async (game) => {
        entity.pause?.();
        await game.player.moveToAsync(entity.coords, this);
        game.ui.openNpcDialog?.(entity);
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
  const WATER_GLYPH = TILE_DEFS[TileId.WATER].glyph;
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

  if (glyph === WATER_GLYPH) {
    actions.push({
      label: "Fish",
      run: async (game) => {
        startFishing(game, this, gridX, gridY);
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
    if (g == null || !this.isWalkableTile(g)) return false;
    if (isOccupied(this._structureOccupancy, x, y)) return false;
    return true;

  }

  removeEntity(entity) {
    const idx = this.entities.indexOf(entity);
    if (idx >= 0) this.entities.splice(idx, 1);
  }

  spawnNPCs({ count = 1, rng = Math.random } = {}) {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 200) {
      const x = Math.floor(rng() * this.width);
      const y = Math.floor(rng() * this.height);
      if (!this.isWalkableAt(x, y)) continue;
      const npc = new NPC(x, y, {
        id: "Wanderer",
        colormap: "./public/Textures/colormap3.png",
      });
      this.entities.push(npc);
      placed++;
    }
    return placed;
  }

  updateTick(game) {
    for (const obj of this.entities) {
      if (obj?.kind === "NPC") {
        obj.think(this);
      }
    }

    updateFishingTick(game, this);
    game.player?.skills?.updateUI?.();
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
