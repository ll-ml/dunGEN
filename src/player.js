import * as THREE from 'three';
import { GridEntity } from "./gridEntity.js";
import { Combatant } from './combat.js';
import { SkillManager } from "./skills.js";
import { cloneInventoryItem } from "./inventory.js";


const TILE_SIZE =11;
export class Player extends GridEntity {
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

    this.skills = new SkillManager();
    
    this.maxHealth = 30.0;
    this._targetWorldPos = null; // Type THREE.Vector3
    this.moveSpeed = TILE_SIZE * 4;
    this.inventory = [];
    this.maxInvenotrySlots = 9;

    this.combat = new Combatant(
      this.id,
      hp,
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


  addItem(newItem, quantity = 1) {
    const itemToAdd = cloneInventoryItem(newItem);

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
      const newStack = cloneInventoryItem(itemToAdd);

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
    if (this.path.length === 0) {
      this._targetWorldPos = null;
      this._playAction("idle");
      this._onArrive = null;
      if (onArrive) onArrive();
      return;
    }
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

  die() {
    this.isDead = true;
    this._playAction('die');
  }

  interact() {
    const interact = this.actions.interact;
    if (!interact || this.currentAction === interact) return;

    this._playAction('interact');

    const onFinish = (event) => {
      if (event.action !== interact) return;
      this.mixer.removeEventListener('finished', onFinish);
      this._playAction('idle');
    };
    this.mixer.addEventListener('finished', onFinish);
  }

}
