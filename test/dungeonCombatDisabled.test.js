import test from "node:test";
import assert from "node:assert/strict";
import { Dungeon } from "../src/dungeon.js";

test("dungeon ticks cannot advance automatic combat", () => {
  const dungeon = new Dungeon(3, 3);
  let idleCalls = 0;
  const enemy = {
    kind: "Enemy",
    inCombat: true,
    combatTarget: {},
    path: [{ x: 1, y: 1 }],
    _targetWorldPos: {},
    idleSpeed: 3,
    moveSpeed: 8,
    _setAction(name) {
      if (name === "idle") idleCalls++;
    },
  };
  dungeon.entities = [enemy];

  const player = {
    combat: { hp: 30 },
    skills: { updateUI() {} },
  };
  const combatManager = {
    sessions: [{ active: true }],
  };
  let displayedHealth = null;

  dungeon.updateTick({
    player,
    combatMgr: combatManager,
    currentMapGroup: { remove() {} },
    ui: { setHealth: (hp) => { displayedHealth = hp; } },
  });

  assert.equal(player.combat.hp, 30);
  assert.equal(combatManager.sessions.length, 0);
  assert.equal(enemy.inCombat, false);
  assert.equal(enemy.combatTarget, null);
  assert.deepEqual(enemy.path, []);
  assert.equal(idleCalls, 1);
  assert.equal(displayedHealth, 30);
});
