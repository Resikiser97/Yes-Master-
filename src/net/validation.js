import { validatePlacement, validateRemoval } from '../logic/building.js';
import { key } from '../logic/connectivity.js';

const DEFAULT_LIMITS = {
  minMoveIntervalMs: 50,
  minActionIntervalMs: 100,
  maxSequenceGap: 120,
};

export function createInputValidator({ cfg, limits = DEFAULT_LIMITS } = {}) {
  const last = new Map();

  return function validateInput(input, { world, playerId } = {}) {
    if (!input || typeof input !== 'object') return reject('malformed');
    if (!Number.isInteger(input.sequenceId) || input.sequenceId < 0) return reject('bad_sequence');

    const now = Date.now();
    const state = last.get(playerId) ?? { sequenceId: -1, moveAt: 0, actionAt: 0 };
    if (input.sequenceId <= state.sequenceId) return reject('replay');
    if (input.sequenceId - state.sequenceId > limits.maxSequenceGap && state.sequenceId >= 0) return reject('sequence_gap');

    if (input.move) {
      if (now - state.moveAt < limits.minMoveIntervalMs) return reject('move_rate');
      if (!validAxis(input.move.x) || !validAxis(input.move.y)) return reject('bad_move_vector');
      state.moveAt = now;
    }

    if (input.action) {
      if (now - state.actionAt < limits.minActionIntervalMs) return reject('action_rate');
      const actionResult = validateAction(input.action, { world, playerId, cfg });
      if (!actionResult.ok) return actionResult;
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
  if (action.kind === 'deposit') {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const onCore = world.core.some(([x, y]) => x === px && y === py);
    const onDirt = world.dirt.has(key(px, py));
    return onCore || onDirt ? { ok: true } : reject('deposit_position');
  }
  return { ok: true };
}
