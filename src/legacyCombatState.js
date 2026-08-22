/**
 * Clears state owned by the removed automatic/tick-based combat loop.
 * The combat data objects remain available for the upcoming click/RNG system.
 */
export function clearLegacyCombatState(combatManager, entities = []) {
  if (Array.isArray(combatManager?.sessions)) {
    combatManager.sessions.length = 0;
  }

  for (const entity of entities) {
    if (entity?.kind !== "Enemy") continue;
    entity.inCombat = false;
    entity.combatTarget = null;
    if (entity._isDying || entity.readyToRemove) continue;
    entity.path = [];
    entity._targetWorldPos = null;
    if (Number.isFinite(entity.idleSpeed)) entity.moveSpeed = entity.idleSpeed;
    entity._setAction?.("idle");
  }
}
