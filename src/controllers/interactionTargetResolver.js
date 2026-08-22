import * as THREE from "three";

const CENTER_SCREEN = new THREE.Vector2(0, 0);
const DEFAULT_MAX_RANGE_TILES = 2;

/**
 * Resolves the nearest entity surface under the center-screen crosshair.
 *
 * Every entity model participates in the ray so a nearer structure or
 * character can occlude an interactable behind it. Action behavior is kept
 * out of this class so the same geometry query can later support M1 combat.
 */
export class InteractionTargetResolver {
  constructor({
    camera,
    getMap,
    getRoot = null,
    getPlayer,
    maxRangeTiles = DEFAULT_MAX_RANGE_TILES,
  } = {}) {
    if (!camera || typeof getMap !== "function" || typeof getPlayer !== "function") {
      throw new Error("InteractionTargetResolver requires camera, map, and player");
    }

    this.camera = camera;
    this.getMap = getMap;
    this.getRoot = getRoot;
    this.getPlayer = getPlayer;
    this.maxRangeTiles = Math.max(
      0,
      Number.isFinite(maxRangeTiles) ? maxRangeTiles : DEFAULT_MAX_RANGE_TILES
    );

    this.raycaster = new THREE.Raycaster();
    this._roots = [];
    this._rootOwners = new Map();
    this._terrainProbe = new THREE.Vector3();
  }

  resolve(context = {}) {
    const map = this.getMap();
    const player = this.getPlayer();
    if (!map || !player) return null;

    const tileSize = map.tileSize ?? 11;
    this.camera.updateMatrixWorld(true);
    this.raycaster.near = 0;
    this.raycaster.far = this.maxRangeTiles * tileSize;
    this.raycaster.setFromCamera(CENTER_SCREEN, this.camera);

    this._collectRoots(map, player);
    if (this._roots.length === 0) return null;

    const hits = this.raycaster.intersectObjects(this._roots, true);
    for (const hit of hits) {
      const root = this._findOwnerRoot(hit.object);
      if (!root || !this._isEffectivelyVisible(hit.object, root)) continue;

      const target = this._makeTarget(
        this._rootOwners.get(root),
        hit,
        map,
        context
      );
      if (!target || this._isTerrainOccluded(hit, map)) return null;
      return target;
    }

    return null;
  }

  _collectRoots(map, player) {
    this._roots.length = 0;
    this._rootOwners.clear();
    const activeRoot = this.getRoot?.() ?? null;
    activeRoot?.updateMatrixWorld?.(true);

    for (const entity of map.entities ?? []) {
      const root = entity?.model;
      if (!root || entity === player || root === player.model) continue;
      if (root.visible === false || entity._isDying || entity.readyToRemove) continue;
      if (activeRoot && !this._isDescendantOf(root, activeRoot)) continue;

      if (!activeRoot) root.updateMatrixWorld(true);
      this._roots.push(root);
      this._rootOwners.set(root, entity);
    }
  }

  _makeTarget(entity, hit, map, context) {
    const interaction = entity?.interaction;
    if (!interaction?.isAvailable?.({ ...context, map })) return null;

    const tileSize = map.tileSize ?? 11;
    const rangeTiles = Number.isFinite(interaction.rangeTiles)
      ? interaction.rangeTiles
      : this.maxRangeTiles;
    if (hit.distance > rangeTiles * tileSize) return null;

    return {
      entity,
      interaction,
      point: hit.point.clone(),
      distance: hit.distance,
    };
  }

  _findOwnerRoot(object) {
    let current = object;
    while (current) {
      if (this._rootOwners.has(current)) return current;
      current = current.parent;
    }
    return null;
  }

  _isEffectivelyVisible(object, root) {
    let current = object;
    while (current) {
      if (current.visible === false) return false;
      if (current === root) break;
      current = current.parent;
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    return materials.length === 0 || materials.some((material) => material.visible !== false);
  }

  _isDescendantOf(object, ancestor) {
    let current = object;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  _isTerrainOccluded(hit, map) {
    if (
      typeof map.blocksInteractionAt !== "function" ||
      typeof map.worldToGrid !== "function"
    ) return false;

    const startGrid = map.worldToGrid(this.raycaster.ray.origin);
    if (!startGrid) return true;

    const tileSize = map.tileSize ?? 11;
    const step = Math.max(tileSize * 0.2, 0.1);
    let lastGridKey = null;

    for (let distance = 0; distance < hit.distance; distance += step) {
      this._terrainProbe
        .copy(this.raycaster.ray.direction)
        .multiplyScalar(distance)
        .add(this.raycaster.ray.origin);
      const grid = map.worldToGrid(this._terrainProbe);
      if (!grid) return true;
      if (grid.x === startGrid.x && grid.y === startGrid.y) continue;

      const gridKey = `${grid.x},${grid.y}`;
      if (gridKey === lastGridKey) continue;
      lastGridKey = gridKey;
      if (map.blocksInteractionAt(grid.x, grid.y)) return true;
    }

    const targetGrid = map.worldToGrid(hit.point);
    return Boolean(
      targetGrid &&
      (targetGrid.x !== startGrid.x || targetGrid.y !== startGrid.y) &&
      map.blocksInteractionAt(targetGrid.x, targetGrid.y)
    );
  }
}
