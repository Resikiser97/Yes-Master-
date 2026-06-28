/**
 * @file        uiManager.js
 * @module      ui
 * @summary     UI overlay 入口集中器；提供每日商店、抽獎盤與裝備庫存開啟方法
 * @exports     openShop, openGacha, openEquipment
 * @depends     src/ui/shopPanel.js, src/ui/gachaPanel.js, src/ui/equipmentPanel.js
 * @version     v0.0.22.0
 */

import { EquipmentPanel } from './equipmentPanel.js';
import { GachaPanel } from './gachaPanel.js';
import { ShopPanel } from './shopPanel.js';

let shopPanel = null;
let gachaPanel = null;
let equipmentPanel = null;

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

export function openEquipment() {
  equipmentPanel ??= new EquipmentPanel(document.body);
  equipmentPanel.show();
  return equipmentPanel;
}
