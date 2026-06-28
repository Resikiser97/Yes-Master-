/**
 * @file        uiManager.js
 * @module      ui
 * @summary     UI overlay 入口集中器；提供每日商店與抽獎盤開啟方法
 * @exports     openShop, openGacha
 * @depends     src/ui/shopPanel.js, src/ui/gachaPanel.js
 * @version     v0.0.21.0
 */

import { GachaPanel } from './gachaPanel.js';
import { ShopPanel } from './shopPanel.js';

let shopPanel = null;
let gachaPanel = null;

export function openShop() {
  shopPanel ??= new ShopPanel(document.body);
  shopPanel.show();
  return shopPanel;
}

export function openGacha() {
  gachaPanel ??= new GachaPanel(document.body);
  gachaPanel.show();
  return gachaPanel;
}
