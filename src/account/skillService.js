/**
 * @file        skillService.js
 * @module      account
 * @summary     技能等級唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 *              注意：本檔儲存「玩家投資的技能等級」，不負責套用屬性加成到 gameplay。
 *              正式後端上線時不信任 localStorage 數值，不會遷移。
 * @exports     skillService
 * @depends     config/economyConfig.js, config/gameConfig.js
 * @version     v0.0.23.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';

export const skillService = {
  getLevels,
  getLevel,
  setLevel,
  resetSkills,
  getUpgradeCost,
  canUpgrade,
};

function getLevels() {
  const raw = readJson(ECONOMY.skills.storageKey, {});
  const source = isPlainObject(raw) ? raw : {};
  const levels = defaultLevels();
  const maxLevel = getMaxLevel();

  for (const attribute of getAttributes()) {
    const level = Number(source[attribute.key]);
    if (Number.isInteger(level) && level >= 0 && level <= maxLevel) {
      levels[attribute.key] = level;
    }
  }

  if (!isPlainObject(raw) || JSON.stringify(raw) !== JSON.stringify(levels)) {
    writeJson(ECONOMY.skills.storageKey, levels);
  }

  return levels;
}

function getLevel(key) {
  if (!isValidSkillKey(key)) return 0;
  return getLevels()[key] ?? 0;
}

function setLevel(key, level) {
  if (!isValidSkillKey(key)) {
    console.warn('SKILL_INVALID_KEY', key);
    return;
  }

  const nextLevel = Number(level);
  if (!Number.isInteger(nextLevel) || nextLevel < 0 || nextLevel > getMaxLevel()) {
    console.warn('SKILL_INVALID_LEVEL', { key, level });
    return;
  }

  const levels = getLevels();
  levels[key] = nextLevel;
  writeJson(ECONOMY.skills.storageKey, levels);
}

function resetSkills() {
  writeJson(ECONOMY.skills.storageKey, defaultLevels());
}

function getUpgradeCost(key) {
  if (!isValidSkillKey(key)) return null;

  const level = getLevel(key);
  if (level >= getMaxLevel()) return null;

  const cost = ECONOMY.skillGoldCost[level];
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return null;
  return cost;
}

function canUpgrade(key, wallet) {
  const cost = getUpgradeCost(key);
  if (cost === null) return false;
  return (wallet?.gold ?? 0) >= cost;
}

function defaultLevels() {
  return getAttributes().reduce((levels, attribute) => {
    levels[attribute.key] = 0;
    return levels;
  }, {});
}

function getAttributes() {
  return Array.isArray(ECONOMY.skills?.attributes) ? ECONOMY.skills.attributes : [];
}

function getMaxLevel() {
  const maxLevel = Number(GAME_CONFIG.skill?.maxLevel);
  return Number.isInteger(maxLevel) && maxLevel >= 0 ? maxLevel : 0;
}

function isValidSkillKey(key) {
  return getAttributes().some((attribute) => attribute.key === key);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}
