/**
 * @file        stateSync.js
 * @module      net
 * @summary     多人狀態序列化與同步：serializeSnapshot（全量）/ serializeDelta（差量）/ applySnapshot / applyDelta；供 syncScheduler 呼叫
 * @exports     serializeSnapshot, serializeDelta, applySnapshot, applyDelta
 * @depends     game/world.js, game/coreSnapshot.js
 * @sourceOfTruth Docs/game-architecture-plan.md「Multiplayer 架構 → State Sync」
 * @version     v0.0.20.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { createWorld, attachPlayerAlias, ensurePlayer, createPlayerState } from '../game/world.js';
import { refreshCoreSnapshot } from '../game/coreSnapshot.js';

export function serializeSnapshot(world) {
  return {
    schema: 1,
    syncTick: world.syncTick ?? 0,
    localPlayerId: world.localPlayerId,
    players: [...(world.players ?? new Map()).entries()].map(([id, p]) => [id, serializePlayer(p)]),
    storage: { ...(world.storage ?? {}) },
    blockCounts: { ...(world.blockCounts ?? {}) },
    dirt: [...(world.dirt ?? new Set())],
    fore: [...(world.fore ?? new Map())],
    mines: {
      A: { columns: world.mines?.A?.mine?.columns?.map(col => [...col]) ?? [] },
      B: { columns: world.mines?.B?.mine?.columns?.map(col => [...col]) ?? [] },
    },
    drops: (world.drops ?? []).map(d => ({ ...d })),
    enemies: (world.enemies ?? []).map(e => ({ ...e })),
    phase: world.phase,
    phaseTimer: world.phaseTimer,
    nightElapsed: world.nightElapsed,
    pendingSpawns: (world.pendingSpawns ?? []).map(batch => ({
      ...batch,
      defs: (batch.defs ?? []).map(def => ({ ...def })),
    })),
    stage: world.stage,
    coreHp: world.coreHp,
    coreStats: world.coreStats ? { ...world.coreStats } : null,
    combat: {
      attackCooldown: world.combat?.attackCooldown ?? 0,
      lastHits: (world.combat?.lastHits ?? []).map(h => ({ ...h })),
      lastHitTimer: world.combat?.lastHitTimer ?? 0,
      nextEnemyId: world.combat?.nextEnemyId ?? 0,
      overtimeMultiplier: world.combat?.overtimeMultiplier ?? 1,
    },
    cardBonuses: { ...(world.cardBonuses ?? {}) },
    cardModifiers: (world.cardModifiers ?? []).map(m => ({ ...m })),
    pendingCardOffer: world.pendingCardOffer ? world.pendingCardOffer.map(c => ({ ...c, effect: { ...(c.effect ?? {}) } })) : null,
    mineProgress: { ...(world.mineProgress ?? {}) },
    clock: { ...(world.clock ?? {}) },
    vfx: {
      timer: world.vfx?.timer ?? 0,
      bolts: (world.vfx?.bolts ?? []).map(b => ({
        chainIdx: b.chainIdx,
        points: (b.points ?? []).map(p => ({ x: p.x, y: p.y })),
      })),
    },
  };
}

export function serializeDelta(prevSnapshot, world) {
  const snapshot = serializeSnapshot(world);
  return {
    schema: 1,
    syncTick: snapshot.syncTick,
    players: snapshot.players,
    enemies: snapshot.enemies,
    drops: snapshot.drops,
    storage: snapshot.storage,
    dirt: snapshot.dirt,
    fore: snapshot.fore,
    phase: snapshot.phase,
    phaseTimer: snapshot.phaseTimer,
    nightElapsed: snapshot.nightElapsed,
    pendingSpawns: snapshot.pendingSpawns,
    stage: snapshot.stage,
    coreHp: snapshot.coreHp,
    coreStats: snapshot.coreStats,
    combat: snapshot.combat,
    pendingCardOffer: snapshot.pendingCardOffer,
    clock: snapshot.clock,
    vfx: snapshot.vfx,
  };
}

export function applySnapshot(world, snapshot, cfg = GAME_CONFIG) {
  const target = world ?? createWorld(cfg);
  applyFullState(target, snapshot, cfg);
  return target;
}

export function applyDelta(world, delta, cfg = GAME_CONFIG) {
  if (!world) return applySnapshot(null, delta, cfg);
  if ((delta.syncTick ?? 0) < (world.syncTick ?? 0)) return world;
  applyPartialState(world, delta, cfg);
  return world;
}

function applyFullState(world, snapshot, cfg) {
  applyPartialState(world, snapshot, cfg);
  if (snapshot.mines?.A?.columns) world.mines.A.mine.columns = snapshot.mines.A.columns.map(col => [...col]);
  if (snapshot.mines?.B?.columns) world.mines.B.mine.columns = snapshot.mines.B.columns.map(col => [...col]);
  world.cardBonuses = { ...(snapshot.cardBonuses ?? {}) };
  world.cardModifiers = (snapshot.cardModifiers ?? []).map(m => ({ ...m }));
  world.mineProgress = { ...(snapshot.mineProgress ?? {}) };
  refreshCoreSnapshot(world);
}

function applyPartialState(world, state, cfg) {
  world.syncTick = state.syncTick ?? world.syncTick ?? 0;
  const previousLocal = world.localPlayerId;
  if (state.players) {
    world.players = new Map();
    for (const [id, player] of state.players) {
      world.players.set(id, deserializePlayer(id, player, cfg));
    }
    world.localPlayerId = previousLocal
      || state.localPlayerId
      || world.players.keys().next().value;
    ensurePlayer(world, world.localPlayerId, cfg);
    attachPlayerAlias(world);
  }
  if (state.storage) world.storage = { ...state.storage };
  if (state.blockCounts) world.blockCounts = { ...state.blockCounts };
  if (state.dirt) world.dirt = new Set(state.dirt);
  if (state.fore) world.fore = new Map(state.fore);
  if (state.drops) world.drops = state.drops.map(d => ({ ...d }));
  if (state.enemies) world.enemies = state.enemies.map(e => ({ ...e }));
  if (state.phase != null) world.phase = state.phase;
  if (state.phaseTimer != null) world.phaseTimer = state.phaseTimer;
  if (state.nightElapsed != null) world.nightElapsed = state.nightElapsed;
  if (state.pendingSpawns) {
    world.pendingSpawns = state.pendingSpawns.map(batch => ({
      ...batch,
      defs: (batch.defs ?? []).map(def => ({ ...def })),
    }));
  }
  if (state.stage != null) world.stage = state.stage;
  if (state.coreHp != null) world.coreHp = state.coreHp;
  if (state.coreStats) world.coreStats = { ...state.coreStats };
  if (state.combat) {
    world.combat = {
      ...world.combat,
      ...state.combat,
      lastHits: (state.combat.lastHits ?? []).map(h => ({ ...h })),
    };
  }
  if ('pendingCardOffer' in state) {
    world.pendingCardOffer = state.pendingCardOffer ? state.pendingCardOffer.map(c => ({ ...c })) : null;
  }
  if (state.clock) world.clock = { ...world.clock, ...state.clock };
  if (state.vfx) {
    world.vfx = {
      timer: state.vfx.timer ?? 0,
      bolts: (state.vfx.bolts ?? []).map(b => ({
        chainIdx: b.chainIdx,
        points: (b.points ?? []).map(p => ({ x: p.x, y: p.y })),
      })),
    };
  }
}

function serializePlayer(player) {
  return {
    id: player.id,
    x: player.x,
    y: player.y,
    prevX: player.prevX,
    prevY: player.prevY,
    renderX: player.renderX,
    renderY: player.renderY,
    moveSpeed: player.moveSpeed,
    inventory: { ...(player.inventory ?? {}) },
    capacity: player.capacity,
    slots: player.slots,
    fatigue: player.fatigue,
    online: player.online !== false,
    intent: player.intent ?? null,
    intentAt: player.intentAt ?? 0,
    intentManual: player.intentManual ?? false,
  };
}

function deserializePlayer(id, player, cfg) {
  return {
    ...createPlayerState(id, cfg),
    ...player,
    id,
    inventory: { ...(player.inventory ?? {}) },
  };
}
