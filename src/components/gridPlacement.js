export class GridPlacement {
  constructor() {
    this.entity = null;
  }

  attach(entity) {
    this.entity = entity;
  }

  updatePosition(map) {
    const entity = this.entity;
    if (!entity?.model) return;

    if (!map) {
      console.warn("GridPlacement.updatePosition called without map");
      return;
    }

    const height = entity.height ?? 0;

    if (typeof map.gridToWorld === "function") {
      const world = map.gridToWorld(entity.coords.x, entity.coords.y);
      entity.model.position.set(world.x, world.y + height, world.z);
    } else {
      const tileSize = map.tileSize ?? 11;
      const offsetX = map.offsetX ?? 0;
      const offsetZ = map.offsetZ ?? 0;

      const wx = offsetX + entity.coords.x * tileSize + tileSize / 2;
      const wz = offsetZ + entity.coords.y * tileSize + tileSize / 2;
      entity.model.position.set(wx, height, wz);
    }

    entity._recomputeBox();
    if (entity.helper) {
      entity.helper.box.copy(entity.hitbox);
      entity.helper.updateMatrixWorld(true);
    }
  }
}
