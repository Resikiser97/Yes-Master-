/**
 * @file        renderer.js
 * @module      render（渲染層，非純邏輯）
 * @summary     將遊戲狀態畫到 canvas（含 800x600 視窗對 1600x1000 地圖的鏡頭捲動）
 * @exports     Renderer
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「遊戲內 UI 設計」
 * @version     v0.0.2.0
 *
 * 渲染層只「讀」純邏輯結果畫圖，不得在此寫遊戲規則（鐵則 9）。
 * TODO：步驟 2 實作鏡頭/三維度（背景泥土層 + 前景方塊層）繪製。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.('2d') ?? null;
    this.camera = { x: 0, y: 0 }; // 世界座標左上角
    this.viewport = GAME_CONFIG.map.viewportPx;
  }

  // TODO：依 camera 繪製背景泥土層 → 前景方塊層 → 核心 → 怪物 → UI
  render(/* state */) {}
}
