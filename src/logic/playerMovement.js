/**
 * @file        playerMovement.js
 * @module      logic（pure）
 * @summary     玩家移動能力值換算與固定 timestep 位移
 * @exports     moveSpeedToTilesPerSecond, normalizeMoveInput, movePlayer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「哥布林角色數值」「操作輸入方式」
 * @version     v0.0.6.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

export function moveSpeedToTilesPerSecond(moveSpeed, cfg = GAME_CONFIG) {
  return moveSpeed / cfg.player.moveSpeedPerTilePerSecond;
}

export function normalizeMoveInput(input) {
  const x = Math.sign(input?.x ?? 0);
  const y = Math.sign(input?.y ?? 0);
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

export function movePlayer(player, input, dt, bounds, cfg = GAME_CONFIG) {
  const dir = normalizeMoveInput(input);
  const speed = moveSpeedToTilesPerSecond(player.moveSpeed ?? cfg.player.moveSpeed, cfg);
  return {
    ...player,
    x: clamp(player.x + dir.x * speed * dt, bounds.minX, bounds.maxX),
    y: clamp(player.y + dir.y * speed * dt, bounds.minY, bounds.maxY),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
