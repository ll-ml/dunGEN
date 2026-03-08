import * as THREE from 'three';
import { DungeonEntity } from "./dungeonEntity.js";
import { TileType } from './types.js';
import { Combatant } from './combat.js';
import { SkillManager } from "./skills.js";


const TILE_SIZE =11;
const WIDTH = 40;
const HEIGHT = 30;
const dungeonPixelWidth = WIDTH * TILE_SIZE;
const dungeonPixelHeight = HEIGHT * TILE_SIZE;

export class Player extends DungeonEntity {
   /**
   * @param {number} startX  grid‑column
   * @param {number} startZ  grid‑row
   */
  constructor(startX, startZ, hp = 30.0) {
    super('./public/character-human.glb',
       startX, 
       startZ, {
        height: 0.0,
        scale: TILE_SIZE
       }); // Load the player in. 
    this.path = [];
    this.hp = hp;

    this.skills = new SkillManager();
    
    this.maxHealth = 30.0;
    this._targetWorldPos = null; // Type THREE.Vector3
    this.moveSpeed = TILE_SIZE * 4;
    this.inventory = [];
    this.maxInvenotrySlots = 9;
    this.onArrive = null;

    this.combat = new Combatant(
      this.id,
      this.hp,
      10,
      2,
      0.8
    );

    this.combat.owner = this;
    this.combat.onAttack = () => this.playAttack();
    this.combat.onDie = () => this.die();

    // animations
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this._loadPromise.then(model => {
      this._initAnimations(model);
    });
  }

  _initAnimations(model) {
    this.mixer = new THREE.AnimationMixer(model);

    const findClip = name => 
    (this.animations || []).find(c => c.name === name);

    const idleClip = findClip('idle');
    const walkClip = findClip('walk');
    const attackClip = findClip('attack-melee-right');
    const dieClip = findClip('die');
    const interact = findClip('interact-right');

    if (!idleClip || !walkClip || !attackClip || !dieClip) {
      console.warn('Could not find idle/walk or die clips for player model', idleClip, walkClip);
      return;
    }

    this.actions.idle = this.mixer.clipAction(idleClip);
    this.actions.walk = this.mixer.clipAction(walkClip);
    this.actions.attack = this.mixer.clipAction(attackClip);
    this.actions.die = this.mixer.clipAction(dieClip);
    this.actions.interact = this.mixer.clipAction(interact);

    this.actions.attack.setLoop(THREE.LoopOnce, 1);
    this.actions.attack.clampWhenFinished = true;

    this.actions.die.setLoop(THREE.LoopOnce, 1);
    this.actions.die.clampWhenFinished = true;

    this.actions.interact.setLoop(THREE.LoopOnce, 1);
    this.actions.interact.clampWhenFinished = true;

    this.currentAction = this.actions.idle;
    this.currentAction.play();
  }

  computePath(dest, map) {
  const dirs = [
    new THREE.Vector2(1, 0),
    new THREE.Vector2(-1, 0),
    new THREE.Vector2(0, 1),
    new THREE.Vector2(0, -1),
  ];

  const rows = map.height, cols = map.width;

  const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const prev = Array.from({ length: rows }, () => Array(cols).fill(null));

  const pq = [];
  const start = this.coords.clone();

  dist[start.y][start.x] = 0;
  pq.push({ pos: start.clone(), d: 0 });

  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { pos, d: curD } = pq.shift();

    if (pos.equals(dest)) break;

    for (const dir of dirs) {
      const nxt = pos.clone().add(dir);

      if (
        nxt.x < 0 || nxt.y < 0 ||
        nxt.x >= cols || nxt.y >= rows
      ) continue;

      if (!map.isWalkableAt(nxt.x, nxt.y)) continue;

      const nd = curD + 1;
      if (nd < dist[nxt.y][nxt.x]) {
        dist[nxt.y][nxt.x] = nd;
        prev[nxt.y][nxt.x] = pos.clone();
        pq.push({ pos: nxt, d: nd });
      }
    }
  }

  let end = dest.clone();
  if (end.x < 0 || end.y < 0 || end.x >= cols || end.y >= rows) return [];

  if (!prev[end.y][end.x] && !end.equals(start)) {
    let best = null, bestDist = Infinity;

    for (const dir of dirs) {
      const nb = end.clone().add(dir);
      if (nb.x < 0 || nb.y < 0 || nb.x >= cols || nb.y >= rows) continue;
      if (dist[nb.y][nb.x] < bestDist) {
        bestDist = dist[nb.y][nb.x];
        best = nb.clone();
      }
    }

    if (!best || bestDist === Infinity) return [];
    end = best;
  }

  const path = [];
  let cur = end.clone();
  while (!cur.equals(start)) {
    path.push(cur.clone());
    cur = prev[cur.y][cur.x];
    if (!cur) return [];
  }

