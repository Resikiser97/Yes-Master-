import assert from 'node:assert/strict';
import { createDrop, addDrop, collectNearbyDrops } from '../src/logic/drops.js';

function makePlayer(x, y, capacity = 50, slots = 6) {
  return { x, y, capacity, slots, inventory: {} };
}

const CFG = { drops: { pickupReachTiles: 1 } };

// createDrop includes qty
{
  const d = createDrop('stone', 5, 10);
  assert.equal(d.qty, 1);
  const d2 = createDrop('stone', 5, 10, 3);
  assert.equal(d2.qty, 3);
}

// addDrop merges same blockKey + same position (pure: does not mutate input)
{
  const original = [createDrop('stone', 5, 10)];
  const origQty = original[0].qty;
  const result = addDrop(original, 'stone', 5, 10, 128);
  assert.equal(result.added, true);
  assert.equal(result.drops.length, 1);
  assert.equal(result.drops[0].qty, 2);
  // input not mutated
  assert.equal(original.length, 1);
  assert.equal(original[0].qty, origQty);
  assert.notStrictEqual(result.drops, original);
  assert.notStrictEqual(result.drops[0], original[0]);
}

// addDrop creates new stack for different blockKey (pure)
{
  const original = [createDrop('stone', 5, 10)];
  const result = addDrop(original, 'sand', 5, 10, 128);
  assert.equal(result.added, true);
  assert.equal(result.drops.length, 2);
  // input not mutated
  assert.equal(original.length, 1);
}

// addDrop creates new stack for different position
{
  const original = [createDrop('stone', 5, 10)];
  const result = addDrop(original, 'stone', 6, 10, 128);
  assert.equal(result.added, true);
  assert.equal(result.drops.length, 2);
  assert.equal(original.length, 1);
}

// addDrop respects maxStacks (no merge available, pure)
{
  const original = [createDrop('stone', 5, 10)];
  const origQty = original[0].qty;
  const result = addDrop(original, 'sand', 5, 10, 1);
  assert.equal(result.added, false);
  // input not mutated
  assert.equal(original.length, 1);
  assert.equal(original[0].qty, origQty);
}

// addDrop allows merge even at maxStacks (pure)
{
  const original = [createDrop('stone', 5, 10)];
  const result = addDrop(original, 'stone', 5, 10, 1);
  assert.equal(result.added, true);
  assert.equal(result.drops[0].qty, 2);
  // input not mutated
  assert.equal(original[0].qty, 1);
}

// collectNearbyDrops picks up within reach
{
  const drops = [createDrop('stone', 5, 10)];
  const player = makePlayer(5, 10);
  const result = collectNearbyDrops(drops, player, player.inventory, CFG);
  assert.equal(result.drops.length, 0);
  assert.equal(result.inventory.stone, 1);
}

// collectNearbyDrops skips out-of-reach drops
{
  const drops = [createDrop('stone', 20, 20)];
  const player = makePlayer(5, 10);
  const result = collectNearbyDrops(drops, player, player.inventory, CFG);
  assert.equal(result.drops.length, 1);
  assert.deepEqual(result.inventory, {});
}

// collectNearbyDrops handles qty > 1, partial pickup (stone weight=5, capacity=7 → pick 1, leave 2)
{
  const drops = [createDrop('stone', 5, 10, 3)];
  const player = { x: 5, y: 10, capacity: 7, slots: 6, inventory: {} };
  const result = collectNearbyDrops(drops, player, player.inventory, CFG);
  assert.equal(result.inventory.stone, 1);
  assert.equal(result.drops.length, 1);
  assert.equal(result.drops[0].qty, 2);
}

// collectNearbyDrops picks up full qty stack
{
  const drops = [createDrop('stone', 5, 10, 2)];
  const player = makePlayer(5, 10, 50, 6);
  const result = collectNearbyDrops(drops, player, player.inventory, CFG);
  assert.equal(result.drops.length, 0);
  assert.equal(result.inventory.stone, 2);
}

// legacy drops without qty field get treated as qty=1
{
  const drops = [{ blockKey: 'stone', x: 5, y: 10 }];
  const player = makePlayer(5, 10);
  const result = collectNearbyDrops(drops, player, player.inventory, CFG);
  assert.equal(result.drops.length, 0);
  assert.equal(result.inventory.stone, 1);
}

console.log('drops tests passed');
