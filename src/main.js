/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：splash 選難度+輸入模式後，動態計算 tilePx、建 renderer/controls、跑固定 timestep loop
 * @exports     boot
 * @depends     config/gameConfig.js、config/testPreset.js、src/game/world.js、src/game/gameLoop.js、
 *              src/render/renderer.js、src/input/controls.js、src/input/touchControls.js、
 *              src/ui/mobileLayout.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.13.0
 *
 * renderer、controls は splash 後に inputMode が確定してから生成。
 * 手機模式：TouchControls + setupOrientationGuard + 動態 tilePx resize。
 * 電腦模式：Controls（鍵盤/滑鼠）+ resize 仍可動態縮放視窗。
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { BLOCKS } from '../config/blocks.js';
import { buildTestConfig } from '../config/testPreset.js';
import { createWorld, updateCameraFollow } from './game/world.js';
import { startGameLoop } from './game/gameLoop.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';
import { TouchControls } from './input/touchControls.js';
import { movePlayer } from './logic/playerMovement.js';
import { updateMining, collectDrops, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, applyDebugAction, toggleBuildPlanMode, tryPlaceRect, tryRemoveRect, previewPlaceRect } from './game/actions.js';
import { updateEnemies, updateCoreCombat } from './game/combatRuntime.js';
import { updatePhase, resolveCardOffer } from './game/phaseRuntime.js';
import { saveWorld, loadWorld } from './storage/saveManager.js';
import { clearSave } from './storage/saveLocal.js';
import { refreshCoreSnapshot } from './game/coreSnapshot.js';
import { showSplashScreen } from './ui/splash.js';
import { applyThreeColumnLayout, setupOrientationGuard } from './ui/mobileLayout.js';
import { applyUiClick, ensureUiState } from './ui/uiState.js';
import { loadImages } from './render/imageLoader.js';
import { SPRITE_SHEETS } from '../config/sprites.js';
import { parseNetLaunch, createNetSession } from './net/netSession.js';
import { createInputBuffer, serializeControls } from './net/inputBuffer.js';
import { createHostSyncScheduler, createClientSyncApplier } from './net/syncScheduler.js';

