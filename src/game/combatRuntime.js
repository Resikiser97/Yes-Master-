/**
 * @file        combatRuntime.js
 * @module      game（狀態/orchestration 層，非渲染）
 * @summary     Step 6B：debug 敵人、追逐玩家、核心普攻/連鎖接入 world
 * @exports     spawnDebugEnemies, updateEnemies, updateCoreCombat
 * @depends     config/enemies.js、config/gameConfig.js、src/logic/combat.js、src/logic/connectivity.js
 * @sourceOfTruth Docs/game-design-plan.md「核心攻擊與防禦機制」
 * @version     v0.0.3.0
 */

import { ENEMIES } from '../../config/enemies.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { computeHit, selectPrimaryTarget, chainHitCount, selectChainTargets, dist2 } from '../logic/combat.js';
import { computeConnected } from '../logic/connectivity.js';

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
  };
}

export function spawnDebugEnemies(world, count = 1, enemyKey = 'civilian', cfg = GAME_CONFIG) {
  const spawnDistance = cfg.debug?.enemySpawnDistanceTiles ?? 8;
  const row = Math.max(0, Math.min(world.groundY - 1, Math.round(world.player.y)));
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const offset = spawnDistance + Math.floor(i / 2);
    const x = Math.max(0, Math.min(world.cols - 1, world.player.x + side * offset));
    world.enemies.push(createEnemy(world, enemyKey, x, row));
  }
  return { ok: true, count };
}

export function updateEnemies(world, dt) {
  for (const enemy of world.enemies) {
    const dx = world.player.x - enemy.x;
    const dy = world.player.y - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) continue;
    const step = Math.min(enemy.moveSpeed * dt, d);
    enemy.x += (dx / d) * step;
    enemy.y += (dy / d) * step;
  }
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

export function updateCoreCombat(world, dt, cfg = GAME_CONFIG) {
  if (world.combat.lastHitTimer > 0) {
    world.combat.lastHitTimer = Math.max(0, world.combat.lastHitTimer - dt);
    if (world.combat.lastHitTimer === 0) world.combat.lastHits = [];
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

  const chainCount = chainHitCount(stats.chain, world.combat.rng);
  const others = enemiesInRange.filter((enemy) => enemy.id !== primary.id);
  const targets = [primary, ...selectChainTargets(primary, others, chainCount)];
  world.combat.lastHits = [];
  for (const target of targets) {
    const damage = computeHit(stats, target, cfg.core.defenseK);
    target.hp -= damage;
    world.combat.lastHits.push({ id: target.id, damage });
  }
  world.combat.lastHitTimer = 0.45;
  pruneDeadEnemies(world);
  world.combat.attackCooldown = 1 / Math.max(0.001, stats.attackSpeed);
  return world.combat;
}
