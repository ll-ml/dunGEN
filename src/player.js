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
    this.path = [];
    this.inventory = [];
  }

  computePath(dest, tiles) {
    const dirs = [
      new THREE.Vector2(1, 0), 
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1), 
      new THREE.Vector2(0, -1)
    ];

    const rows = tiles.length, cols = tiles[0].length;

    const dist = Array(rows).fill().map(() => Array(cols).fill(Infinity));
    const prev = Array(rows).fill().map(() => Array(cols).fill(null));

    const pq = [];
    const start = this.coords.clone();
    dist[start.y][start.x] = 0; // logic is in 2D
    pq.push({pos: start, d: 0});

    while (pq.length) {
      pq.sort((a, b) => a.d - b.d); // Need this for priority queue
      const { pos, d: curD } = pq.shift();

      if (pos.equals(dest)) break;

      for (const dir of dirs) {
        const nxt = pos.clone().add(dir);
        if (
          nxt.x < 0 || nxt.y < 0 ||
          nxt.x >= cols || nxt.y >= rows || 
          !this.canWalk(tiles[nxt.y][nxt.x])
        ) continue;

        const nd = curD + 1;
        if (nd < dist[nxt.y][nxt.x]) {
          dist[nxt.y][nxt.x] = nd;
          prev[nxt.y][nxt.x] = pos;
          pq.push({ pos: nxt, d: nd});
        }
      }
    }

    const path = []; 
    let cur = dest.clone(); 
    if (!prev[cur.y][cur.x] && !cur.equals(start)) {
      return []; // no path found
    }

    while (!cur.equals(start)) {
      path.push(cur.clone());
      cur = prev[cur.y][cur.x];
    }
    path.reverse();
    return path;
  }

  moveTo(dest, tiles) {
    this.path = this.computePath(dest, tiles);
    console.log('  path is Array?', Array.isArray(this.path));      // must be true
    console.log('  path.length=', this.path.length);                // must be > 0
    console.log('  path entries:', this.path.map(v=>`${v.x},${v.y}`));
  }
  

  updatePathStep() {
    if (!this.path || this.path.length === 0) {
      return // also play idle if need be
    }

    this.coords.set(next.x, next.y);
    this.updatePosition();
    // playaction(walk)
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
