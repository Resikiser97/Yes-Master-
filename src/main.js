/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：載入 config、建世界、初始化渲染/輸入、跑固定 timestep loop、掛模式角標
 * @exports     boot
 * @depends     config/gameConfig.js、src/game/world.js、src/game/gameLoop.js、src/render/renderer.js、src/input/controls.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.3.0
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, updateCameraFollow } from './game/world.js';
import { startGameLoop } from './game/gameLoop.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';
import { movePlayer } from './logic/playerMovement.js';
import { updateMining, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, applyDebugAction } from './game/actions.js';
import { updateEnemies, updateCoreCombat } from './game/combatRuntime.js';
import { updatePhase } from './game/phaseRuntime.js';

export function boot() {
  const badge = document.getElementById('mode-badge');
  if (badge) badge.textContent = GAME_CONFIG.mode === 'single' ? '單人模式' : '多人模式';
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');
  const world = createWorld(GAME_CONFIG);
  const renderer = new Renderer(canvas, GAME_CONFIG);
  const controls = new Controls(canvas, { hotbarSlots: GAME_CONFIG.hotbar.length });
  controls.attach();

  let lastRenderMs = 0; // 上一次 render 時間戳（算 frame dt 給鏡頭平滑用）
  const loop = startGameLoop({
    update: (dt) => {
      world.clock.elapsedSeconds += dt;
      world.clock.updateTick += 1;
      const prevX = world.player.x, prevY = world.player.y; // 渲染插值用：本步起點
      world.player = movePlayer(world.player, controls.getMoveVector(), dt, {
        minX: 0,
        maxX: world.cols - 1,
        minY: 0,
        maxY: world.groundY - 1,
      }, GAME_CONFIG);
      world.player.prevX = prevX;
      world.player.prevY = prevY;

      // 建造：滑鼠 canvas 座標 + 鏡頭 → 目標格
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
      // 材料用完 → 自動退出該方塊的建造模式
      if (selectedBlock && !(world.storage[selectedBlock] > 0)) controls.setSelectedSlot(null);

      updateMining(world, controls.isMining(), dt, GAME_CONFIG); // 長按挖最近礦格 → 進背包（僅挖礦模式）
      updateRepair(world, controls.isRepairing(), dt, GAME_CONFIG); // R 長按：站核心/連通地基上消耗疲勞修復核心
      updatePhase(world, dt, GAME_CONFIG);                           // 晝夜狀態機 + 分批出怪（Step 7）
      updateEnemies(world, dt);                                      // 怪物移動 + 攻擊核心（Step 7 後改追核心）
      updateCoreCombat(world, dt, GAME_CONFIG);                      // 核心普攻/連鎖打敵人
      tryDeposit(world);                                         // 站在連通泥土上 → 倒入塔內資源欄
      // TODO(步驟7+)：怪物/晝夜/戰鬥都吃 dt，不吃 frame count。
    },
    render: (alpha) => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const renderDt = lastRenderMs ? (now - lastRenderMs) / 1000 : 0;
      lastRenderMs = now;
      updateCameraFollow(world, alpha, renderDt); // 插值 + deadzone + 平滑 + 邊界夾取
      renderer.render(world);
    },
  });

  const app = {
    world,
    renderer,
    controls,
    loop,
    config: GAME_CONFIG,
    stop: () => {
      controls.detach();
      loop.stop();
    },
  };
  if (typeof window !== 'undefined') window.__YES_MASTER__ = app;
  return app;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
