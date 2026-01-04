import * as THREE from "three";
import { TILE_DEFS, TileId } from "./wfc.js";

export function buildOverworld(scene, modelMap, glyphGrid, TILE_SIZE) {
  // IMPORTANT: do NOT remove lights. Clear only a world group.

  const height = glyphGrid.length;
  const width = glyphGrid[0]?.length ?? 0;
  if (!width || !height) return;

  const GLYPH_WATER  = TILE_DEFS[TileId.WATER].glyph;        // "~"
  const GLYPH_SAND   = TILE_DEFS[TileId.SAND].glyph;         // ","
  const GLYPH_GRASS  = TILE_DEFS[TileId.GRASS].glyph;        // "."
  const GLYPH_DENSE  = TILE_DEFS[TileId.DENSE_GRASS].glyph;  // "\""
  const GLYPH_FOREST = TILE_DEFS[TileId.FOREST].glyph;       // "T"


  function extractAllMeshes(protoScene) {
    const meshes = [];
    protoScene.traverse((obj) => {
      if (obj.isMesh) meshes.push(obj);
    });
    return meshes;
  }

  function makeInstancedMeshesFromProto(protoScene, count) {
    const meshes = extractAllMeshes(protoScene);
    return meshes.map((m) => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return im;
    });
  }

  let waterCount = 0;
  let sandCount = 0;
  let grassBaseCount = 0;
  let denseOverlayCount = 0;
  let treeCount = 0;        // overlay for T

  for (let y = 0; y < height; y++) {
    const row = glyphGrid[y];
    for (let x = 0; x < width; x++) {
      const g = row[x];

      if (g === GLYPH_WATER) {
        waterCount++;
      } else if (g === GLYPH_SAND) {
        sandCount++;
      } else if (g === GLYPH_GRASS) {
        grassBaseCount++;
      } else if (g === GLYPH_DENSE) {
        grassBaseCount++;
        denseOverlayCount++;
      } else if (g === GLYPH_FOREST) {
        grassBaseCount++;
        denseOverlayCount++;
        treeCount++;
      } else {
        // unknown: treat as grass
        grassBaseCount++;
      }
    }
  }

  const px = width * TILE_SIZE;
  const pz = height * TILE_SIZE;
  const offsetX = -px / 2;
  const offsetZ = -pz / 2;

  const inst = {};

  if (waterCount > 0 && modelMap[GLYPH_WATER]) {
    inst.water = makeInstancedMeshesFromProto(modelMap[GLYPH_WATER], waterCount);
    inst.water.forEach((m) => scene.add(m));
  }

  if (sandCount > 0 && modelMap[GLYPH_SAND]) {
    inst.sand = makeInstancedMeshesFromProto(modelMap[GLYPH_SAND], sandCount);
    inst.sand.forEach((m) => scene.add(m));
  }

  if (grassBaseCount > 0 && modelMap[GLYPH_GRASS]) {
    inst.grass = makeInstancedMeshesFromProto(modelMap[GLYPH_GRASS], grassBaseCount);
    inst.grass.forEach((m) => scene.add(m));
  }

  // Overlay: dense grass
  if (denseOverlayCount > 0 && modelMap[GLYPH_DENSE]) {
    inst.dense = makeInstancedMeshesFromProto(modelMap[GLYPH_DENSE], denseOverlayCount);
    inst.dense.forEach((m) => scene.add(m));
  }

  if (treeCount > 0 && modelMap["TREE"]) {
    inst.tree = makeInstancedMeshesFromProto(modelMap["TREE"], treeCount);
    inst.tree.forEach((m) => scene.add(m));
  }


  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(TILE_SIZE, TILE_SIZE, TILE_SIZE);

  const yBase  = 0;
  const yDense = TILE_SIZE * 0.01;
  const yTree  = 0;

  let iWater = 0, iSand = 0, iGrass = 0, iDense = 0, iTree = 0;

  function setAll(instancedMeshes, index, matrix) {
    if (!instancedMeshes) return;
    for (const im of instancedMeshes) im.setMatrixAt(index, matrix);
  }

  for (let y = 0; y < height; y++) {
    const row = glyphGrid[y];
    for (let x = 0; x < width; x++) {
      const g = row[x];

      const worldX = offsetX + x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = offsetZ + y * TILE_SIZE + TILE_SIZE / 2;

      if (g === GLYPH_WATER) {
        pos.set(worldX, yBase, worldZ);
        mat.compose(pos, quat, scl);
        setAll(inst.water, iWater++, mat);
        continue;
      }

      if (g === GLYPH_SAND) {
        pos.set(worldX, yBase, worldZ);
        mat.compose(pos, quat, scl);
        setAll(inst.sand, iSand++, mat);
        continue;
      }

      pos.set(worldX, yBase, worldZ);
      mat.compose(pos, quat, scl);
      setAll(inst.grass, iGrass++, mat);

      if (g === GLYPH_DENSE || g === GLYPH_FOREST) {
        pos.set(worldX, yDense, worldZ);
        mat.compose(pos, quat, scl);
        setAll(inst.dense, iDense++, mat);
      }

      if (g === GLYPH_FOREST) {
        pos.set(worldX, yTree, worldZ);
        mat.compose(pos, quat, scl);
        setAll(inst.tree, iTree++, mat);
      }
    }
  }

  for (const key of ["water", "sand", "grass", "dense", "tree"]) {
    const arr = inst[key];
    if (!arr) continue;
    for (const im of arr) im.instanceMatrix.needsUpdate = true;
  }
}
