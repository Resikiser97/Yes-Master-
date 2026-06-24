import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../config/gameConfig.js';

// Mock localStorage for Node environment
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => _store.get(k) ?? null,
  setItem: (k, v) => _store.set(k, v),
  removeItem: (k) => _store.delete(k),
};

const TEST_KEY = 'yesmaster.save.test.savemanager';
const cfg = { ...GAME_CONFIG, save: { ...GAME_CONFIG.save, storageKey: TEST_KEY } };

const { saveWorld, loadWorld } = await import('../src/storage/saveManager.js');
const { createWorld } = await import('../src/game/world.js');

// Round-trip: save and load preserves drops with qty
{
  _store.clear();
  const world = createWorld(cfg);
  world.drops = [
    { blockKey: 'stone', x: 5, y: 10, qty: 3 },
    { blockKey: 'sand', x: 6, y: 10, qty: 1 },
  ];
  world.mineProgress = { 'A,0,0,stone': 25 };

  saveWorld(world, cfg);
  const loaded = loadWorld(cfg);
  assert.ok(loaded, 'loadWorld should return a world');
  assert.equal(loaded.drops.length, 2);
  assert.equal(loaded.drops[0].qty, 3);
  assert.equal(loaded.drops[0].blockKey, 'stone');
  assert.equal(loaded.drops[1].qty, 1);
  assert.deepEqual(loaded.mineProgress, { 'A,0,0,stone': 25 });
}

// Deserialize old-format drops (no qty field) → gets qty: 1
{
  _store.clear();
  const world = createWorld(cfg);
  world.drops = [{ blockKey: 'stone', x: 5, y: 10 }];
  saveWorld(world, cfg);

  // Manually patch stored data to remove qty (simulate old format)
  const raw = JSON.parse(_store.get(TEST_KEY));
  raw.drops = [{ blockKey: 'stone', x: 5, y: 10 }]; // no qty field
  _store.set(TEST_KEY, JSON.stringify(raw));

  const loaded = loadWorld(cfg);
  assert.ok(loaded);
  assert.equal(loaded.drops.length, 1);
  assert.equal(loaded.drops[0].qty, 1, 'old format drops should get qty: 1');
}

// Test preset uses different storageKey — no pollution
{
  _store.clear();
  const normalCfg = { ...cfg, save: { ...cfg.save, storageKey: 'yesmaster.save.normal' } };
  const testCfg = { ...cfg, save: { ...cfg.save, storageKey: 'yesmaster.save.test' } };

  const w1 = createWorld(normalCfg);
  w1.stage = 5;
  saveWorld(w1, normalCfg);

  const w2 = createWorld(testCfg);
  w2.stage = 20;
  saveWorld(w2, testCfg);

  const loaded1 = loadWorld(normalCfg);
  const loaded2 = loadWorld(testCfg);
  assert.equal(loaded1.stage, 5);
  assert.equal(loaded2.stage, 20);
}

// Clean up
_store.clear();

console.log('saveManager tests passed');
