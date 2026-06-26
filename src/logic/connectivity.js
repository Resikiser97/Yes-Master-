/**
 * @file        connectivity.js
 * @module      logic（pure）
 * @summary     背景泥土地基的連通性判定（BFS）與放置/拆除合法性（純函式）
 * @exports     key, computeConnected, canPlaceDirt, canRemoveDirt
 * @depends     （無）
 * @sourceOfTruth Docs/game-architecture-plan.md「核心地基系統」
 * @version     v0.0.14.1
 *
 * 連通性只在「背景泥土平面」判定：4 方向相鄰（X 左右 + Y 上下，不含斜角），不穿透深度。
 * 泥土格表示為 Set<"x,y"> 字串；核心格為 [[x,y], ...]（2x2 共 4 格）。
 */

export const key = (x, y) => `${x},${y}`;

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 回傳「與核心連通」的泥土格集合（Set<"x,y">）
export function computeConnected(dirtCells, coreCells) {
  const connected = new Set();
  const queue = [];

  // 起點：與任一核心格 4 方向相鄰、且本身是泥土的格
  const coreSet = new Set(coreCells.map(([x, y]) => key(x, y)));
  for (const [cx, cy] of coreCells) {
    for (const [dx, dy] of NEIGHBORS) {
      const k = key(cx + dx, cy + dy);
      if (dirtCells.has(k) && !coreSet.has(k) && !connected.has(k)) {
        connected.add(k);
        queue.push([cx + dx, cy + dy]);
      }
    }
  }

  // BFS 沿泥土格擴展
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      const k = key(nx, ny);
      if (dirtCells.has(k) && !connected.has(k)) {
        connected.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  return connected;
}

// 放置泥土：放下後該格必須與核心連通才允許
export function canPlaceDirt(dirtCells, coreCells, x, y) {
  if (dirtCells.has(key(x, y))) return false; // 已有泥土
  const next = new Set(dirtCells);
  next.add(key(x, y));
  return computeConnected(next, coreCells).has(key(x, y));
}

// 拆除泥土：拆掉後不得讓任何「原本連通」的泥土格變孤立
export function canRemoveDirt(dirtCells, coreCells, x, y) {
  const k = key(x, y);
  if (!dirtCells.has(k)) return false;
  const before = computeConnected(dirtCells, coreCells);
  if (!before.has(k)) return true; // 拆一個本來就孤立的格子，無影響

  const next = new Set(dirtCells);
  next.delete(k);
  const after = computeConnected(next, coreCells);

  for (const cell of before) {
    if (cell !== k && !after.has(cell)) return false; // 有原本連通的格變孤立
  }
  return true;
}

