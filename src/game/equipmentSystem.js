/**
 * @file        equipmentSystem.js
 * @module      game
 * @summary     玩家裝備讀取、升級與六數值加成套用
 * @exports     getEquipment, upgradeEquipment, applyEquipBonus
 * @depends     config/gameConfig.js、config/equipmentConfig.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase D、config/equipmentConfig.js
 * @version     v0.0.19.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS } from '../../config/equipmentConfig.js';
import { ensureSupabaseUser, getSupabaseClient } from '../net/supabaseClient.js';

function defaultEquipment(userId) {
  return EQUIPMENT_SLOTS.reduce((row, slot) => {
    row[`${slot}_level`] = 0;
    return row;
  }, { user_id: userId });
}

function normalizeEquipment(row, userId) {
  return { ...defaultEquipment(userId), ...(row ?? {}) };
}

function assertSlot(slot) {
  if (!EQUIPMENT_CONFIG.slots[slot]) throw new Error(`unknown equipment slot: ${slot}`);
}

export async function getEquipment(userId = null, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const targetUserId = userId ?? user.id;
  const { data, error } = await supabase
    .from('player_equipment')
    .select('*')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return normalizeEquipment(data, targetUserId);
}

export async function upgradeEquipment(userId, slot, cfg = GAME_CONFIG) {
  assertSlot(slot);
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const targetUserId = userId ?? user.id;
  const current = await getEquipment(targetUserId, cfg);
  const levelKey = `${slot}_level`;
  const currentLevel = Math.max(0, Math.floor(Number(current[levelKey]) || 0));
  if (currentLevel >= EQUIPMENT_CONFIG.maxLevel) {
    return { equipment: current, upgraded: false, cost: null };
  }

  const nextLevel = currentLevel + 1;
  const cost = EQUIPMENT_CONFIG.slots[slot].upgradeCosts[currentLevel] ?? {};
  const payload = {
    ...current,
    user_id: targetUserId,
    [levelKey]: nextLevel,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('player_equipment')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return { equipment: normalizeEquipment(data, targetUserId), upgraded: true, cost };
}

export function applyEquipBonus(baseStats = {}, equipment = {}, cfg = EQUIPMENT_CONFIG) {
  const stats = { ...baseStats };
  for (const slot of EQUIPMENT_SLOTS) {
    const def = cfg.slots[slot];
    const level = Math.max(0, Math.floor(Number(equipment[`${slot}_level`] ?? equipment[slot]) || 0));
    const capped = Math.min(level, cfg.maxLevel);
    const bonus = capped * def.bonusPerLevel;
    stats[def.stat] = (stats[def.stat] ?? 0) + bonus;
    if (slot === 'fatigue' && 'fatigueMax' in stats) stats.fatigueMax += bonus;
  }
  return stats;
}
