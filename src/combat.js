import { showDamage } from './damageDisplay';

export class Combatant {
  constructor(id, maxHp, attack, defence = 0, hitChance = 0.75) {
    this.id          = id;
    this.hp          = maxHp;
    this.attackPower = attack;
    this.defence     = defence;
    this.hitChance   = hitChance;
    this.owner       = null;        // set to the DungeonObject
    this.onAttack    = null;
    this.onDie       = null;
  }

  isAlive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    const net = Math.max(1, amount - this.defence);
    this.hp = Math.max(0, this.hp - net);
    if (this.hp === 0 && typeof this.onDie === "function") {
      this.onDie();
    }
    return this.hp === 0;
  }
}

export function resolveAttack(attacker, defender) {
  const hit = Math.random() < attacker.hitChance;
  let damage = 0, defenderDied = false;

  if (hit) {
    damage = Math.max(1, attacker.attackPower - defender.defence);
    defenderDied = defender.takeDamage(damage);

    if (attacker.owner?.model && defender.owner?.model) {
      const worldPos = defender.owner.model.position.clone();
      worldPos.y += defender.owner.height + 1; 
      showDamage(damage, worldPos);
    }
  }

  return { hit, damage, defenderDied };
}


export class CombatSession {
  constructor(a, b) {
    this.a      = a;
    this.b      = b;
    this.turn   = 0;
    this.active = true;
  }

  step() {
    if (!this.active) return null;
    const attacker = (this.turn === 0 ? this.a : this.b);
    const defender = (this.turn === 0 ? this.b : this.a);

    if (attacker.owner?.model && defender.owner?.model) {
      attacker.owner.model.lookAt(defender.owner.model.position);
    }
    const { hit, damage } = resolveAttack(attacker, defender);

    if (hit && typeof attacker.onAttack === "function") {
      attacker.onAttack();
    }
    const died = defender.takeDamage(damage);

    this.turn = 1 - this.turn;
    if (died) {
      this.active = false;
      //return { winner: this.a, loser: this.b, hit, damage };
      return { winner: attacker, loser: defender, hit, damage };
    }
    return null;
  }
}

export class CombatManager {
  constructor() {
    this.sessions = [];
    this.onDeath  = null; // callback({ winner, loser, hit, damage })
  }

  engage(a, b) {
    if (this.sessions.some(s =>
        (s.a === a && s.b === b) || (s.a === b && s.b === a)
      )) return;
    this.sessions.push(new CombatSession(a, b));
  }

  update() {
    for (let i = this.sessions.length - 1; i >= 0; i--) {
      const result = this.sessions[i].step();
      if (!result) continue;

      this.sessions.splice(i, 1);
      if (typeof this.onDeath === "function") {
        this.onDeath(result);
      }
    }
  }

  disengage(combatant) {
    this.sessions = this.sessions.filter(s =>
      s.a !== combatant && s.b !== combatant
    );
  }
}
