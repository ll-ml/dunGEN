const CARDINAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Finds the closest walkable grid cell using a cardinal breadth-first search.
 * The returned value is deliberately a plain coordinate so this helper stays
 * independent of rendering and entity types.
 */
export function findNearestWalkable(map, startX, startY) {
  if (!map || typeof map.isWalkableAt !== "function") return null;

  const width = Math.floor(map.width ?? 0);
  const height = Math.floor(map.height ?? 0);
  if (width <= 0 || height <= 0) return null;

  const x = Math.min(width - 1, Math.max(0, Math.floor(startX)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(startY)));
  const visited = new Uint8Array(width * height);
  const queue = [[x, y]];
  visited[y * width + x] = 1;

  for (let index = 0; index < queue.length; index++) {
    const [currentX, currentY] = queue[index];
    if (map.isWalkableAt(currentX, currentY)) {
      return { x: currentX, y: currentY };
    }

    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;

      const key = nextY * width + nextX;
      if (visited[key]) continue;
      visited[key] = 1;
      queue.push([nextX, nextY]);
    }
  }

  return null;
}
