const TileId = Object.freeze({
    WATER: "WATER",
    SAND: "SAND",
    GRASS: "GRASS",
    DENSE_GRASS: "DENSE_GRASS",
    FOREST: "FOREST",
});


const TILE_DEFS = Object.freeze({
    [TileId.WATER]: {
        glyph: "~",
        baseWeight: 10,
        allowed: new Set([TileId.WATER, TileId.SAND]),
    },
    [TileId.SAND]: {
        glyph: ",",
        baseWeight: 5,
        allowed: new Set([TileId.WATER, TileId.SAND, TileId.GRASS]),
    },
    [TileId.GRASS]: {
        glyph: ".",
        baseWeight: 50,
        allowed: new Set([TileId.SAND, TileId.GRASS, TileId.DENSE_GRASS]),
    },
    [TileId.DENSE_GRASS]: {
        glyph: "\"",
        baseWeight: 25, 
        allowed: new Set([TileId.GRASS, TileId.DENSE_GRASS, TileId.FOREST])
    },
    [TileId.FOREST]: {
        glyph: "T",
        baseWeight: 20, 
        allowed: new Set([TileId.DENSE_GRASS, TileId.FOREST]),
    },
});


const TILE_ORDER = [TileId.WATER, TileId.SAND, TileId.GRASS, TileId.DENSE_GRASS, TileId.FOREST];
export const TILE_INDEX = Object.fromEntries(TILE_ORDER.map((id, i) => [id, i]));
const ALL_MASK = (1 << TILE_ORDER.length) - 1;



const POPCOUNT = new Uint8Array(32);
for (let m = 0; m < 32; m++) {
    let x = m, c = 0; 
    while (x) { x &= (x - 1); c++ }
    POPCOUNT[m] = c;
}

function bitCount(mask) {
    return POPCOUNT[mask];
}

function maskToOptions(mask) {
    const opts = [];
    for (let i = 0; i < TILE_ORDER.length; i++) {
        if (mask & (1 << i)) opts.push(TILE_ORDER[i]);
    }

    return opts;
}

function pickWeightedFromMask(mask, weights, rng) {
  let total = 0;

  for (let i = 0; i < TILE_ORDER.length; i++) {
    if (mask & (1 << i)) total += (weights[TILE_ORDER[i]] ?? 1);
  }

  let r = rng() * total;
  for (let i = 0; i < TILE_ORDER.length; i++) {
    if (!(mask & (1 << i))) continue;
    r -= (weights[TILE_ORDER[i]] ?? 1);
    if (r <= 0) return TILE_ORDER[i];
  }

  for (let i = TILE_ORDER.length - 1; i >= 0; i--) {
    if (mask & (1 << i)) return TILE_ORDER[i];
  }
  return TILE_ORDER[0];
}

function pickWeighted(options, weights, rng = Math.random) {
    let total = 0;
    for (const id of options) total += weights[id] ?? 1;
    let r = rng() * total;
    for (const id of options) {
        r -= (weights[id] ?? 1);
        if (r <= 0) return id;
    }

    return options[options.length - 1];
}


function allowedMaskFor(tileId) {
    const allowed = TILE_DEFS[tileId].allowed;
    let mask = 0;
    for (const id of allowed) mask |= (1 << TILE_INDEX[id]);

    return mask;
}

const ALLOWED_MASK = Object.fromEntries(TILE_ORDER.map(id => [id, allowedMaskFor(id)]));

function inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && x < w && y < h;
}

export function generateOverworldWFC(width = 200, height = 200, {
    weights = null, 
    borderWater = 1,
    forestSeeds = 20, 
    maxRestarts = 50, 
    rng = Math.random,
} = {}) {
    const runWeights = weights ?? {
        [TileId.WATER]: 20, 
        [TileId.SAND]: 20, 
        [TileId.GRASS]: 70, 
        [TileId.DENSE_GRASS]: 45, 
        [TileId.FOREST]: 45,
    };


    for (let attempt = 0; attempt < maxRestarts; attempt++) {
        const possible = Array.from({ length: height }, () => new Uint32Array(width).fill(ALL_MASK));
        const collapsed = Array.from({ length: height }, () => new Array(width).fill(null));

        const queue = [];

        function setCell(x, y, tileID) {
            const m = (1 << TILE_INDEX[tileID]);
            possible[y][x] = m;
            collapsed[y][x] = tileID;
            queue.push([x, y]);
        }

        // this will seed border water
        if (borderWater > 0) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const onBorder = 
                        x < borderWater || y < borderWater ||
                        x >= width - borderWater || y >= height - borderWater;
                    if (onBorder) setCell(x, y, TileId.WATER);
                }
            }
        }

        // this will seed forest patches (interior)
        for (let i = 0; i < forestSeeds; i++) {
            const x = Math.floor(rng() * (width - 2 * borderWater)) + borderWater;
            const y = Math.floor(rng() * (height - 2 * borderWater)) + borderWater;
            setCell(x, y, TileId.FOREST);
        }

        function propagate() {
            while (queue.length) {
                const [x, y] = queue.pop();
                const cellMask = possible[y][x];

                // if cellmask has multiple options, neighbors must be compatible with at least one 
                // after this we must compute the union of allowed neighbor mask over all options in this given cell
                let neighborAllowedUnion = 0;
                for (let i = 0; i < TILE_ORDER.length; i++) {
                    if (cellMask & (1 << i)) {
                        const id = TILE_ORDER[i];
                        neighborAllowedUnion |= ALLOWED_MASK[id];
                    }
                }

                const neighbors = [
                    [x + 1, y],
                    [x - 1, y],
                    [x, y + 1],
                    [x, y - 1],
                ];

                for (const [nx, ny] of neighbors) {
                    if (!inBounds(nx, ny, width, height))continue;

                    const before = possible[ny][nx];
                    const after = before & neighborAllowedUnion;

                    if (after === 0) return false; // this is a contradiction
                    if (after !== before) {
                        possible[ny][nx] = after;
                        if (collapsed[ny][nx] == null && bitCount(after) === 1) {
                            const idx = Math.floor(Math.log2(after));
                            collapsed[ny][nx] = TILE_ORDER[idx];
                        }
                        queue.push([nx, ny]);
                    }
                }
            }
            return true;
        }

        if (!propagate()) continue; // simply restart attempt on error
        
        while (true) {
            let bestX = -1, bestY = -1, bestEntropy = Infinity;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (collapsed[y][x] != null) continue;
                    const c = bitCount(possible[y][x]);
                    if (c > 1 && c < bestEntropy) {
                        bestEntropy = c;
                        bestX = x; bestY = y;
                        if (c === 2) break;
                    }
                }
            }

            if (bestX === -1) break;

            const chosen = pickWeightedFromMask(possible[bestY][bestX], runWeights, rng);
            setCell(bestX, bestY, chosen);

            if (!propagate()) {
                bestX = -1;
                break;
            }
        }

        if (queue.length !== 0) continue;

        const out = Array.from({ length: height }, () => new Array(width));
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const id = collapsed[y][x] ?? maskToOptions(possible[y][x])[0];
                out[y][x] = TILE_DEFS[id].glyph;
            }
        }

        return out;
    }

    throw new Error("WFC: exceeded maxRestarts without finding a valid overworld");
}
