import test from "node:test";
import assert from "node:assert/strict";
import { clearLegacyCombatState } from "../src/legacyCombatState.js";

test("clears automatic combat sessions and restores enemies to idle", () => {
  const combatManager = { sessions: [{ active: true }] };
  let idleCalls = 0;
  const enemy = {
    kind: "Enemy",
    inCombat: true,
    combatTarget: {},
    path: [{ x: 1, y: 1 }],
    _targetWorldPos: {},
    idleSpeed: 4,
    moveSpeed: 12,
    _setAction(name) {
      if (name === "idle") idleCalls++;
    },
  };

  clearLegacyCombatState(combatManager, [enemy, { kind: "NPC" }]);

  assert.equal(combatManager.sessions.length, 0);
  assert.equal(enemy.inCombat, false);
  assert.equal(enemy.combatTarget, null);
  assert.deepEqual(enemy.path, []);
  assert.equal(enemy._targetWorldPos, null);
  assert.equal(enemy.moveSpeed, enemy.idleSpeed);
  assert.equal(idleCalls, 1);
});

test("does not interrupt an enemy death animation", () => {
  let actionCalls = 0;
  const dyingEnemy = {
    kind: "Enemy",
    inCombat: true,
    combatTarget: {},
    _isDying: true,
    path: [{ x: 1, y: 1 }],
    _targetWorldPos: {},
    _setAction() {
      actionCalls++;
    },
  };

  clearLegacyCombatState({ sessions: [{}] }, [dyingEnemy]);

  assert.equal(dyingEnemy.inCombat, false);
  assert.equal(dyingEnemy.combatTarget, null);
  assert.deepEqual(dyingEnemy.path, [{ x: 1, y: 1 }]);
  assert.equal(actionCalls, 0);
});
