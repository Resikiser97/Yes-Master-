import { movePlayer } from '../logic/playerMovement.js';
import { ensurePlayer } from '../game/world.js';
import { updateMining, collectDrops, tryDeposit, tryPlace, tryRemove, updateRepair } from '../game/actions.js';
import { createInputValidator } from './validation.js';

export function createInputBuffer({ cfg, validator = createInputValidator({ cfg }) } = {}) {
  const queue = new Map();
  return {
    push(playerId, input) {
      if (!queue.has(playerId)) queue.set(playerId, []);
      queue.get(playerId).push(input);
    },
    drain(world, dt, onReject = null) {
      for (const [playerId, inputs] of queue) {
        while (inputs.length) {
          const input = inputs.shift();
          const valid = validator(input, { world, playerId });
          if (!valid.ok) {
            onReject?.(playerId, valid.reason, input);
            continue;
          }
          applyInput(world, playerId, input, dt, cfg);
        }
      }
    },
  };
}

export function serializeControls(controls, world, cfg, sequenceId) {
  const t = cfg.render.tilePx;
  const tileX = Math.floor(((controls.mouse?.x ?? 0) + (world.camera?.x ?? 0)) / t);
  const tileY = Math.floor(((controls.mouse?.y ?? 0) + (world.camera?.y ?? 0)) / t);
  const slot = controls.getSelectedSlot?.();
  const selectedBlock = slot != null ? cfg.hotbar[slot] : null;
  const action = consumeControlAction(controls, selectedBlock, tileX, tileY);
  return {
    sequenceId,
    move: controls.getMoveVector?.() ?? { x: 0, y: 0 },
    mining: !!controls.isMining?.(),
    repairing: !!controls.isRepairing?.(),
    action,
    selectedBlock,
    tile: { x: tileX, y: tileY },
  };
}

export function applyInput(world, playerId, input, dt, cfg) {
  const player = ensurePlayer(world, playerId, cfg);
  const prevX = player.x;
  const prevY = player.y;
  const moved = movePlayer(player, input.move ?? { x: 0, y: 0 }, dt, {
    minX: 0,
    maxX: world.cols - 1,
    minY: 0,
    maxY: world.groundY - 1,
  }, cfg);
  world.players.set(playerId, { ...moved, id: playerId, prevX, prevY });

  if (input.action?.kind === 'place') tryPlace(world, input.action.blockKey, input.action.x, input.action.y, cfg, playerId);
  if (input.action?.kind === 'remove') tryRemove(world, input.action.x, input.action.y, cfg, playerId);
  updateMining(world, !!input.mining, dt, cfg, playerId);
  collectDrops(world, cfg, playerId);
  updateRepair(world, !!input.repairing, dt, cfg, playerId);
  tryDeposit(world, playerId);
}

function consumeControlAction(controls, selectedBlock, tileX, tileY) {
  if (selectedBlock && controls.consumePlace?.()) return { kind: 'place', blockKey: selectedBlock, x: tileX, y: tileY };
  if (controls.consumeRemove?.()) return { kind: 'remove', x: tileX, y: tileY };
  return null;
}
