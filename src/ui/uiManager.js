/**
 * @file        uiManager.js
 * @module      ui
 * @summary     UI overlay 入口集中器；提供每日商店開啟方法
 * @exports     openShop
 * @depends     src/ui/shopPanel.js
 * @version     v0.0.20.0
 */

import { ShopPanel } from './shopPanel.js';

let shopPanel = null;

export function openShop() {
  shopPanel ??= new ShopPanel(document.body);
  shopPanel.show();
  return shopPanel;
}
