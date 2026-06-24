/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：splash 選難度+輸入模式後，動態計算 tilePx、建 renderer/controls、跑固定 timestep loop
 * @exports     boot
 * @depends     config/gameConfig.js、config/testPreset.js、src/game/world.js、src/game/gameLoop.js、
 *              src/render/renderer.js、src/input/controls.js、src/input/touchControls.js、
 *              src/ui/mobileLayout.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.10.0
 *
 * renderer、controls は splash 後に inputMode が確定してから生成。
 * 手機模式：TouchControls + setupOrientationGuard + 動態 tilePx resize。
 * 電腦模式：Controls（鍵盤/滑鼠）+ resize 仍可動態縮放視窗。
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { buildTestConfig } from '../config/testPreset.js';
import { createWorld, updateCameraFollow } from './game/world.js';
import { startGameLoop } from './game/gameLoop.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';
import { TouchControls } from './input/touchControls.js';
import { movePlayer } from './logic/playerMovement.js';
import { updateMining, collectDrops, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, applyDebugAction } from './game/actions.js';
import { updateEnemies, updateCoreCombat } from './game/combatRuntime.js';
import { updatePhase, resolveCardOffer } from './game/phaseRuntime.js';
import { saveWorld, loadWorld } from './storage/saveManager.js';
import { clearSave } from './storage/saveLocal.js';
import { refreshCoreSnapshot } from './game/coreSnapshot.js';
import { showSplashScreen } from './ui/splash.js';
import { applyThreeColumnLayout, setupOrientationGuard } from './ui/mobileLayout.js';

export function boot() {
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');

  showSplashScreen((diffMode, inputMode) => {
    // 1. 確定 cfg
    let cfg = diffMode === 'test' ? buildTestConfig(GAME_CONFIG) : GAME_CONFIG;
    if (inputMode === 'touch') {
      cfg = {
        ...cfg,
        render: { ...cfg.render, drawCanvasHud: false },
        map: { ...cfg.map, viewportPx: { ...cfg.map.viewportPx } },
      };
    }

    // 2. Renderer（手機三欄只縮放 CSS 呈現；遊戲內部仍保留桌面 viewport）
    const renderer = new Renderer(canvas, cfg);
    let touchLayout = null;
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
    if (badge) badge.textContent = diffMode === 'test' ? '測試模式' : (cfg.mode === 'single' ? '單人模式' : '多人模式');

    // 8. World
    const savedWorld = loadWorld(cfg);
    const world = savedWorld ?? createWorld(cfg);

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

    controls.attach();
    if (inputMode === 'touch') controls.updateLayout?.(touchLayout);

    // 9. ⚙ Debug 按鈕（keyboard 和 touch 都顯示）
    if (cfg.debug?.hotkeys) {
      const debugBtn = document.createElement('button');
      debugBtn.id = 'debug-gear-btn';
      debugBtn.textContent = '⚙';
      debugBtn.title = 'Toggle debug overlay';
      debugBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:300;width:34px;height:34px;background:rgba(10,16,24,0.82);border:1px solid rgba(255,180,0,0.5);color:#f0b020;font-size:16px;cursor:pointer;padding:0;';
      debugBtn.addEventListener('click', () => {
        world.showDebug = !world.showDebug;
        // touch 模式下同步切換 HTML debug 面板
        const panel = document.getElementById('debug-panel-touch');
        if (panel) panel.style.display = world.showDebug ? 'block' : 'none';
      });
      if (inputMode === 'touch') {
        controls.mountDebugButton?.(debugBtn);
      } else {
        document.body.appendChild(debugBtn);
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

    const loop = startGameLoop({
      update: (dt) => {
        world.clock.elapsedSeconds += dt;
        world.clock.updateTick += 1;
        const prevX = world.player.x, prevY = world.player.y;
        world.player = movePlayer(world.player, controls.getMoveVector(), dt, {
          minX: 0,
          maxX: world.cols - 1,
          minY: 0,
          maxY: world.groundY - 1,
        }, cfg);
        world.player.prevX = prevX;
        world.player.prevY = prevY;

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
        if (slot != null && !selectedBlock) controls.setSelectedSlot(null);
        world.selectedBlock = selectedBlock ?? null;
        world.buildPreview = computeBuildPreview(world, selectedBlock, tileX, tileY, cfg);

        if (controls.consumePlace() && selectedBlock) tryPlace(world, selectedBlock, tileX, tileY, cfg);
        if (controls.consumeRemove()) tryRemove(world, tileX, tileY, cfg);
        for (const action of controls.consumeDebugActions()) applyDebugAction(world, action, cfg);
        if (selectedBlock && !(world.storage[selectedBlock] > 0)) controls.setSelectedSlot(null);

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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
