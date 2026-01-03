import * as THREE from "three";
import { TILE_DEFS, TileId } from "./wfc.js";

export function buildOverworld(scene, modelMap, glyphGrid, TILE_SIZE) {
  while (scene.children.length) scene.remove(scene.children[0]);

  const height = glyphGrid.length;
  const width = glyphGrid[0]?.length ?? 0;
  if (!width || !height) return;

  const GLYPH_WATER  = TILE_DEFS[TileId.WATER].glyph;        // "~"
  const GLYPH_SAND   = TILE_DEFS[TileId.SAND].glyph;         // ","
  const GLYPH_GRASS  = TILE_DEFS[TileId.GRASS].glyph;        // "."
  const GLYPH_DENSE  = TILE_DEFS[TileId.DENSE_GRASS].glyph;  // "\""
  const GLYPH_FOREST = TILE_DEFS[TileId.FOREST].glyph;       // "T"

  const BASE_GLYPHS = [GLYPH_WATER, GLYPH_SAND, GLYPH_GRASS, GLYPH_DENSE];

  const baseGlyphFor = (g) => (g === GLYPH_FOREST ? GLYPH_DENSE : g);

  function extractFirstMesh(protoScene) {
    let found = null;
    protoScene.traverse((obj) => { if (!found && obj.isMesh) found = obj; });
    return found;
  }

  const baseCounts = new Map(BASE_GLYPHS.map((g) => [g, 0]));
  let treeCount = 0;

  for (let y = 0; y < height; y++) {
    const row = glyphGrid[y];
    for (let x = 0; x < width; x++) {
      const g = row[x];
      const bg = baseGlyphFor(g);

      baseCounts.set(bg, (baseCounts.get(bg) ?? 0) + 1);
      if (g === GLYPH_FOREST) treeCount++;
    }
  }

  const instancedBase = new Map();
  for (const g of BASE_GLYPHS) {
    const count = baseCounts.get(g) ?? 0;
    if (count === 0) continue;

    const proto = modelMap[g];
    if (!proto) continue;

    const mesh = extractFirstMesh(proto);
    if (!mesh) continue;

    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
    instancedBase.set(g, { im, nextIndex: 0 });
    scene.add(im);
  }

  let treeInst = null;
  if (treeCount > 0 && modelMap["TREE"]) {
    const treeMesh = extractFirstMesh(modelMap["TREE"]);
    if (treeMesh) {
      treeInst = new THREE.InstancedMesh(treeMesh.geometry, treeMesh.material, treeCount);
      scene.add(treeInst);
    }
  }

  // Fill transforms
  const px = width * TILE_SIZE;
  const pz = height * TILE_SIZE;
  const offsetX = -px / 2;
  const offsetZ = -pz / 2;

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(TILE_SIZE, TILE_SIZE, TILE_SIZE);

  const baseY = 0;
  const treeY = TILE_SIZE * 0.5;
  let treeIndex = 0;

  for (let y = 0; y < height; y++) {
    const row = glyphGrid[y];
    for (let x = 0; x < width; x++) {
      const g = row[x];
      const bg = baseGlyphFor(g);

      const worldX = offsetX + x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = offsetZ + y * TILE_SIZE + TILE_SIZE / 2;

      const baseEntry = instancedBase.get(bg);
      if (baseEntry) {
        pos.set(worldX, baseY, worldZ);
        m.compose(pos, quat, scale);
        baseEntry.im.setMatrixAt(baseEntry.nextIndex++, m);
      }

      if (g === GLYPH_FOREST && treeInst) {
        pos.set(worldX, treeY, worldZ);
        m.compose(pos, quat, scale);
        treeInst.setMatrixAt(treeIndex++, m);
      }
    }
  }

  for (const { im } of instancedBase.values()) im.instanceMatrix.needsUpdate = true;
  if (treeInst) treeInst.instanceMatrix.needsUpdate = true;
}