export function boot() {
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');

  showSplashScreen((diffMode, inputMode) => {
    // 1. 確定 cfg
    let cfg = diffMode === 'test' ? buildTestConfig(GAME_CONFIG) : GAME_CONFIG;
    const netLaunch = parseNetLaunch();
    if (netLaunch.mode === 'multi') {
      cfg = {
        ...cfg,
        mode: 'multi',
        net: { ...cfg.net, roomId: netLaunch.roomId, role: netLaunch.role },
      };
    }
    if (inputMode === 'touch') {
      cfg = {
        ...cfg,
        render: { ...cfg.render, drawCanvasHud: false },
        map: { ...cfg.map, viewportPx: { ...cfg.map.viewportPx } },
      };
    }
    if (versionEl) versionEl.style.display = inputMode === 'touch' ? '' : 'none';

    // 2. Renderer（手機三欄保留原始 viewport，再由 CSS 裁切放大呈現）
    let touchLayout = null;
    const renderer = new Renderer(canvas, cfg);
    if (inputMode === 'touch') {
      touchLayout = applyThreeColumnLayout(cfg, canvas);
    }

    // 3. 輸入器
    const controls = inputMode === 'touch'
      ? new TouchControls(canvas, cfg)
      : new Controls(canvas, { hotbarSlots: cfg.hotbar.length });

    // 4. 手機：直向警告 + resize 監聽（地址欄收起/展開也會觸發）
    if (inputMode === 'touch') {
      setupOrientationGuard();
      const onResize = () => {
        renderer.resize(cfg);
        touchLayout = applyThreeColumnLayout(cfg, canvas);
        controls.updateLayout?.(touchLayout);
      };
      window.visualViewport?.addEventListener('resize', onResize);
      window.addEventListener('resize', onResize);
      window.scrollTo(0, 1);
    }

    // 7. badge
    const badge = document.getElementById('mode-badge');
    if (badge) {
      badge.textContent = diffMode === 'test' ? '測試模式' : (cfg.mode === 'single' ? '單人模式' : '多人模式');
      badge.style.display = inputMode === 'touch' ? '' : 'none';
    }

    // 8. World
    const savedWorld = netLaunch.role === 'client' ? null : loadWorld(cfg);
    let world = savedWorld ?? createWorld(cfg);
    world.roomId = netLaunch.roomId ?? null;
    ensureUiState(world);
    world.uiHitRects ??= [];

    if (!savedWorld) {
      world.firstGame = true;
      world.tutorialTimer = 6;
      if (diffMode === 'test' && cfg._testInit) {
        Object.assign(world.cardBonuses, cfg._testInit.cardBonuses ?? {});
        Object.assign(world.storage, cfg._testInit.storage ?? {});
        refreshCoreSnapshot(world);
      }
    }
    world.testMode = (diffMode === 'test');
    const worldRef = { current: world };

    controls.attach();
    if (inputMode === 'touch') controls.updateLayout?.(touchLayout);

    // 非同步載入 sprite 圖示（不阻塞遊戲啟動，載入完成後注入）
    loadImages({
      blocksNoFrame:   SPRITE_SHEETS.blocksNoFrame.src,
      blocksSlotFrame: SPRITE_SHEETS.blocksSlotFrame.src,
    }).then((imgs) => {
      renderer.setSprites(imgs);
      if (inputMode === 'touch') controls.setSprites?.(imgs);
    }).catch((err) => console.warn('[sprites] 圖示載入失敗', err));

    // 9. ⚙ Debug 按鈕（keyboard 和 touch 都顯示）
    if (cfg.debug?.hotkeys) {
      const debugBtn = document.createElement('button');
      debugBtn.id = 'debug-gear-btn';
      debugBtn.textContent = '⚙';
      debugBtn.title = 'Toggle debug overlay';
      debugBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:300;width:34px;height:34px;background:rgba(10,16,24,0.82);border:1px solid rgba(255,180,0,0.5);color:#f0b020;font-size:16px;cursor:pointer;padding:0;';
      const toggleDebug = (e) => {
        e.preventDefault();
        e.stopPropagation();
        world.showDebug = !world.showDebug;
        const panel = document.getElementById('debug-panel-touch');
        if (panel) panel.style.display = world.showDebug ? 'block' : 'none';
      };
      debugBtn.addEventListener('pointerdown', toggleDebug);
      debugBtn.addEventListener('touchstart', toggleDebug, { passive: false });
      if (inputMode === 'touch') {
        controls.mountDebugButton?.(debugBtn);
      } else {
        const stage = document.getElementById('stage');
        debugBtn.style.position = 'absolute';
        debugBtn.style.top = '8px';
        debugBtn.style.right = 'auto';
        debugBtn.style.left = `${cfg.map.viewportPx.width - 42}px`;
        (stage ?? document.body).appendChild(debugBtn);
      }
    }

    // 10. ` 鍵切換 debug 浮層；X 鍵清除存檔後重整（keyboard 模式 debug.hotkeys 才掛）
    if (cfg.debug?.hotkeys) {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.key === 'x' || e.key === 'X') {
          clearSave(cfg.save.storageKey);
          window.location.reload();
        }
        if (e.code === 'Backquote') {
          world.showDebug = !world.showDebug;
          e.preventDefault();
        }
      });
    }
    let lastRenderMs = 0;
    let prevPhase = world.phase;
    let netSession = null;
    let inputBuffer = null;
    let hostSync = null;
    let clientSync = null;
    let inputSequenceId = 0;

    if (cfg.mode === 'multi' && netLaunch.roomId) {
      if (netLaunch.role === 'host') {
        inputBuffer = createInputBuffer({ cfg });
        createNetSession({
          cfg,
          role: 'host',
          roomId: netLaunch.roomId,
          world,
          onInput: (playerId, input) => inputBuffer.push(playerId, input),
          onPeerReady: (peerId) => hostSync?.sendSnapshotTo(peerId, world),
        }).then((session) => {
          netSession = session;
          hostSync = createHostSyncScheduler({ session });
          console.info('[net] host ready', session.peerId);
        }).catch((err) => console.warn('[net] host start failed', err));
      } else {
        clientSync = createClientSyncApplier({ worldRef, cfg });
        createNetSession({
          cfg,
          role: 'client',
          roomId: netLaunch.roomId,
          world,
          onMessage: (message) => {
            if (clientSync?.handle(message)) {
              world = worldRef.current;
              prevPhase = world.phase;
            }
          },
        }).then((session) => {
          netSession = session;
          console.info('[net] client ready', session.slotId);
        }).catch((err) => console.warn('[net] client start failed', err));
      }
    } else if (cfg.mode === 'multi') {
      console.warn('[net] missing room id; use ?mode=multi&role=host|client&room=ROOM_ID');
    }

    const consumeDebugActions = () => {
      for (const action of controls.consumeDebugActions()) {
        if (action === 'resetSave') {
          clearSave(cfg.save.storageKey);
          window.location.reload();
          return false;
        }
        applyDebugAction(world, action, cfg);
      }
      return true;
    };

    const loop = startGameLoop({
      update: (dt) => {
        if (worldRef.current !== world) world = worldRef.current;

        if (cfg.mode === 'multi' && netLaunch.role === 'client') {
          syncLocalInputUi({ controls, renderer, world, cfg, inputMode });
          const debugActions = controls.consumeDebugActions()
            .filter((action) => action !== 'resetSave');
          if (netSession?.sendInput) {
            netSession.sendInput(serializeControls(controls, world, cfg, inputSequenceId++, { debugActions }));
          }
          return;
        }

        if (!consumeDebugActions()) return;
        if (world.debugPaused) return;

        world.clock.elapsedSeconds += dt;
        world.clock.updateTick += 1;
        world.syncTick = (world.syncTick ?? 0) + 1;
        const prevX = world.player.x, prevY = world.player.y;
        world.player = movePlayer(world.player, controls.getMoveVector(), dt, {
          minX: 0,
          maxX: world.cols - 1,
          minY: 0,
          maxY: world.groundY - 1,
        }, cfg);
        world.player.prevX = prevX;
        world.player.prevY = prevY;
        inputBuffer?.drain(world, dt, (playerId, reason) => {
          netSession?.sendTo?.(playerId, { type: 'reject', payload: { reason } });
        });

        const t = cfg.render.tilePx;

        // 手機模式：mouse 跟著玩家 + placeOffset，供 build preview / 放置 / 拆除定位
        if (inputMode === 'touch') {
          const off = controls.placeOffset ?? { dx: 0, dy: 0 };
          controls.mouse.x = (world.player.x + off.dx) * t - world.camera.x;
          controls.mouse.y = (world.player.y + off.dy) * t - world.camera.y;
          controls.updateStatus?.(world);
        }

        const tileX = Math.floor((controls.mouse.x + world.camera.x) / t);
        const tileY = Math.floor((controls.mouse.y + world.camera.y) / t);
        const slot = controls.getSelectedSlot();
        const selectedBlock = slot != null ? cfg.hotbar[slot] : null;
        if (slot != null && !selectedBlock) {
          // 背包格（最後一格，鍵 0）：目前無效果，預留給背包 UI
          controls.setSelectedSlot(null);
        }
        world.selectedBlock = selectedBlock ?? null;
        world.buildPreview = computeBuildPreview(world, selectedBlock, tileX, tileY, cfg);

        // Build Plan / Destroy Mode toggle
        if (controls.consumeBuildPlanToggle()) {
          toggleBuildPlanMode(world);
          if (world.buildPlanMode) world.buildDestroyMode = false;
        }
        if (controls.consumeDestroyToggle()) {
          if (world.buildPlanMode) {
            world.buildDestroyMode = !world.buildDestroyMode;
          }
        }
        controls.buildPlanMode = world.buildPlanMode;
        controls.buildDestroyMode = world.buildDestroyMode;
        controls.viewport = renderer.viewport;
        controls.uiHitRects = world.uiHitRects ?? [];

        applyUiClick(world, controls.consumeUiClick?.());

        // Sync drag preview to world for renderer
        if ((world.buildPlanMode || world.buildDestroyMode) && controls.dragging && controls.dragStart) {
          const sx = Math.floor((controls.dragStart.px + world.camera.x) / t);
          const sy = Math.floor((controls.dragStart.py + world.camera.y) / t);
          const ex = Math.floor((controls.mouse.x + world.camera.x) / t);
          const ey = Math.floor((controls.mouse.y + world.camera.y) / t);
          world.buildPlanDrag = { startX: sx, startY: sy, endX: ex, endY: ey };
          if (!world.buildDestroyMode && selectedBlock) {
            world.buildPlanDragPreview = previewPlaceRect(world, selectedBlock, sx, sy, ex, ey, cfg);
          } else {
            world.buildPlanDragPreview = null;
          }
        } else {
          world.buildPlanDrag = null;
          world.buildPlanDragPreview = null;
        }

        // Build Plan / Destroy Mode drag rect
        const dragRect = controls.consumeDragRect();
        if (dragRect && world.buildPlanMode && selectedBlock) {
          const tx1 = Math.floor((dragRect.startPx + world.camera.x) / t);
          const ty1 = Math.floor((dragRect.startPy + world.camera.y) / t);
          const tx2 = Math.floor((dragRect.endPx + world.camera.x) / t);
          const ty2 = Math.floor((dragRect.endPy + world.camera.y) / t);
          if (world.buildDestroyMode) {
            tryRemoveRect(world, selectedBlock, tx1, ty1, tx2, ty2, cfg);
          } else {
            tryPlaceRect(world, selectedBlock, tx1, ty1, tx2, ty2, cfg);
          }
        }

        // 一般放置/拆除
        if (controls.consumePlace() && selectedBlock) {
          if (world.buildPlanMode && !world.buildDestroyMode) {
            tryPlaceRect(world, selectedBlock, tileX, tileY, tileX, tileY, cfg);
          } else if (!world.buildPlanMode) {
            tryPlace(world, selectedBlock, tileX, tileY, cfg);
          }
        }
        if (controls.consumeRemove()) tryRemove(world, tileX, tileY, cfg);
        if (selectedBlock && !BLOCKS[selectedBlock]?.infinite && !(world.storage[selectedBlock] > 0)) controls.setSelectedSlot(null);

        controls.cardOfferMode = (world.phase === 'cardOffer');
        controls.cardOfferRects = world.cardOfferRects ?? null;
        if (world.phase === 'cardOffer') {
          const cardChoice = controls.consumeCardChoice();
          if (cardChoice != null) resolveCardOffer(world, cardChoice, cfg);
        }

        updateMining(world, controls.isMining(), dt, cfg);
        collectDrops(world, cfg);
        updateRepair(world, controls.isRepairing(), dt, cfg);
        updatePhase(world, dt, cfg);
        updateEnemies(world, dt);
        updateCoreCombat(world, dt, cfg);
        tryDeposit(world);

        // cardOffer hover（僅鍵盤/滑鼠模式有意義）
        if (world.phase === 'cardOffer' && world.cardOfferRects?.length) {
          const mx = controls.mouse.x, my = controls.mouse.y;
          world.cardHoverIndex = world.cardOfferRects.findIndex(
            r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
          );
          if (world.cardHoverIndex === -1) world.cardHoverIndex = null;
        } else {
          world.cardHoverIndex = null;
        }

        if (prevPhase !== 'prep' && world.phase === 'prep') saveWorld(world, cfg);
        if (world.firstGame && prevPhase !== 'night' && world.phase === 'night') world.tutorialTimer = 6;
        if (world.firstGame && world.tutorialTimer > 0) world.tutorialTimer = Math.max(0, world.tutorialTimer - dt);
        prevPhase = world.phase;
        hostSync?.afterHostTick(world);
      },
      render: (alpha) => {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const renderDt = lastRenderMs ? (now - lastRenderMs) / 1000 : 0;
        lastRenderMs = now;
        updateCameraFollow(world, alpha, renderDt);
        renderer.render(world);
      },
    });

    const app = {
      world, renderer, controls, loop, config: cfg,
      stop: () => { controls.detach(); loop.stop(); },
    };
    if (typeof window !== 'undefined') window.__YES_MASTER__ = app;
  });

  return null; // app 在 splash 按鈕點擊後才初始化
}

