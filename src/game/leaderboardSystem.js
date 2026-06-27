/**
 * @file        leaderboardSystem.js
 * @module      game
 * @summary     Supabase 排行榜提交、查詢、玩家排名與賽季稱號計算
 * @exports     submitScore, getLeaderboard, getPlayerRank, getSeasonTitle
 * @depends     config/gameConfig.js、config/seasonConfig.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase F、config/seasonConfig.js
 * @version     v0.0.15.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { SEASON_CONFIG, currentSeasonId } from '../../config/seasonConfig.js';
import { ensureSupabaseUser, getSupabaseClient } from '../net/supabaseClient.js';

function normalizeLimit(limit) {
  return Math.max(1, Math.min(100, Math.floor(Number(limit) || SEASON_CONFIG.leaderboardDefaultLimit)));
}

function normalizeScore(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export async function submitScore(wave, score, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const season = currentSeasonId();
  const nextWave = normalizeScore(wave);
  const nextScore = normalizeScore(score);

  const existing = await supabase
    .from('leaderboard')
    .select('*')
    .eq('user_id', user.id)
    .eq('season', season)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const payload = {
    user_id: user.id,
    season,
    score: Math.max(nextScore, normalizeScore(existing.data?.score)),
    highest_wave: Math.max(nextWave, normalizeScore(existing.data?.highest_wave)),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('leaderboard')
    .upsert(payload, { onConflict: 'user_id,season' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLeaderboard(season = currentSeasonId(), limit = SEASON_CONFIG.leaderboardDefaultLimit, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('season', season)
    .order('score', { ascending: false })
    .order('highest_wave', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(normalizeLimit(limit));
  if (error) throw error;
  return data ?? [];
}

export async function getPlayerRank(userId, season = currentSeasonId(), cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const targetUserId = userId ?? user.id;

  const row = await supabase
    .from('leaderboard')
    .select('*')
    .eq('user_id', targetUserId)
    .eq('season', season)
    .maybeSingle();
  if (row.error) throw row.error;

  const total = await supabase
    .from('leaderboard')
    .select('user_id', { count: 'exact', head: true })
    .eq('season', season);
  if (total.error) throw total.error;

  if (!row.data) return { rank: null, totalPlayers: total.count ?? 0, entry: null, title: getSeasonTitle(null, total.count ?? 0) };

  const score = normalizeScore(row.data.score);
  const highestWave = normalizeScore(row.data.highest_wave);
  const better = await supabase
    .from('leaderboard')
    .select('user_id', { count: 'exact', head: true })
    .eq('season', season)
    .or(`score.gt.${score},and(score.eq.${score},highest_wave.gt.${highestWave})`);
  if (better.error) throw better.error;

  const rank = (better.count ?? 0) + 1;
  const totalPlayers = total.count ?? 0;
  return { rank, totalPlayers, entry: row.data, title: getSeasonTitle(rank, totalPlayers) };
}

export function getSeasonTitle(rank, totalPlayers, cfg = SEASON_CONFIG) {
  if (!rank || !totalPlayers) return cfg.titles.find((title) => title.id === 'none');
  for (const title of cfg.titles) {
    if (title.id === 'none') continue;
    const cutoff = Math.max(1, Math.ceil(totalPlayers * title.topPercent / 100));
    if (rank <= cutoff) return title;
  }
  return cfg.titles.find((title) => title.id === 'none');
}
