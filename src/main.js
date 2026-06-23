/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：載入 config、建世界、初始化渲染/輸入、跑固定 timestep loop、掛模式角標
 * @exports     boot
 * @depends     config/gameConfig.js、src/game/world.js、src/game/gameLoop.js、src/render/renderer.js、src/input/controls.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.2.0
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, updateCameraFollow } from './game/world.js';
import { startGameLoop } from './game/gameLoop.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';
import { movePlayer } from './logic/playerMovement.js';
import { updateMining, tryDeposit } from './game/actions.js';

export function boot() {
  const badge = document.getElementById('mode-badge');
  if (badge) badge.textContent = GAME_CONFIG.mode === 'single' ? '單人模式' : '多人模式';
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');
  const world = createWorld(GAME_CONFIG);
  const renderer = new Renderer(canvas, GAME_CONFIG);
  const controls = new Controls(canvas);
  controls.attach();

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
      updateMining(world, controls.isMining(), dt, GAME_CONFIG); // 長按挖最近礦格 → 進背包
      tryDeposit(world);                                         // 站在連通泥土上 → 倒入塔內資源欄
      // TODO(步驟4+)：建造/怪物/晝夜都吃 dt，不吃 frame count。
    },
    render: (alpha) => {
      updateCameraFollow(world, alpha); // 插值 + 跟隨 + 邊界夾取（smooth、不 flicker）
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
