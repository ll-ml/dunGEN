import { GridEntity } from "./gridEntity.js";
import { TILE_SIZE } from "./types.js";
import { InteractionComponent } from "./components/interactionComponent.js";
import { StorageOpenAnimation } from "./components/storageOpenAnimation.js";

export class StorageItem extends GridEntity {
   /**
   * @param {string}    id
   * @param {number}    x, y   tile coords
   * @param {InventoryItem[]} contents  up to N items
   * @param {Object}    opts   optional { glbPath, scale, height }
  */
  constructor(id, x, y, contents = [], opts = {}) {
    const {
      glbPath = "./public/barrel.glb",
      scale = TILE_SIZE,
      height = 0,
    } = opts;
    super(glbPath, x, y, { scale, height, kind: "Storage", id });

    this.contents = contents.slice(0, 3);
    this.openAnimation = this.addComponent(new StorageOpenAnimation());
    this.addComponent(new InteractionComponent({
      id: "search-storage",
      label: ({ entity }) => `Search ${entity.id}`,
      rangeTiles: 1.5,
      isAvailable: ({ entity }) => entity.contents.length > 0,
      execute: async ({ game, map, entity }) => {
        const worldAnimation = entity.openAnimation.play();
        const handAnimation = game?.playHandReach?.({
          duration: entity.openAnimation.duration,
        }) ?? Promise.resolve(true);
        const [worldCompleted, handCompleted] = await Promise.all([
          worldAnimation,
          handAnimation,
        ]);
        if (!worldCompleted || !handCompleted) return false;
        return game?.ui?.openStorageModal?.(entity, map) ?? false;
      },
    }));
  }
}

export class DroppedItem extends GridEntity {
  /**
   * @param {string} id
   * @param {number} x, y tile coords
   * @param {string} glbPath model path
   * @param {InventoryItem} item represented inventory item
   * @param {Object} opts optional tile-relative scale, height, and range
   */
  constructor(id, x, y, glbPath, item, opts = {}) {
    const {
      tileSize = TILE_SIZE,
      scale = tileSize / 2,
      height = 0,
      rangeTiles = 1.5,
    } = opts;
    super(glbPath, x, y,
      {
        scale,
        height,
        kind: "DroppedItem",
        id,
      }
    );
    this.item = item;
    this.addComponent(new InteractionComponent({
      id: "pick-up",
      label: ({ entity }) =>
        `Pick up ${entity.item?.name ?? entity.id}`,
      rangeTiles,
      isAvailable: ({ entity }) =>
        Boolean(entity.item && (entity.item.quantity ?? 1) > 0),
      execute: ({ game, map, entity }) =>
        game?.pickUpDroppedItem?.(entity, map),
    }));
  }
}
