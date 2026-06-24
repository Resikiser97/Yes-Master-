/**
 * @file        saveManager.js
 * @module      storage（IO 層）
 * @summary     world 狀態序列化/反序列化 + 存檔進入點（封裝 saveLocal）
 * @exports     saveWorld, loadWorld
 * @depends     config/gameConfig.js、src/storage/saveLocal.js、src/game/world.js、src/game/coreSnapshot.js
 * @sourceOfTruth Docs/game-architecture-plan.md「Save File 資料結構」
 * @version     v0.0.5.0
 *
 * 只在 phase=prep 時呼叫 saveWorld（wave clear 後）。
 * 存檔不包含：enemies / pendingSpawns / mining / repair / combat / camera / clock（皆為暫態或可重算）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { loadSave, writeSave } from './saveLocal.js';
import { createWorld, focusCamera } from '../game/world.js';
import { refreshCoreSnapshot } from '../game/coreSnapshot.js';

function serializeWorld(world) {
  return {
    stage: world.stage,
    storage: { ...world.storage },
    dirt: [...world.dirt],
    fore: [...world.fore],
    player: {
      x: world.player.x,
      y: world.player.y,
      inventory: { ...world.player.inventory },
      fatigue: world.player.fatigue,
    },
    coreHp: world.coreHp,
    cardBonuses: { ...world.cardBonuses },
    cardModifiers: [...world.cardModifiers],
    mines: {
      A: { columns: world.mines.A.mine.columns.map(col => [...col]) },
      B: { columns: world.mines.B.mine.columns.map(col => [...col]) },
    },
  };
}

function deserializeWorld(data, cfg = GAME_CONFIG) {
  // 建立含所有基礎設施的乾淨 world（初始資源包會被下方 storage 覆蓋）
  const world = createWorld(cfg);

  world.stage = data.stage ?? 0;
  world.storage = { ...(data.storage ?? {}) };
  world.dirt = new Set(data.dirt ?? []);
  world.fore = new Map(data.fore ?? []);

  const sp = data.player ?? {};
  world.player.x = sp.x ?? world.player.x;
  world.player.y = sp.y ?? world.player.y;
  world.player.prevX = world.player.x;
  world.player.prevY = world.player.y;
  world.player.renderX = world.player.x;
  world.player.renderY = world.player.y;
  world.player.inventory = { ...(sp.inventory ?? {}) };
  world.player.fatigue = sp.fatigue ?? world.player.fatigue;

  world.coreHp = data.coreHp ?? null;
  world.cardBonuses = { ...(data.cardBonuses ?? {}) };
  world.cardModifiers = [...(data.cardModifiers ?? [])];

  if (data.mines?.A?.columns) {
    world.mines.A.mine.columns = data.mines.A.columns.map(col => [...col]);
  }
  if (data.mines?.B?.columns) {
    world.mines.B.mine.columns = data.mines.B.columns.map(col => [...col]);
  }

  refreshCoreSnapshot(world);
  focusCamera(world, world.player);
  return world;
}

// 儲存 world（只在 phase=prep 時由 main.js 呼叫）
export function saveWorld(world) {
  writeSave(serializeWorld(world));
}

// 讀取存檔並回傳 world；無存檔或資料損毀 → null
export function loadWorld(cfg = GAME_CONFIG) {
  const result = loadSave();
  if (!result.ok) return null;
  try {
    return deserializeWorld(result.data, cfg);
  } catch {
    return null;
  }
}
