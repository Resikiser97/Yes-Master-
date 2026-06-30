import assert from 'node:assert/strict';

import { createWorld } from '../src/game/world.js';
import { refreshCoreSnapshot } from '../src/game/coreSnapshot.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { BLOCKS } from '../config/blocks.js';

// 靈力加成正確乘進 attack + attackSpeed（單人模式含 spiritSinglePlayerBonusPct）
function testSpiritBonusAttackAndSpeed() {
  const world = createWorld(GAME_CONFIG);
  const player = world.player;

  // spirit=0 → baseline（無靈力乘算，但單人固定加成仍為 0%）
  player.spirit = 0;
  // 暫時清零單人加成以取得純 spirit=0 基準
  const savedSingleBonus = world.cfg.player.spiritSinglePlayerBonusPct;
  world.cfg.player.spiritSinglePlayerBonusPct = 0;
  refreshCoreSnapshot(world);
  const baseAttack = world.coreStats.attack;
  const baseSpeed  = world.coreStats.attackSpeed;

  // 還原 spirit=50 與單人加成 → spiritPct = 5 + 15 = 20
  player.spirit = GAME_CONFIG.player.spirit;
  world.cfg.player.spiritSinglePlayerBonusPct = savedSingleBonus;
  refreshCoreSnapshot(world);

  const spiritPct = GAME_CONFIG.player.spirit / 100 * 10 + GAME_CONFIG.player.spiritSinglePlayerBonusPct;
  const factor = 1 + spiritPct / 100;

  assert.ok(
    Math.abs(world.coreStats.attack      - baseAttack * factor) < 0.0001,
    `attack: expected ~${(baseAttack * factor).toFixed(4)}, got ${world.coreStats.attack.toFixed(4)}`,
  );
  assert.ok(
    Math.abs(world.coreStats.attackSpeed - baseSpeed * factor) < 0.0001,
    `attackSpeed: expected ~${(baseSpeed * factor).toFixed(4)}, got ${world.coreStats.attackSpeed.toFixed(4)}`,
  );
}

function testMultiModeDoesNotUseSingleSpiritBonus() {
  const cfg = {
    ...GAME_CONFIG,
    mode: 'multi',
    player: { ...GAME_CONFIG.player },
  };
  const world = createWorld(cfg);
  world.player.spirit = 0;
  refreshCoreSnapshot(world);

  assert.equal(world.coreStats.attack, cfg.core.base.attack);
  assert.equal(world.coreStats.attackSpeed, cfg.core.base.attackSpeed);
}

// 高塔工法：高於 config 門檻的鐵方塊帶來 +10% 攻擊加成（在靈力乘算後加算）
function testHeightBonusForHighBlocks() {
  const world = createWorld(GAME_CONFIG);
  const highY = world.groundY - GAME_CONFIG.core.heightBonusAboveGroundTiles - 1;
  world.fore.set(`80,${highY}`, 'iron');

  // 無 heightBonusPct 的基線（靈力乘算已包含在內）
  refreshCoreSnapshot(world);
  const attackNoBonus = world.coreStats.attack;

  // 加上 10% 高度加成
  world.cardModifiers = [{ stat: 'heightBonusPct', pct: 10 }];
  refreshCoreSnapshot(world);

  // 高度加成在靈力乘算後加算，所以差值 = iron.bonus.attack * (10/100)
  const ironAttack = BLOCKS.iron.bonus?.attack ?? 0;
  const expected = ironAttack * (10 / 100);
  assert.ok(
    Math.abs(world.coreStats.attack - attackNoBonus - expected) < 0.0001,
    `height bonus: expected +${expected}, got +${(world.coreStats.attack - attackNoBonus).toFixed(6)}`,
  );
}

// 地面附近、未超過 config 門檻的方塊不受高度加成影響
function testNoHeightBonusForLowBlocks() {
  const world = createWorld(GAME_CONFIG);
  const lowY = world.groundY - GAME_CONFIG.core.heightBonusAboveGroundTiles;
  world.fore.set(`80,${lowY}`, 'iron');

  refreshCoreSnapshot(world);
  const attackNoBonus = world.coreStats.attack;

  world.cardModifiers = [{ stat: 'heightBonusPct', pct: 10 }];
  refreshCoreSnapshot(world);

  assert.ok(
    Math.abs(world.coreStats.attack - attackNoBonus) < 0.0001,
    `low block should not get height bonus, diff=${world.coreStats.attack - attackNoBonus}`,
  );
}

function testMalformedHeightBonusKeyIsIgnored() {
  const world = createWorld(GAME_CONFIG);
  world.fore.set('not-a-coordinate', 'iron');

  refreshCoreSnapshot(world);
  const attackNoBonus = world.coreStats.attack;

  world.cardModifiers = [{ stat: 'heightBonusPct', pct: 10 }];
  refreshCoreSnapshot(world);

  assert.equal(world.coreStats.attack, attackNoBonus);
}

testSpiritBonusAttackAndSpeed();
testMultiModeDoesNotUseSingleSpiritBonus();
testHeightBonusForHighBlocks();
testNoHeightBonusForLowBlocks();
testMalformedHeightBonusKeyIsIgnored();
console.log('coreSnapshot tests passed');
