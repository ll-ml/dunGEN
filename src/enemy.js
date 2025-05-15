import * as THREE from 'three';
import { TileType } from './types.js';
import { DungeonObject } from './dungeonObject.js';
import { Combatant } from './combat.js';
import { PriorityQueue } from './pq.js'

const TILE_SIZE = 11;
const WIDTH      = 40;   // match your main.js
const HEIGHT     = 30;
const dungeonPixelWidth  = WIDTH  * TILE_SIZE;
const dungeonPixelHeight = HEIGHT * TILE_SIZE;

export class Enemy extends DungeonObject {
  constructor(glbPath, id, hp, x, y, atk, agroRange = 10) {
    const glbModelPath = glbPath;
    super(glbModelPath, x, y,
      {
        scale: TILE_SIZE,
        height: 0.0
      }
    );
    this.id = id;
    this.hp = hp; 
    this.attackPower = atk;
    this.agroRange = agroRange; // This should do more

    this.combat = new Combatant(
      this.id,
      hp,
      atk,
      0,
      0.6
    );
    this.combat.owner = this;

    this.combat.onDie = () => this.die();
    this.combat.onAttack = () => this.attack();

    this.path = [];
    this._targetWorldPos = null;
    this.idleSpeed = TILE_SIZE * 0.75;
    this.chaseSpeed = TILE_SIZE * 2
    this.moveSpeed = this.idleSpeed; // slower then the player

    // 3D Movement
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this._isDying = false;
    this.readyToRemove = false;

    this._loadPromise.then(model => this._initAnimations(model));
  }

  _initAnimations(model) {
    this.mixer = new THREE.AnimationMixer(model);

    const find = name => (this.animations || []).find(c => c.name === name);
    const idleClip = find('idle');
    const walkClip = find('walk');
    const dieClip = find('die');
    const attackClip = find('attack-melee-right');
    if (!idleClip || !walkClip || !attackClip || !dieClip) return console.warn('No idle, walk or attack animatons found for: ', this.id);

    this.actions.idle = this.mixer.clipAction(idleClip);
    this.actions.walk = this.mixer.clipAction(walkClip);
    this.actions.die = this.mixer.clipAction(dieClip);
    this.actions.attack = this.mixer.clipAction(attackClip);

    this.actions.die.setLoop(THREE.LoopOnce, 1);
    this.actions.die.clampWhenFinished = true;
    
    this.actions.attack.setLoop(THREE.LoopOnce, 1);
    this.actions.attack.clampWhenFinished = true;

    this.currentAction = this.actions.idle;
    this.currentAction.play();
  }

  /**
 * Pick one random, walkable neighbor of `from`.
 */
_idleStepFrom(from, tiles) {
  const rows = tiles.length, cols = tiles[0].length;
  const dirs = [
    new THREE.Vector2( 1,  0),
    new THREE.Vector2(-1,  0),
    new THREE.Vector2( 0,  1),
    new THREE.Vector2( 0, -1),
  ];
  // shuffle dirs
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const d of dirs) {
    const cand = from.clone().add(d);
    if (
      cand.x >= 0 && cand.y >= 0 &&
      cand.x < cols  && cand.y < rows &&
      this.canWalk(tiles[cand.y][cand.x])
    ) return cand;
  }
  // no neighbor? stay put
  return from.clone();
}

/**
 * Called once per AI‐tick (e.g. every 0.5s).  If player is in range,
 * path one step toward them.  Otherwise, if we’ve finished our
 * last “wander” path, build a brand‐new 4–10‐step random route.
 */
