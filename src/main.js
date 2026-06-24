/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：載入 config、建世界、初始化渲染/輸入、跑固定 timestep loop、掛模式角標
 * @exports     boot
 * @depends     config/gameConfig.js、src/game/world.js、src/game/gameLoop.js、src/render/renderer.js、src/input/controls.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.5.0
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, updateCameraFollow } from './game/world.js';
import { startGameLoop } from './game/gameLoop.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';
import { movePlayer } from './logic/playerMovement.js';
import { updateMining, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, applyDebugAction } from './game/actions.js';
import { updateEnemies, updateCoreCombat } from './game/combatRuntime.js';
import { updatePhase, resolveCardOffer } from './game/phaseRuntime.js';
import { saveWorld, loadWorld } from './storage/saveManager.js';
import { clearSave } from './storage/saveLocal.js';
import { showSplashScreen } from './ui/splash.js';

export function boot() {
  const badge = document.getElementById('mode-badge');
  if (badge) badge.textContent = GAME_CONFIG.mode === 'single' ? '單人模式' : '多人模式';
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');
  const savedWorld = loadWorld(GAME_CONFIG);
  const world = savedWorld ?? createWorld(GAME_CONFIG);
  if (!savedWorld) { world.firstGame = true; world.tutorialTimer = 6; }
  const renderer = new Renderer(canvas, GAME_CONFIG);
  const controls = new Controls(canvas, { hotbarSlots: GAME_CONFIG.hotbar.length });

  // Debug X 鍵：清除存檔並重新整理（恢復新局）
  if (GAME_CONFIG.debug?.hotkeys) {
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'x' || e.key === 'X') && !e.repeat) {
        clearSave();
        window.location.reload();
      }
    });
  }

  showSplashScreen(() => {
    controls.attach();

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
        }, GAME_CONFIG);
        world.player.prevX = prevX;
        world.player.prevY = prevY;

        const t = GAME_CONFIG.render.tilePx;
        const tileX = Math.floor((controls.mouse.x + world.camera.x) / t);
        const tileY = Math.floor((controls.mouse.y + world.camera.y) / t);
        const slot = controls.getSelectedSlot();
        const selectedBlock = slot != null ? GAME_CONFIG.hotbar[slot] : null;
        if (slot != null && !selectedBlock) controls.setSelectedSlot(null);
        world.selectedBlock = selectedBlock ?? null;
        world.buildPreview = computeBuildPreview(world, selectedBlock, tileX, tileY, GAME_CONFIG);

        if (controls.consumePlace() && selectedBlock) tryPlace(world, selectedBlock, tileX, tileY, GAME_CONFIG);
        if (controls.consumeRemove()) tryRemove(world, tileX, tileY, GAME_CONFIG);
        for (const action of controls.consumeDebugActions()) applyDebugAction(world, action, GAME_CONFIG);
        if (selectedBlock && !(world.storage[selectedBlock] > 0)) controls.setSelectedSlot(null);

        controls.cardOfferMode = (world.phase === 'cardOffer');
        controls.cardOfferRects = world.cardOfferRects ?? null;
        if (world.phase === 'cardOffer') {
          const cardChoice = controls.consumeCardChoice();
          if (cardChoice != null) resolveCardOffer(world, cardChoice, GAME_CONFIG);
        }

        updateMining(world, controls.isMining(), dt, GAME_CONFIG);
        updateRepair(world, controls.isRepairing(), dt, GAME_CONFIG);
        updatePhase(world, dt, GAME_CONFIG);
        updateEnemies(world, dt);
        updateCoreCombat(world, dt, GAME_CONFIG);
        tryDeposit(world);

        if (prevPhase !== 'prep' && world.phase === 'prep') saveWorld(world);
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
      world, renderer, controls, loop, config: GAME_CONFIG,
      stop: () => { controls.detach(); loop.stop(); },
    };
    if (typeof window !== 'undefined') window.__YES_MASTER__ = app;
  });

  return null; // app 在 splash 點擊後才初始化
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
