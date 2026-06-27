/**
 * @file        inputBuffer.js
 * @module      net
 * @summary     房主端 Input buffer：收集/驗證 Input 後路由至 actions / phaseRuntime，並同步玩家 auto/manual intent
 * @exports     createInputBuffer, serializeControls, applyInput
 * @depends     logic/playerMovement.js, game/world.js, game/actions.js, game/phaseRuntime.js, net/validation.js
 * @version     v0.0.18.0
 */
import { movePlayer } from '../logic/playerMovement.js';
import { ensurePlayer } from '../game/world.js';
import { updateMining, collectDrops, tryDeposit, tryPlace, tryRemove, updateRepair, applyDebugAction, toggleBuildPlanMode, tryPlaceRect, tryRemoveRect } from '../game/actions.js';
import { resolveCardOffer } from '../game/phaseRuntime.js';
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

export function serializeControls(controls, world, cfg, sequenceId, extra = {}) {
  const t = cfg.render.tilePx;
  const tileX = Math.floor(((controls.mouse?.x ?? 0) + (world.camera?.x ?? 0)) / t);
  const tileY = Math.floor(((controls.mouse?.y ?? 0) + (world.camera?.y ?? 0)) / t);
  const slot = controls.getSelectedSlot?.();
  const selectedBlock = slot != null ? cfg.hotbar[slot] : null;
  const actions = consumeControlActions(controls, world, selectedBlock, tileX, tileY, cfg);
  const manualIntent = controls.consumeManualIntent?.();
  return {
    sequenceId,
    move: controls.getMoveVector?.() ?? { x: 0, y: 0 },
    mining: !!controls.isMining?.(),
    repairing: !!controls.isRepairing?.(),
    action: actions[0] ?? null,
    actions,
    debugActions: extra.debugActions ?? [],
    selectedBlock,
    tile: { x: tileX, y: tileY },
    manualIntent,
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

  const actions = input.actions?.length ? input.actions : (input.action ? [input.action] : []);
  for (const action of actions) applyAction(world, playerId, action, cfg);
  for (const action of input.debugActions ?? []) {
    if (action !== 'resetSave') applyDebugAction(world, action, cfg);
  }
  updateMining(world, !!input.mining, dt, cfg, playerId);
  collectDrops(world, cfg, playerId);
  updateRepair(world, !!input.repairing, dt, cfg, playerId);
  tryDeposit(world, playerId);

  // Host 端為遠端玩家偵測意圖（auto-detect + 手動）
  if (input.manualIntent !== undefined) {
    player.intent = input.manualIntent;
    player.intentAt = input.manualIntent ? Date.now() : 0;
    player.intentManual = !!input.manualIntent;
  } else if (!player.intentManual || (Date.now() - (player.intentAt ?? 0)) >= 30_000) {
    if (player.intentManual) player.intentManual = false;
    const _intent = input.mining ? 'mine' : input.repairing ? 'repair' :
      (input.selectedBlock && actions.some(a => a.kind?.startsWith('place'))) ? 'build' : null;
    if (_intent && _intent !== player.intent) {
      player.intent = _intent;
      player.intentAt = Date.now();
    } else if (!_intent) {
      player.intent = null;
    }
  }
}

function consumeControlActions(controls, world, selectedBlock, tileX, tileY, cfg) {
  const actions = [];
  if (world.phase === 'cardOffer' || controls.cardOfferMode) {
    const cardChoice = controls.consumeCardChoice?.();
    return cardChoice != null ? [{ kind: 'cardChoice', index: cardChoice }] : actions;
  }

  if (controls.consumeBuildPlanToggle?.()) {
    const result = toggleBuildPlanMode(world, cfg, world.localPlayerId);
    if (result.ok) actions.push({ kind: 'buildPlanToggle', active: world.buildPlanMode });
  }
  if (controls.consumeDestroyToggle?.()) {
    if (world.buildPlanMode) {
      world.buildDestroyMode = !world.buildDestroyMode;
      actions.push({ kind: 'destroyToggle', active: world.buildDestroyMode });
    }
  }

  const dragRect = controls.consumeDragRect?.();
  if (dragRect && selectedBlock) {
    const rect = dragRectToTiles(dragRect, world, cfg);
    actions.push({
      kind: world.buildDestroyMode ? 'removeRect' : 'placeRect',
      blockKey: selectedBlock,
      ...rect,
    });
  }

  if (selectedBlock && controls.consumePlace?.()) {
    actions.push(world.buildPlanMode && !world.buildDestroyMode
      ? { kind: 'placeRect', blockKey: selectedBlock, x1: tileX, y1: tileY, x2: tileX, y2: tileY }
      : { kind: 'place', blockKey: selectedBlock, x: tileX, y: tileY });
  }
  if (controls.consumeRemove?.()) actions.push({ kind: 'remove', x: tileX, y: tileY });
  return actions;
}

function dragRectToTiles(dragRect, world, cfg) {
  const t = cfg.render.tilePx;
  return {
    x1: Math.floor((dragRect.startPx + world.camera.x) / t),
    y1: Math.floor((dragRect.startPy + world.camera.y) / t),
    x2: Math.floor((dragRect.endPx + world.camera.x) / t),
    y2: Math.floor((dragRect.endPy + world.camera.y) / t),
  };
}

function applyAction(world, playerId, action, cfg) {
  if (!action) return;
  if (action.kind === 'place') tryPlace(world, action.blockKey, action.x, action.y, cfg, playerId);
  else if (action.kind === 'remove') tryRemove(world, action.x, action.y, cfg, playerId);
  else if (action.kind === 'buildPlanToggle') {
    if (playerId !== world.localPlayerId) return;
    const result = toggleBuildPlanMode(world, cfg, playerId);
    if (result.ok && world.buildPlanMode) world.buildDestroyMode = false;
  } else if (action.kind === 'destroyToggle') {
    if (playerId !== world.localPlayerId) return;
    if (world.buildPlanMode) world.buildDestroyMode = !world.buildDestroyMode;
  } else if (action.kind === 'placeRect') {
    tryPlaceRect(world, action.blockKey, action.x1, action.y1, action.x2, action.y2, cfg);
  } else if (action.kind === 'removeRect') {
    tryRemoveRect(world, action.blockKey, action.x1, action.y1, action.x2, action.y2, cfg);
  } else if (action.kind === 'cardChoice') {
    resolveCardOffer(world, action.index, cfg);
  }
}
