/**
 * @file        uiManager.js
 * @module      ui
 * @summary     UI overlay 入口集中器；提供每日商店、抽獎盤、裝備庫存、技能點與裝備合成開啟方法
 * @exports     openShop, openGacha, openEquipment, openSkills, openSynthesis
 * @depends     src/ui/shopPanel.js, src/ui/gachaPanel.js, src/ui/equipmentPanel.js, src/ui/skillPanel.js, src/ui/synthesisPanel.js
 * @version     v0.0.26.0
 */

import { EquipmentPanel } from './equipmentPanel.js';
import { GachaPanel } from './gachaPanel.js';
import { ShopPanel } from './shopPanel.js';
import { SkillPanel } from './skillPanel.js';
import { SynthesisPanel } from './synthesisPanel.js';

let shopPanel = null;
let gachaPanel = null;
let equipmentPanel = null;
let skillPanel = null;
let synthesisPanel = null;

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

export function openSkills() {
  skillPanel ??= new SkillPanel(document.body);
  skillPanel.show();
  return skillPanel;
}

export function openSynthesis() {
  synthesisPanel ??= new SynthesisPanel(document.body);
  synthesisPanel.show();
  return synthesisPanel;
}
