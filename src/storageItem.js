import { DungeonObject } from './dungeonObject'
import { TILE_SIZE } from './types'

export class StorageItem extends DungeonObject {
   /**
   * @param {string}    id
   * @param {number}    x, y   tile coords
   * @param {InventoryItem[]} contents  up to N items
   * @param {Object}    opts   optional { glbPath, scale, height }
   */
  constructor(id, x, y, contents = [], opts = {}) {
    const {glbPath = './public/barrel.glb', scale = TILE_SIZE, height = 0} = opts;
    super(glbPath, x, y, {scale, height});
    this.id = id;

    this.contents = contents.slice(0, 3);
  }
}