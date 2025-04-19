import * as THREE from 'three';
import { DungeonObject } from './dungeonObject.js';
import { InventoryItem, TileType } from './types.js';
import { Enemy } from './enemy.js';

export class Player extends DungeonObject {
   /**
   * @param {number} startX  grid‑column
   * @param {number} startZ  grid‑row
   */
  constructor(startX, startZ) {
    super('./public/character-human.glb',
       startX, 
       startZ, {
        height: 1.0,
        scale: 11
       }); // Load the player in. 
    // Store the desired position separately
    this.desiredPosition = this.coords.clone();
    this.inventory = [];
  }

  /**
   * Attempt to update the desired position based on input.
   * @param {THREE.Vector2} directionVector - The move direction (e.g., (0, -1) for up).
   * @param {Array<Array<any>>} denseMatrix - The dungeon grid.
   */
  setDesiredMove(directionVector, denseMatrix) {
    const updatedPos = this.coords.clone().add(directionVector);
    
    if (
      updatedPos.x < 0 ||
      updatedPos.y < 0 ||
      updatedPos.x >= denseMatrix[0].length ||
      updatedPos.y >= denseMatrix.length
    ) {
      return; // Out of bounds, cancel movement.
    }
    
    // Check collision: only move if the tile is walkable.
    if (!this.canWalk(denseMatrix[updatedPos.y][updatedPos.x])) {
      return;
    }
    
    this.desiredPosition.copy(updatedPos);
  }

  applyMove() {
    this.coords.copy(this.desiredPosition);
    this.updateMeshPosition();
  }

  canWalk(tile) {
    // TODO: Make this better
    return tile !== TileType.WALL && tile !== TileType.WATER && tile !== TileType.DIRT && tile != TileType.PEBBLE_DIRT && tile !== TileType.ROCK_DIRT;
  }
  
  addTestItem() {
    const warHammer = new InventoryItem(
      "warhammer",
      "War Hammer",
      "tile_0117.png",
      "A devastating war hammer"
    );

    this.inventory.push(warHammer);
  }

  isAdjacentToPool(denseMatrix, sparseMatrix) {
    const tileX = this.coords.x;
    const tileY = this.coords.y;

    const directions = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1),
      new THREE.Vector2(0, -1)
    ];

    for (const direction of directions) {
      const newTileX = tileX + direction.x;
      const newTileY = tileY + direction.y;

      if (newTileY < 0 || newTileY >= denseMatrix.length || 
        newTileX < 0 || newTileX >= denseMatrix[0].length
      ) {
        continue;
      }

      if (denseMatrix[newTileY][newTileX] == TileType.WATER) {
        return true;
      }

      const ajdCoords = new THREE.Vector2(newTileX, newTileY)
      for (const obj of sparseMatrix) {
        if (obj instanceof Enemy && obj.coords.equals(ajdCoords)) {
          obj.hp -= 10;
          console.log("Hit enemy: ", obj.id, " at tile: ", obj.coords, " now has hp: ", obj.hp);
        }
      }
    }

    return false;
  }
}
