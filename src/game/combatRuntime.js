/**
 * @file        combatRuntime.js
 * @module      game（狀態/orchestration 層，非渲染）
 * @summary     敵人生成（debug）、追核心/攻核心、核心普攻/連鎖/站位加成執行，結果寫入 world
 * @exports     spawnDebugEnemies, updateEnemies, coreAttackAnchors, updateCoreCombat
 * @depends     config/enemies.js、config/gameConfig.js、src/logic/combat.js、src/logic/connectivity.js
 * @sourceOfTruth Docs/game-design-plan.md「核心攻擊與防禦機制」
 * @version     v0.0.15.0
 */

import { ENEMIES } from '../../config/enemies.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { computeHit, selectPrimaryTarget, chainHitCount, selectChainTargets, dist2 } from '../logic/combat.js';
import { computeConnected, isOnFoundation } from '../logic/connectivity.js';
import { damageCoreHp } from '../logic/coreHealth.js';

function nextEnemyId(world, enemyKey) {
  world.combat.nextEnemyId += 1;
  return `debug-${enemyKey}-${world.combat.nextEnemyId}`;
}

function createEnemy(world, enemyKey, x, y) {
  const def = ENEMIES[enemyKey];
  return {
    id: nextEnemyId(world, enemyKey),
    key: enemyKey,
    zh: def.zh,
    x, y,
    hp: def.hp,
    hpMax: def.hp,
    attack: def.attack,
    defense: def.defense,
    moveSpeed: def.moveSpeed,
    attackRange: def.attackRange,
    attackCooldown: 0,
  };
}

export function spawnDebugEnemies(world, count = 1, enemyKey = 'civilian', cfg = GAME_CONFIG) {
  const spawnDistance = cfg.debug?.enemySpawnDistanceTiles ?? 8;
  const anchor = world.player ?? world.coreCenter;
  const row = Math.max(0, Math.min(world.groundY - 1, Math.round(anchor.y)));
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const offset = spawnDistance + Math.floor(i / 2);
    const x = Math.max(0, Math.min(world.cols - 1, anchor.x + side * offset));
    world.enemies.push(createEnemy(world, enemyKey, x, row));
  }
  return { ok: true, count };
}

export function updateEnemies(world, dt) {
  if (world.phase === 'gameover') return;

  for (const enemy of world.enemies) {
    const target = nearestCoreCell(world, enemy);
    if (!target) continue;

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.hypot(dx, dy);
    const range = enemy.attackRange ?? 1;

    if (d <= range) {
      enemy.isAttacking = true;
      enemy.attackCooldown = (enemy.attackCooldown ?? 0) - dt;
      if (enemy.attackCooldown <= 0) {
        const amount = (enemy.attack ?? 0) * (world.combat?.overtimeMultiplier ?? 1);
        _applyCoreDamage(world, amount);
        enemy.attackCooldown = 2;
      }
      continue;
    }

    enemy.isAttacking = false;
    if (d < 0.001) continue;
    const step = Math.min(enemy.moveSpeed * dt, d);
    enemy.x += (dx / d) * step;
    enemy.y += (dy / d) * step;
  }
}

function nearestCoreCell(world, enemy) {
  let best = null;
  let bestD2 = Infinity;
  for (const [x, y] of world.core ?? []) {
    const d2 = dist2(enemy, { x, y });
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { x, y };
    }
  }
  return best;
}

function _applyCoreDamage(world, amount) {
  const current = world.coreHp ?? world.coreStats?.hpMax ?? 0;
  world.coreHp = damageCoreHp(current, amount);
  if (world.coreHp <= 0) world.phase = 'gameover';
}

export function coreAttackAnchors(world) {
  const anchors = world.core.map(([x, y]) => ({ x, y }));
  for (const cell of computeConnected(world.dirt, world.core)) {
    const [x, y] = cell.split(',').map(Number);
    anchors.push({ x, y });
  }
  return anchors;
}

function inCoreRange(enemy, anchors, rangeTiles) {
  const r2 = rangeTiles * rangeTiles;
  return anchors.some((a) => dist2(enemy, a) <= r2);
}

