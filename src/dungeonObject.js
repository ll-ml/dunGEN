import { DungeonEntity } from "./dungeonEntity.js";

/**
 * @param {string} modelPath   URL or relative path to your .glb
 * @param {number} gridX, gridY
 * @param {{ height?: number, scale?: number, colormap?: string }} opts
 */
export class DungeonObject extends DungeonEntity {
  constructor(modelPath, gridX, gridY, opts = {}) {
    super(modelPath, gridX, gridY, opts);
  }
}
