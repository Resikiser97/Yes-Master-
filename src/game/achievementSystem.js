/**
 * @file        achievementSystem.js
 * @module      game
 * @summary     成就條件檢查純邏輯與 Supabase 解鎖寫入
 * @exports     checkAchievements, unlockAchievement
 * @depends     config/gameConfig.js、config/achievements.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase E、config/achievements.js
 * @version     v0.0.15.0
 */

import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../../config/achievements.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { ensureSupabaseUser, getSupabaseClient } from '../net/supabaseClient.js';

function unlockedIds(profile = {}) {
  const ids = profile.unlockedAchievements ?? profile.achievements ?? [];
  return new Set(ids.map((item) => (typeof item === 'string' ? item : item.achievement_id ?? item.id)));
}

function metricValue(metric, world = {}, profile = {}) {
  const stats = profile.stats ?? {};
  const direct = profile[metric] ?? stats[metric] ?? world[metric];
  if (direct !== undefined) return Number(direct) || 0;
  if (metric === 'highestWave') return Math.max(Number(profile.highestWave) || 0, Number(world.stage) || 0);
  if (metric === 'friendCount') return Number(profile.friendCount ?? profile.friends?.length) || 0;
  return 0;
}

function passesCondition(condition, world, profile) {
  const value = metricValue(condition.metric, world, profile);
  if (condition.op === 'gte') return value >= condition.value;
  if (condition.op === 'gt') return value > condition.value;
  if (condition.op === 'eq') return value === condition.value;
  return false;
}

export function checkAchievements(world = {}, profile = {}, definitions = ACHIEVEMENTS) {
  const unlocked = unlockedIds(profile);
  return definitions.filter((achievement) => {
    if (unlocked.has(achievement.id)) return false;
    return passesCondition(achievement.condition, world, profile);
  });
}

export async function unlockAchievement(userId, achievementId, cfg = GAME_CONFIG) {
  if (!ACHIEVEMENT_BY_ID[achievementId]) throw new Error(`unknown achievement: ${achievementId}`);
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const targetUserId = userId ?? user.id;
  const { data, error } = await supabase
    .from('player_achievements')
    .upsert({ user_id: targetUserId, achievement_id: achievementId }, { onConflict: 'user_id,achievement_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
