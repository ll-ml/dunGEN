import { OverworldEntity } from "../overworldEntity.js";

/*
Wiring note:
- After overworld denseMatrix is generated, call placeStructure on chosen anchors.
- Track claimed cells via makeOccupancy() and gate movement by checking occupancy in isWalkableAt.

Example:
const occupancy = makeOccupancy();
const anchor = pickWeightedAnchor(findAnchorCandidates(overworld, blueprint, { rng, occupancy }), rng);
if (anchor) placeStructure(overworld, blueprint, anchor, { occupancy });
*/

const DEFAULT_MAX_TRIES = 200;

const keyFrom = (x, y) => `${x},${y}`;

export function makeOccupancy() {
  return new Set();
}

export function isOccupied(occupancy, x, y) {
  return occupancy?.has(keyFrom(x, y)) ?? false;
}

export function claimCells(occupancy, cells) {
  if (!occupancy) return;
  for (const cell of cells) occupancy.add(keyFrom(cell.x, cell.y));
}

export function transformPoint(pt, { rotation = 0, mirrorX = false, mirrorY = false } = {}) {
  let x = pt.x;
  let y = pt.y;

  if (mirrorX) x = -x;
  if (mirrorY) y = -y;

  const rot = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < rot; i++) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }

  return { x, y };
}

function addAnchor(anchor, local) {
  return { x: anchor.x + local.x, y: anchor.y + local.y };
}

function inBounds(overworld, x, y) {
  return x >= 0 && y >= 0 && x < overworld.width && y < overworld.height;
}

function getFootprint(blueprint) {
  if (blueprint.footprint?.length) return blueprint.footprint;
  if (blueprint.props?.length) {
    return blueprint.props.map((p) => ({ x: p.x, y: p.y }));
  }
  return [];
}

export function scoreAnchor(glyphGrid, anchor, placement = null) {
  if (!placement) return 1;

  const radius = placement.radius ?? 6;
  const prefers = placement.prefers ?? [];
  const avoids = placement.avoids ?? [];

  const weights = new Map();
  for (const p of prefers) weights.set(p.glyph, (weights.get(p.glyph) ?? 0) + p.weight);
  for (const a of avoids) weights.set(a.glyph, (weights.get(a.glyph) ?? 0) - a.weight);

  const maxY = glyphGrid.length - 1;
  const maxX = glyphGrid[0]?.length ? glyphGrid[0].length - 1 : -1;

  let score = 1;
  const r2 = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dd = dx * dx + dy * dy;
      if (dd > r2) continue;

      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (x < 0 || y < 0 || x > maxX || y > maxY) continue;

      const glyph = glyphGrid[y][x];
      const w = weights.get(glyph);
      if (w) score += w;
    }
  }

  return Math.max(0.1, score);
}

export function canPlaceStructure(overworld, blueprint, anchor, transform = {}) {
  const footprint = getFootprint(blueprint);
  const occupancy = transform.occupancy ?? null;
  const localTransform = transform.transform ?? transform;

  for (const cell of footprint) {
    const local = transformPoint(cell, localTransform);
    const world = addAnchor(anchor, local);

    if (!inBounds(overworld, world.x, world.y)) return false;
    if (occupancy && isOccupied(occupancy, world.x, world.y)) return false;
    if (typeof overworld.isWalkableAt === "function" && !overworld.isWalkableAt(world.x, world.y)) {
      return false;
    }
  }

  return true;
}

export function findAnchorCandidates(overworld, blueprint, {
  rng = Math.random,
  tries = DEFAULT_MAX_TRIES,
  occupancy = null,
  transform = {},
} = {}) {
  const out = [];

  for (let i = 0; i < tries; i++) {
    const x = Math.floor(rng() * overworld.width);
    const y = Math.floor(rng() * overworld.height);
    const anchor = { x, y };

    if (!canPlaceStructure(overworld, blueprint, anchor, { occupancy, transform })) continue;

    const score = scoreAnchor(overworld.denseMatrix, anchor, blueprint.placement);
    out.push({ anchor, score });
  }

  return out;
}

export function pickWeightedAnchor(candidates, rng = Math.random) {
  if (!candidates.length) return null;

  let total = 0;
  for (const c of candidates) total += c.score;

  let r = rng() * total;
  for (const c of candidates) {
    r -= c.score;
    if (r <= 0) return c.anchor;
  }

  return candidates[candidates.length - 1].anchor;
}

export function placeStructure(overworld, blueprint, anchor, {
  rotation = 0,
  mirrorX = false,
  mirrorY = false,
  occupancy = null,
  applyTiles = true,
  spawnProps = true,
  validate = true,
} = {}) {
  const transform = { rotation, mirrorX, mirrorY };

  if (validate && !canPlaceStructure(overworld, blueprint, anchor, { occupancy, transform })) {
    return { ok: false, reason: "blocked" };
  }

  const claimed = [];
  const footprint = getFootprint(blueprint);
  for (const cell of footprint) {
    const local = transformPoint(cell, transform);
    const world = addAnchor(anchor, local);
    claimed.push(world);
  }

  if (applyTiles && blueprint.tiles?.length) {
    for (const tile of blueprint.tiles) {
      const local = transformPoint(tile, transform);
      const world = addAnchor(anchor, local);
      if (!inBounds(overworld, world.x, world.y)) continue;
      overworld.denseMatrix[world.y][world.x] = tile.glyph;
    }
  }

  const props = [];
  if (spawnProps && blueprint.props?.length) {
    for (const prop of blueprint.props) {
      const local = transformPoint(prop, transform);
      const world = addAnchor(anchor, local);

      const ent = new OverworldEntity(prop.modelPath, world.x, world.y, {
        scale: prop.scale,
        height: prop.height,
        colormap: prop.colormap ?? null,
        kind: prop.kind ?? "StructureProp",
        id: prop.id ?? blueprint.id,
      });

      overworld.entities.push(ent);
      props.push(ent);
    }
  }

  claimCells(occupancy, claimed);

  return { ok: true, anchor, props, claimed };
}
