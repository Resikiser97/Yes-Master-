/**
 * @file        controls.js
 * @module      input（輸入層，非純邏輯）
 * @summary     把玩家操作（WASD 移動、滑鼠點擊/長按挖礦、放置）轉成資料事件
 * @exports     Controls
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」
 * @version     v0.0.2.0
 *
 * 輸入層只把操作「轉成資料」丟給純邏輯，不在此做規則判定（鐵則 9）。
 * TODO：步驟 3 實作 WASD + 滑鼠點擊(10/s)/長按(5/s) 挖最近方塊。
 */

export class Controls {
  constructor(target) {
    this.target = target;
    this.handlers = {};
  }

  on(event, fn) { this.handlers[event] = fn; }

  // TODO：bind keydown/keyup/mouse；emit { type:'move', dir } / { type:'mine', ... } 等資料事件
  attach() {}
  detach() {}
}
