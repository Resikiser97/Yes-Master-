import assert from 'node:assert/strict';

import { generateOffer } from '../src/logic/cardOffer.js';
import { createRng } from '../src/logic/rng.js';
import { Controls } from '../src/input/controls.js';
import { Renderer } from '../src/render/renderer.js';
import { createWorld } from '../src/game/world.js';
import { resolveCardOffer, updatePhase } from '../src/game/phaseRuntime.js';
import { applyDebugAction } from '../src/game/actions.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

function sequenceRng(values) {
  let i = 0;
  return {
    next() {
      const value = values[i] ?? values[values.length - 1] ?? 0;
      i += 1;
      return value;
    },
    pick(items) {
      return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
    },
  };
}

function testOfferDedup() {
  for (let seed = 1; seed <= 30; seed++) {
    const offer = generateOffer(createRng(seed), 10);
    assert.equal(new Set(offer.map((c) => c.key)).size, offer.length);
  }
}

function testMaxStrong() {
  for (let seed = 1; seed <= 30; seed++) {
    const offer = generateOffer(createRng(seed), 10);
    assert.ok(offer.filter((c) => c.tier === 'strong').length <= 1);
  }
}

function testRerollSlot3IfAllSameType() {
  const pool = {
    coreStandard: { zh: '標準核心', type: 'core', tier: 'standard', effect: { kind: 'coreStat', stat: 'attack', add: 1 } },
    coreWeak: { zh: '弱核心', type: 'core', tier: 'weak', effect: { kind: 'coreStat', stat: 'attack', add: 1 } },
    coreStrong: { zh: '強核心', type: 'core', tier: 'strong', effect: { kind: 'coreStat', stat: 'attack', add: 1 } },
    abilityStandard: { zh: '標準能力', type: 'ability', tier: 'standard', effect: { kind: 'playerStat', stat: 'carry', add: 1 } },
  };
  const rng = sequenceRng([
    0, 0,   // slot 1: standard tier, pick coreStandard
    0, 0,   // slot 2: weak tier, pick coreWeak
    0, 0,   // slot 3 attempt 1: strong core, reroll
    0.3, 0, // slot 3 attempt 2: standard ability
  ]);

  const offer = generateOffer(rng, 10, pool);
  assert.deepEqual(offer.map((c) => c.key), ['coreStandard', 'coreWeak', 'abilityStandard']);
}

function testCardOfferClickRects() {
  const controls = new Controls(null);
  controls.cardOfferMode = true;
  controls.cardOfferRects = [
    { x: 10, y: 20, w: 160, h: 220 },
    { x: 190, y: 20, w: 160, h: 220 },
    { x: 370, y: 20, w: 160, h: 220 },
  ];
  controls._handlePointerDown({
    button: 0,
    offsetX: 200,
    offsetY: 100,
    preventDefault() {},
  });

  assert.equal(controls.consumeCardChoice(), 1);
}

function fakeCtx() {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    clearRect: noop,
    translate: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
    measureText: (text) => ({ width: String(text).length * 8 }),
    set fillStyle(_v) {},
    set strokeStyle(_v) {},
    set lineWidth(_v) {},
    set font(_v) {},
    set textAlign(_v) {},
    set textBaseline(_v) {},
  };
}

function testRendererWritesCardOfferRects() {
  const world = createWorld(GAME_CONFIG);
  world.pendingCardOffer = generateOffer(createRng(7), 10);
  const renderer = new Renderer(null, GAME_CONFIG);
  renderer.ctx = fakeCtx();

  renderer._drawCardOffer(world);

  assert.equal(world.cardOfferRects.length, 3);
  assert.deepEqual(world.cardOfferRects.map((r) => ({ w: r.w, h: r.h })), [
    { w: 160, h: 220 },
    { w: 160, h: 220 },
    { w: 160, h: 220 },
  ]);
  assert.equal(world.cardOfferRects[1].x - world.cardOfferRects[0].x, 180);
}

function testBossClearEntersCardOfferAndResolveReturnsPrep() {
  const world = createWorld(GAME_CONFIG);
  world.stage = 9;
  world.phase = 'night';
  world.phaseTimer = 10;
  world.pendingSpawns = [];
  world.enemies = [];

  updatePhase(world, GAME_CONFIG.time.fixedStepSeconds, GAME_CONFIG);
  assert.equal(world.stage, 10);
  assert.equal(world.phase, 'cardOffer');
  assert.equal(world.pendingCardOffer.length, 3);

  world.pendingCardOffer = [{ key: 'ironFangCore', effect: { kind: 'coreStat', stat: 'attack', add: 2 } }];
  resolveCardOffer(world, 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.equal(world.pendingCardOffer, null);
  assert.ok(world.cardBonuses.attack >= 2);
}

function testDebugActionShowsCardOffer() {
  const world = createWorld(GAME_CONFIG);
  world.enemies = [{ id: 'debug-enemy' }];
  world.pendingSpawns = [{ atSecond: 0, defs: [] }];

  const out = applyDebugAction(world, 'showCardOffer', GAME_CONFIG);

  assert.equal(out.ok, true);
  assert.equal(world.phase, 'cardOffer');
  assert.equal(world.enemies.length, 0);
  assert.deepEqual(world.pendingSpawns, []);
  assert.equal(world.pendingCardOffer.length, 3);
}

testOfferDedup();
testMaxStrong();
testRerollSlot3IfAllSameType();
testCardOfferClickRects();
testRendererWritesCardOfferRects();
testBossClearEntersCardOfferAndResolveReturnsPrep();
testDebugActionShowsCardOffer();