  return path.reverse();
}


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
    let pq = [];
    
    const startX = this.coords.x;
    const startY = this.coords.y;
    dist[startY][startX] = 0;
    pq.push({ dist: 0, pos: new THREE.Vector2(startX, startY) });
    
    let finalPos = null;
    
    while (pq.length > 0) {
      // Sort by distance ascending.
      pq.sort((a, b) => a.dist - b.dist);
      const { dist: currentDist, pos: currentPos } = pq.shift();
      
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
        if (!this.canWalkDungeonTiles(tiles[nextPos.y][nextPos.x])) {
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
    if (!finalPos) {
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

  addItem(newItem, quantity = 1) {
    const itemToAdd = Object.create(
      Object.getPrototypeOf(newItem),
      Object.getOwnPropertyDescriptors(newItem)
    );

    let remaining = quantity;

    if (itemToAdd.stackable) {
      for (const invItem of this.inventory) {
        if (remaining <= 0) break;

        if (invItem && invItem.canStackWith(itemToAdd)) {
          const spaceInStack = invItem.maxStackSize - invItem.quantity; // (const spaceInStack = invItem.maxStackSize - (invItem.quantity || 1);)
          const toAdd = Math.min(remaining, spaceInStack);

          invItem.quantity = (invItem.quantity || 1) + toAdd;
          remaining -= toAdd;
        }
      }
    }

    while (remaining > 0 && this.inventory.length < this.maxInvenotrySlots) {
      const newStack = Object.create(
        Object.getPrototypeOf(itemToAdd),
        Object.getOwnPropertyDescriptors(itemToAdd)
      );

      if (itemToAdd.stackable) {
        newStack.quantity = Math.min(remaining, itemToAdd.maxStackSize);
        remaining -= newStack.quantity;
      } else {
        newStack.quantity = 1;
        remaining -= 1;
      }
      this.inventory.push(newStack);
    }

    return quantity - remaining;
  }

  removeItem(index, quantity = 1) {
    const item = this.inventory[index];
    if (!item) return; 

    if (item.quantity && item.quantity > quantity) {
      item.quantity -= quantity;
    } else {
      this.inventory.splice(index, 1);
    }
  }
  

  moveTo(dest, map, onArrive) {
    this.path = this.computePath(dest, map);
    if (this.path.length === 0) return;
    this._onArrive = onArrive || null;
    this._advanceTarget(map);
    this._playAction("walk");
  }

  moveToAsync(dest, map) {
    return new Promise(resolve => this.moveTo(dest, map, resolve));
  }

  _advanceTarget(map) {
    if (this.path.length === 0) {
      this._targetWorldPos = null;
      this._playAction("idle");
      if (this._onArrive) { this._onArrive(); this._onArrive = null; }
      return;
    }

    const next = this.path[0];
    const w = map.gridToWorld(next.x, next.y);

    this._targetWorldPos = new THREE.Vector3(w.x, this.height, w.z);

    this.model.lookAt(this._targetWorldPos.x, this.model.position.y, this._targetWorldPos.z);
  }


  _playAction(name) {
    const next = this.actions[name];
    if (!next || next === this.currentAction) return; 

    next.reset().fadeIn(0.2).play();

    this.currentAction.fadeOut(0.2);

    this.currentAction = next;
  }

  playAttack() {
    this.skills.gainXp("Attack", 5);
    const atk = this.actions.attack;
    if (!atk || this.currentAction === atk) return;
    this.currentAction.fadeOut(0.1);

    atk.reset().fadeIn(0.1).play();
    this.currentAction = atk;

    const onFinish = (e) => {
      if (e.action === atk) {
        this.mixer.removeEventListener('finished', onFinish);
        this._playAction('idle');
      }
    };
    this.mixer.addEventListener('finished', onFinish);
  }

  updateMovement(deltaSeconds, map) {
    if (this.isDead) return;
    if (this.path.length === 0 || !this._targetWorldPos) return;

    const dir = this._targetWorldPos.clone().sub(this.model.position);
    const dist = dir.length();
    const step = this.moveSpeed * deltaSeconds;

    if (dist <= step) {
      this.model.position.copy(this._targetWorldPos);

      const reached = this.path.shift();
      this.coords.set(reached.x, reached.y);

      this.updatePosition(map);

      this._advanceTarget(map);
    } else {
      dir.normalize();
      this.model.position.add(dir.multiplyScalar(step));
    }
  }

  updatePathStep() {
    if (!this.path || this.path.length === 0) {
      return // also play idle if need be
    }

    const nextTile = this.path.shift();

    this.coords.set(nextTile.x, nextTile.y);
    //this.updatePosition();
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
    if (!this.canWalkDungeonTiles(denseMatrix[updatedPos.y][updatedPos.x])) {
      return;
    }
    
    this.desiredPosition.copy(updatedPos);
  }

  applyMove() {
    this.coords.copy(this.desiredPosition);
    this.updateMeshPosition();
  }

  die() {
    this.isDead = true;
    this._playAction('die');
  }

  interact() {
    this._playAction('interact');
    setTimeout(() => this._playAction('idle'), 500);
  }

  async approachAndFight(enemy, tiles, combatMgr) {
    while (true) {

    const dist = this.coords.manhattanDistanceTo(enemy.coords);

    if (dist === 1) {
        this.model.lookAt(
          -dungeonPixelWidth / 2 + enemy.coords.x * TILE_SIZE + TILE_SIZE / 2,
          this.model.position.y,
          -dungeonPixelHeight / 2 + enemy.coords.y * TILE_SIZE + TILE_SIZE / 2
        );
        combatMgr.engage(this.combat, enemy.combat);
        return;
      }

      const nextStep = this.tryMove(enemy.coords, tiles);

      await this.moveToAsync(nextStep, tiles);
    }
  }

  // name change to account for overworld also existing now
  canWalkDungeonTiles(tile) {
    switch (tile) {
      case TileType.WALL:
      case TileType.WATER:
      case TileType.DIRT:
      case TileType.PEBBLE_DIRT:
      case TileType.ROCK_DIRT:
        return false;
      default:
          return true;
    }
  }
}
