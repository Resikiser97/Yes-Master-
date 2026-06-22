/**
 * @file        main.js
 * @module      bootstrap
 * @summary     MVP 進入點：載入 config、初始化各層、掛上單人/多人模式角標
 * @exports     boot
 * @depends     config/*、src/render/renderer.js、src/input/controls.js
 * @sourceOfTruth Docs/game-architecture-plan.md「MVP 開發範圍」
 * @version     v0.0.2.0
 */

import { GAME_CONFIG } from '../config/gameConfig.js';
import { Renderer } from './render/renderer.js';
import { Controls } from './input/controls.js';

export function boot() {
  const badge = document.getElementById('mode-badge');
  if (badge) badge.textContent = GAME_CONFIG.mode === 'single' ? '單人模式' : '多人模式';

  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = GAME_CONFIG.version;

  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas);
  const controls = new Controls(canvas);

  // TODO：步驟 2~9 依 Docs/claude-codex-worklist.md 接上 game loop。
  // 目前骨架：純邏輯層已可單獨被測試（src/logic/*），渲染/輸入/存檔層待接。
  return { renderer, controls, config: GAME_CONFIG };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', boot);
}
