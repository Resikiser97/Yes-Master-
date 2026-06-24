import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld } from '../src/game/world.js';
import { updateMining, collectDrops } from '../src/game/actions.js';

// Helper: make world ready for mining tests, player next to mine A
function miningWorld() {
  const world = createWorld(GAME_CONFIG);
  world.mining = { targetKey: null, damage: 0, full: false, dropFull: false };
  // Mine A occupies cols [15,24], rows [groundY-3, groundY-1]
  // Place player adjacent to mine A for selectNearestMineCell to find a target
  world.player.x = 15;
  world.player.y = world.groundY - 1;
  return world;
}

// mineProgress: stop mining saves progress
{
  const world = miningWorld();
  // Start mining to accumulate damage
  updateMining(world, true, 0.1, GAME_CONFIG);
  const savedKey = world.mining.targetKey;
  const savedDmg = world.mining.damage;
  assert.ok(savedDmg > 0, 'should accumulate some damage');

  // Stop mining → progress saved
  updateMining(world, false, 0, GAME_CONFIG);
  assert.equal(world.mining.targetKey, null);
  if (savedKey) {
    assert.equal(world.mineProgress[savedKey], savedDmg, 'progress should be saved');
  }
}

// mineProgress: resume same block restores progress
{
  const world = miningWorld();
  updateMining(world, true, 0.1, GAME_CONFIG);
  const savedKey = world.mining.targetKey;
  const savedDmg = world.mining.damage;

  // Stop
  updateMining(world, false, 0, GAME_CONFIG);

  // Resume mining same target
  updateMining(world, true, 0.01, GAME_CONFIG);
  if (savedKey && world.mining.targetKey === savedKey) {
    assert.ok(world.mining.damage >= savedDmg, 'should restore and add more damage');
  }
}

// backpack full → drops created
{
  const world = miningWorld();
  // Fill backpack completely
  for (let i = 0; i < world.player.slots; i++) {
    world.player.inventory[`fakeblock${i}`] = 999;
  }
  world.player.capacity = 0; // no room

  // Mine long enough to break a block (if possible)
  for (let i = 0; i < 600; i++) {
    updateMining(world, true, 1 / 60, GAME_CONFIG);
  }
  // After many ticks, either drops or dropFull should be triggered
  assert.ok(world.mining.full === true || world.drops.length > 0 || world.mining.dropFull === true,
    'should set full or produce drops');
}

// dropFull: when drops at maxStacks and backpack full, damage clamps
{
  const cfg = { ...GAME_CONFIG, drops: { ...GAME_CONFIG.drops, maxStacks: 0 } };
  const world = miningWorld();
  world.drops = []; // start empty but maxStacks=0 means no room
  // Fill backpack
  for (let i = 0; i < world.player.slots; i++) {
    world.player.inventory[`fakeblock${i}`] = 999;
  }
  world.player.capacity = 0;

  for (let i = 0; i < 600; i++) {
    updateMining(world, true, 1 / 60, cfg);
  }
  // If a target was found and damage accumulated, dropFull should be set
  if (world.mining.targetKey) {
    assert.equal(world.mining.dropFull, true, 'should flag dropFull when ground is at cap');
  }
}

// collectDrops clears mining.full and mining.dropFull when all drops collected
{
  const world = miningWorld();
  world.drops = [{ blockKey: 'stone', x: world.player.x, y: world.player.y, qty: 1 }];
  world.mining.full = true;
  world.mining.dropFull = true;
  world.player.inventory = {};
  collectDrops(world, GAME_CONFIG);
  assert.equal(world.drops.length, 0);
  assert.equal(world.mining.full, false);
  assert.equal(world.mining.dropFull, false);
}

console.log('actions-mining tests passed');