function syncLocalInputUi({ controls, renderer, world, cfg, inputMode }) {
  const t = cfg.render.tilePx;
  const localPlayer = world.players?.get(world.localPlayerId) ?? world.player;

  if (inputMode === 'touch' && localPlayer) {
    const off = controls.placeOffset ?? { dx: 0, dy: 0 };
    controls.mouse.x = (localPlayer.x + off.dx) * t - world.camera.x;
    controls.mouse.y = (localPlayer.y + off.dy) * t - world.camera.y;
  }

  const tileX = Math.floor((controls.mouse.x + world.camera.x) / t);
  const tileY = Math.floor((controls.mouse.y + world.camera.y) / t);
  const slot = controls.getSelectedSlot?.();
  const selectedBlock = slot != null ? cfg.hotbar[slot] : null;
  if (slot != null && !selectedBlock) controls.setSelectedSlot?.(null);

  world.selectedBlock = selectedBlock ?? null;
  world.buildPreview = computeBuildPreview(world, selectedBlock, tileX, tileY, cfg, world.localPlayerId);
  controls.cardOfferMode = (world.phase === 'cardOffer');
  controls.cardOfferRects = world.cardOfferRects ?? null;
  controls.buildPlanMode = world.buildPlanMode;
  controls.buildDestroyMode = world.buildDestroyMode;
  controls.viewport = renderer.viewport;
  controls.uiHitRects = world.uiHitRects ?? [];
  applyUiClick(world, controls.consumeUiClick?.());

  if ((world.buildPlanMode || world.buildDestroyMode) && controls.dragging && controls.dragStart) {
    const sx = Math.floor((controls.dragStart.px + world.camera.x) / t);
    const sy = Math.floor((controls.dragStart.py + world.camera.y) / t);
    const ex = Math.floor((controls.mouse.x + world.camera.x) / t);
    const ey = Math.floor((controls.mouse.y + world.camera.y) / t);
    world.buildPlanDrag = { startX: sx, startY: sy, endX: ex, endY: ey };
    world.buildPlanDragPreview = (!world.buildDestroyMode && selectedBlock)
      ? previewPlaceRect(world, selectedBlock, sx, sy, ex, ey, cfg)
      : null;
  } else {
    world.buildPlanDrag = null;
    world.buildPlanDragPreview = null;
  }

  if (inputMode === 'touch') controls.updateStatus?.(world);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
