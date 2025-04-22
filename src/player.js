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
      new THREE.Vector2( 1,  0),
      new THREE.Vector2(-1,  0),
      new THREE.Vector2( 0,  1),
      new THREE.Vector2( 0, -1),
    ];
    const rows = tiles.length, cols = tiles[0].length;
  
    // Distance & back‑pointers
    const dist = Array(rows).fill().map(() => Array(cols).fill(Infinity));
    const prev = Array(rows).fill().map(() => Array(cols).fill(null));
  
    // Min‑queue as array
    const pq = [];
    const start = this.coords.clone();
    dist[start.y][start.x] = 0;
    pq.push({ pos: start.clone(), d: 0 });
  
    // Dijkstra’s loop
    while (pq.length) {
      pq.sort((a, b) => a.d - b.d);
      const { pos, d: curD } = pq.shift();
  
      // Once we’ve “reached” dest, stop searching
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
          prev[nxt.y][nxt.x] = pos.clone();  // store a clone
          pq.push({ pos: nxt, d: nd });
        }
      }
    }
  
    // Figure out where we actually ended up
    let end = dest.clone();
    if (!prev[end.y][end.x]) {
      // dest was never reached — find nearest neighbor that was
      let best = null, bestDist = Infinity;
      for (const dir of dirs) {
        const nb = end.clone().add(dir);
        if (
          nb.x < 0 || nb.y < 0 ||
          nb.x >= cols || nb.y >= rows
        ) continue;
        if (dist[nb.y][nb.x] < bestDist) {
          bestDist = dist[nb.y][nb.x];
          best = nb.clone();
        }
      }
      if (!best || bestDist === Infinity) {
        // nowhere reachable
        return [];
      }
      end = best;
    }
  
    // Back‑track to build the path
    const path = [];
    let cur = end.clone();
    while (!cur.equals(start)) {
      path.push(cur.clone());
      cur = prev[cur.y][cur.x];
      if (!cur) break;  // safety
    }
    return path.reverse();
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

    const nextTile = this.path.shift();

    this.coords.set(nextTile.x, nextTile.y);
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
