/**
 * @file        validation.js
 * @module      net
 * @summary     房主端 Input 驗證器：sequenceId 防重放、速率限制、建造/拆除合法性（proxy 到 logic/building.js）
 * @exports     createInputValidator
 * @depends     logic/building.js, logic/connectivity.js
 * @sourceOfTruth Docs/game-architecture-plan.md「反作弊／輸入驗證機制 → 各 Event 驗證規則」
 * @version     v0.0.19.0
 */
import { validatePlacement, validateRemoval } from '../logic/building.js';
import { key } from '../logic/connectivity.js';

const DEFAULT_LIMITS = {
  minActionIntervalMs: 0,
  maxSequenceGap: 120,
};

export function createInputValidator({ cfg, limits = DEFAULT_LIMITS } = {}) {
  const last = new Map();

  return function validateInput(input, { world, playerId } = {}) {
    if (!input || typeof input !== 'object') return reject('malformed');
    if (!Number.isInteger(input.sequenceId) || input.sequenceId < 0) return reject('bad_sequence');

    const now = Date.now();
    const state = last.get(playerId) ?? { sequenceId: -1, actionAt: 0 };
    if (input.sequenceId <= state.sequenceId) return reject('replay');
    if (input.sequenceId - state.sequenceId > limits.maxSequenceGap && state.sequenceId >= 0) return reject('sequence_gap');

    if (input.move) {
      if (!validAxis(input.move.x) || !validAxis(input.move.y)) return reject('bad_move_vector');
    }

    const actions = input.actions?.length ? input.actions : (input.action ? [input.action] : []);
    if (actions.length) {
      if (limits.minActionIntervalMs > 0 && now - state.actionAt < limits.minActionIntervalMs) return reject('action_rate');
      for (const action of actions) {
        const actionResult = validateAction(action, { world, playerId, cfg });
        if (!actionResult.ok) return actionResult;
      }
      state.actionAt = now;
    }

    state.sequenceId = input.sequenceId;
    last.set(playerId, state);
    return { ok: true };
  };
}

function validAxis(value) {
  return value === -1 || value === 0 || value === 1;
}

function reject(reason) {
  return { ok: false, reason };
}

function validateAction(action, { world, playerId, cfg }) {
  if (!world || !cfg) return { ok: true };
  const player = world.players?.get(playerId);
  if (!player) return reject('unknown_player');
  if (action.kind === 'place') {
    const ctx = {
      dirt: world.dirt,
      fore: world.fore,
      core: world.core,
      coreCenter: world.coreCenter,
      groundY: world.groundY,
      stage: world.stage,
      limits: cfg.buildLimits,
      player,
      reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles,
    };
    return validatePlacement(ctx, action.blockKey, action.x, action.y);
  }
  if (action.kind === 'remove') {
    return validateRemoval({
      dirt: world.dirt,
      fore: world.fore,
      core: world.core,
      player,
      reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles,
    }, action.x, action.y);
  }
  if (['buildPlanToggle', 'destroyToggle', 'placeRect', 'removeRect', 'cardChoice'].includes(action.kind)) {
    return { ok: true };
  }
  if (action.kind === 'deposit') {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const onCore = world.core.some(([x, y]) => x === px && y === py);
    const onDirt = world.dirt.has(key(px, py));
    return onCore || onDirt ? { ok: true } : reject('deposit_position');
  }
  return { ok: true };
}