function pruneDeadEnemies(world) {
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
}

function _anyPlayerOnFoundation(world) {
  for (const [, p] of world.players ?? []) {
    const px = Math.round(p.x), py = Math.round(p.y);
    if (isOnFoundation(world, px, py)) return true;
  }
  if (world.player) {
    const px = Math.round(world.player.x), py = Math.round(world.player.y);
    return isOnFoundation(world, px, py);
  }
  return false;
}

export function updateCoreCombat(world, dt, cfg = GAME_CONFIG) {
  if (world.combat.lastHitTimer > 0) {
    world.combat.lastHitTimer = Math.max(0, world.combat.lastHitTimer - dt);
    if (world.combat.lastHitTimer === 0) world.combat.lastHits = [];
  }
  if (world.vfx?.timer > 0) {
    world.vfx.timer = Math.max(0, world.vfx.timer - dt);
    if (world.vfx.timer === 0) world.vfx.bolts = [];
  }
  if (!world.enemies.length || world.phase === 'gameover') return world.combat;

  world.combat.attackCooldown = Math.max(0, world.combat.attackCooldown - dt);
  if (world.combat.attackCooldown > 0) return world.combat;

  const stats = world.coreStats;
  const rangeTiles = stats.range / cfg.map.pxPerTile;
  const anchors = coreAttackAnchors(world);
  const enemiesInRange = world.enemies.filter((enemy) => inCoreRange(enemy, anchors, rangeTiles));
  const primary = selectPrimaryTarget(enemiesInRange, world.coreCenter);
  if (!primary) return world.combat;

  const effectiveStats = _anyPlayerOnFoundation(world) ? stats : { ...stats, magicPct: 0 };
  const chainCount = chainHitCount(stats.chain, world.combat.rng);
  const others = enemiesInRange.filter((enemy) => enemy.id !== primary.id);
  const targets = [primary, ...selectChainTargets(primary, others, chainCount)];
  world.combat.lastHits = [];
  for (const target of targets) {
    const damage = computeHit(effectiveStats, target, cfg.core.defenseK);
    target.hp -= damage;
    world.combat.lastHits.push({ id: target.id, damage });
  }
  world.combat.lastHitTimer = 0.45;
  // VFX 快照：攻擊當下固定生成 zigzag 頂點，renderer 只讀取並繪製。
  if (world.vfx) {
    world.vfx.timer = 0.45;
    world.vfx.bolts = buildAttackBolts(world, targets, world.combat.rng, cfg);
  }
  pruneDeadEnemies(world);
  world.combat.attackCooldown = 1 / Math.max(0.001, stats.attackSpeed);
  return world.combat;
}

function buildAttackBolts(world, targets, rng, cfg = GAME_CONFIG) {
  const t = cfg.render.tilePx;
  // 所有閃電固定從核心正中心出發
  const cc = world.coreCenter;
  const start = { x: (cc.x + 0.5) * t, y: (cc.y + 0.5) * t };

  return targets.map((target, chainIdx) => {
    const end = { x: (target.x + 0.5) * t, y: (target.y + 0.5) * t };
    return { points: buildBoltPoints(start, end, rng, chainIdx === 0), chainIdx };
  });
}

function buildBoltPoints(start, end, rng, isPrimary) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return [start, end];

  const perpX = -dy / len;
  const perpY = dx / len;
  const segments = 8;
  const spread = Math.min(len * 0.22, isPrimary ? 34 : 20);
  const points = [start];

  for (let i = 1; i < segments; i++) {
    const frac = i / segments;
    const taper = 1 - Math.abs(0.5 - frac) * 1.4;
    const offset = randomRange(rng, -spread, spread) * Math.max(0.25, taper);
    points.push({
      x: start.x + dx * frac + perpX * offset,
      y: start.y + dy * frac + perpY * offset,
    });
  }

  points.push(end);
  return points;
}

function randomRange(rng, min, max) {
  if (typeof rng?.pct === 'function') return rng.pct(min, max);
  return min + (rng?.next?.() ?? 0.5) * (max - min);
}