think(playerCoords, tiles) {
  if (!this.model || this._isDying || this.readyToRemove) return; // Probably needs a loading screen at some point
  const manhattan =
    Math.abs(this.coords.x - playerCoords.x) +
    Math.abs(this.coords.y - playerCoords.y);

  if (manhattan <= this.agroRange) {
    // chase
    this.moveSpeed = this.chaseSpeed;
    const step = this.tryMove(playerCoords, tiles);
    // Look at the player
    this.model.lookAt(
      -dungeonPixelWidth / 2 + playerCoords.x * TILE_SIZE + TILE_SIZE / 2,
      this.model.position.y,
      -dungeonPixelHeight / 2 + playerCoords.y * TILE_SIZE + TILE_SIZE / 2
    );
    if (!step.equals(this.coords)) {
      this.path = [ step ];
      this._advanceTarget();
      this._setAction('walk');
    }
  } else {
    this.moveSpeed = this.idleSpeed;
    // if we still have leftover wander‐steps, keep going
    if (this.path.length > 0) return;

    // otherwise pick a new random patrol length
    const wanderLen = 4 + Math.floor(Math.random() * 7); // 4..10
    const patrol = [];
    let cursor = this.coords.clone();

    for (let i = 0; i < wanderLen; i++) {
      const next = this._idleStepFrom(cursor, tiles);
      if (next.equals(cursor)) break;  // no further movement
      patrol.push(next);
      cursor = next;
    }

    if (patrol.length) {
      this.path = patrol;
      this._advanceTarget();
      this._setAction('walk');
    } else {
      // couldn't generate a wander path → stay idle
      this._setAction('idle');
    }
  }
}

  _advanceTarget() {
    if (this.path.length === 0) {
      this._targetWorldPos = null;
      return;
    }

    const next = this.path[0];
    this._targetWorldPos = new THREE.Vector3(
      -dungeonPixelWidth/2 + next.x * TILE_SIZE + TILE_SIZE/2,
      this.height, 
      -dungeonPixelHeight/2+ next.y * TILE_SIZE + TILE_SIZE/2
    );

    this.model.lookAt(
      this._targetWorldPos.x,
      this.model.position.y,
      this._targetWorldPos.z
    );
  }

  updateMovement(deltaSeconds) {
    if (!this._targetWorldPos) return;

    const dir = this._targetWorldPos.clone().sub(this.model.position);
    const dist = dir.length();
    const step = this.moveSpeed * deltaSeconds;

    if (dist <= step) {
      this.model.position.copy(this._targetWorldPos);
      const reached = this.path.shift();
      this.coords.set(reached.x, reached.y);
      this.updatePosition();
      this._advanceTarget();
      if (!this._targetWorldPos) this._setAction('idle');
    } else {
      dir.normalize();
      this.model.position.add(dir.multiplyScalar(step));

    }
  }

  /**
 * @param {name} string name of the action to play
 */
  _setAction(name) {
    const next = this.actions[name];
    if (next && this.currentAction !== next) {
      this.currentAction.fadeOut(0.2);
      next.reset().fadeIn(0.2).play();
      this.currentAction = next;
    }
  }

  move(updatedPos) {
    this.coords.copy(updatedPos);
    this.updateMeshPosition();
  }

  /**
   * Attempt to move toward the player.
   * @param {THREE.Vector2} playerPos - The player's tile coordinates.
   * @param {Array<Array<any>>} tiles - The 2D dense matrix of tile types.
   * @returns {THREE.Vector2} - The next tile position for the enemy.
   */
  tryMove(playerPos, tiles) {
    const rows = tiles.length;
    const cols = tiles[0].length;
    const manhattanDist = Math.abs(this.coords.x - playerPos.x) + Math.abs(this.coords.y - playerPos.y);
    
    // If the player is too far, do nothing.
    if (manhattanDist > this.agroRange) {
      return this.coords.clone();
    }
    
    const directions = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1),
      new THREE.Vector2(0, -1)
    ];
    
    // Initialize distance and previous matrices.
    const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
    const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
    
    // Simple priority queue implemented as an array.
    // Each element is an object: { dist: number, pos: THREE.Vector2 }
    //let pq = [];
    const pq = new PriorityQueue((a, b) => a.dist - b.dist);
    
    const startX = this.coords.x;
    const startY = this.coords.y;
    dist[startY][startX] = 0;
    pq.push({ dist: 0, pos: new THREE.Vector2(startX, startY) });
    
    let finalPos = null;
    
    while (!pq.isEmpty()) {
      // Sort by distance ascending.
      //pq.sort((a, b) => a.dist - b.dist);
      const { dist: currentDist, pos: currentPos } = pq.pop();
      
      // If we are adjacent to the player, stop.
      if (Math.abs(currentPos.x - playerPos.x) + Math.abs(currentPos.y - playerPos.y) === 1) {
        finalPos = currentPos;
        break;
      }
      
      // Explore neighbors.
      for (const dir of directions) {
        const nextPos = new THREE.Vector2(currentPos.x + dir.x, currentPos.y + dir.y);
        // Check bounds.
        if (nextPos.x < 0 || nextPos.y < 0 || nextPos.x >= cols || nextPos.y >= rows) {
          continue;
        }
        // Skip walls.
        if (!this.canWalk(tiles[nextPos.y][nextPos.x])) {
          continue;
        }
        const newDist = currentDist + 1;
        if (newDist < dist[nextPos.y][nextPos.x]) {
          dist[nextPos.y][nextPos.x] = newDist;
          prev[nextPos.y][nextPos.x] = currentPos;
          pq.push({ dist: newDist, pos: nextPos });
        }
      }
    }
    
    // If no adjacent tile was found, don't move.
    if (finalPos === null) {
      return this.coords.clone();
    }
    
    // Backtrack from finalPos until we reach our own coordinates.
    let step = finalPos;
    while (prev[step.y][step.x] && !prev[step.y][step.x].equals(this.coords)) {
      step = prev[step.y][step.x];
      // If there’s a broken link, stay put.
      if (!step) {
        return this.coords.clone();
      }
    }
    
    // next move towards the player.
    return step;
  }

  idle(tiles) {
    const rows = tiles.length;
    const cols = tiles[0].length;
    const directions = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1),
      new THREE.Vector2(0, -1)
    ];
    
    let tries = 4;
    while (tries-- > 0) {
      const idx = Math.floor(Math.random() * directions.length);
      const nextPos = this.coords.clone().add(directions[idx]);
      if (nextPos.x < 0 || nextPos.y < 0 || nextPos.x >= cols || nextPos.y >= rows) {
        continue;
      }
      if (!this.canWalk(tiles[nextPos.y][nextPos.x])) {
        continue;
      }
      return nextPos;
    }
    return this.coords.clone(); // return null more effiecnt here?
  }

  canWalk(tile) {
    return tile !== TileType.WALL && tile !== TileType.WATER & tile !== TileType.DIRT && tile !== TileType.PEBBLE_DIRT && tile !== TileType.ROCK_DIRT;
  }

  die() {
    if (!this.actions.die || this._isDying) return;
    this._isDying = true;
    this._setAction('die');

    this.mixer.addEventListener('finished', (e) => {
      if (e.action == this.actions.die) {
        this.readyToRemove = true;
      }
    });
  }

  attack() {
    const attackAction = this.actions.attack;
    if (!attackAction) return;
  
    this._setAction('attack');
  
    const onFinish = e => {
      if (e.action === attackAction) {
        this.mixer.removeEventListener('finished', onFinish);
        // once the attack clip finishes, go back to walk/idle
        const nextState = this.path && this.path.length ? 'walk' : 'idle';
        this._setAction(nextState);
      }
    };
  
    this.mixer.addEventListener('finished', onFinish);
  }
}
