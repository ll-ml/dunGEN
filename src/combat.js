export class Combatant {
    constructor(id, maxHp, attack, defence = 0, hitChance = 0.75) {
        this.id = id;
        this.hp = maxHp; 
        this.attackPower = attack;
        this.defence = defence;
        this.hitChance = hitChance;

        this.onDie = null;
        this.onAttack = null;
    }

    isAlive() {
        return this.hp > 0;
    }

    // Returns true of Combatant died from attack.
    takeDamage(dmg) {
        const net = Math.max(1, dmg - this.defence); // Defence lowers overall hits
        this.hp = Math.max(0, this.hp - net);
        if (this.hp === 0) {
            this.onDie();
        }
        return this.hp <= 0;
    }
}

export function resolveAttack(attacker, defender) {
    const hit = Math.random() < attacker.hitChance;
    let damage = 0, defenderDied = false;
    if (hit) {
        if (typeof attacker.onAttack === 'function') {
            attacker.onAttack();
        }
        damage = Math.max(1, attacker.attackPower - defender.defence);
        defenderDied = defender.takeDamage(damage);
    }

    return { hit, damage, defenderDied };
}

export class CombatSession {
    constructor(a, b) {
        this.a = a;
        this.b = b;
        this.turn = 0;
        this.active = true;
    }

    step() {
        if (!this.active) return null;

        const attacker = this.turn === 0 ? this.a : this.b;
        const defender = this.turn === 0 ? this.b : this.a;

        let { hit, damage, defenderDied } = resolveAttack(attacker, defender); // attacker, defender 

        this.turn = 1 - this.turn;
        if (defenderDied) {
            this.active = false;
            return { winner: this.a, loser: this.b, by: 'A -> B', hit, damage };
        }

        return null;
    }
}

export class CombatManager {
    constructor() {
        /** @type {CombatSession[]} */
        this.sessions = [];
    }

    engage(a, b) {
        // Do not engage pair already in comabt
        if (this.sessions.some(s =>
        (s.a === a && s.b == b) || (s.a === b && s.b === a)
        )) return;
        this.sessions.push(new CombatSession(a, b));
    }

    update() {
        for (let i = this.sessions.length - 1; i >= 0; i--) {
            const session = this.sessions[i];
            if (!session) {
                console.warn('Combat Error: attempted to reference not-existant combat session');
                return;
            }
            const result = session.step();
            if (result) {
                //this.sessions.splice(i, 1); // Should we be still splicing this?
                this.disengage(result.winner);
                this.disengage(result.loser);
            }
        }
    }

    disengage(combatant) {
        this.sessions = this.sessions.filter(s =>
            s.a !== combatant && s.b !== combatant
        );
    }
}