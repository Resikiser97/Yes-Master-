/**
 * @file        friendManager.js
 * @module      net
 * @summary     Supabase friendships 表操作：送出、接受、刪除好友與查詢清單
 * @exports     sendFriendRequest, acceptFriendRequest, declineFriendRequest, deleteFriend, removeFriend, listFriends, listPendingRequests
 * @depends     config/gameConfig.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase C
 * @version     v0.0.17.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { getSupabaseClient, requireSupabaseUser } from './supabaseClient.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertTargetUser(currentUserId, targetUserId) {
  if (!targetUserId) throw new Error('target user id is required');
  if (targetUserId === currentUserId) throw new Error('cannot add yourself as a friend');
}

function friendshipPairFilter(a, b) {
  return `and(user_a.eq.${a},user_b.eq.${b}),and(user_a.eq.${b},user_b.eq.${a})`;
}

export async function sendFriendRequest(targetUserId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  targetUserId = await resolveTargetUserId(supabase, targetUserId);
  assertTargetUser(user.id, targetUserId);

  const existing = await supabase
    .from('friendships')
    .select('*')
    .or(friendshipPairFilter(user.id, targetUserId))
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data?.status === 'pending' && existing.data.user_a === targetUserId) {
    return acceptFriendRequest(targetUserId, cfg);
  }
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from('friendships')
    .insert({ user_a: user.id, user_b: targetUserId, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function acceptFriendRequest(fromUserId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  assertTargetUser(user.id, fromUserId);

  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_a', fromUserId)
    .eq('user_b', user.id)
    .eq('status', 'pending')
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFriend(userId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  assertTargetUser(user.id, userId);

  const first = await supabase.from('friendships').delete().eq('user_a', user.id).eq('user_b', userId);
  if (first.error) throw first.error;
  const second = await supabase.from('friendships').delete().eq('user_a', userId).eq('user_b', user.id);
  if (second.error) throw second.error;
  return { ok: true };
}

export const declineFriendRequest = removeFriend;
export const deleteFriend = removeFriend;

export async function listFriends(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return hydrateFriendRows(supabase, data ?? [], user.id);
}

export async function listPendingRequests(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'pending')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const hydrated = await hydrateFriendRows(supabase, rows, user.id);
  return {
    received: hydrated.filter((row) => row.user_b === user.id),
    sent: hydrated.filter((row) => row.user_a === user.id),
  };
}

async function resolveTargetUserId(supabase, target) {
  const value = String(target ?? '').trim();
  if (UUID_RE.test(value)) return value;

  const { data, error } = await supabase
    .from('player_profiles')
    .select('user_id')
    .ilike('display_name', value)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error('player not found');
  return data.user_id;
}

async function hydrateFriendRows(supabase, rows, currentUserId) {
  const ids = [...new Set(rows.map((row) => otherUserId(row, currentUserId)).filter(Boolean))];
  if (!ids.length) return rows;

  const { data, error } = await supabase
    .from('player_profiles')
    .select('user_id,display_name,avatar_id')
    .in('user_id', ids);
  if (error) throw error;

  const profiles = new Map((data ?? []).map((profile) => [profile.user_id, profile]));
  return rows.map((row) => {
    const other_user_id = otherUserId(row, currentUserId);
    const profile = profiles.get(other_user_id) ?? null;
    return {
      ...row,
      other_user_id,
      display_name: profile?.display_name ?? shortId(other_user_id),
      avatar_id: profile?.avatar_id ?? null,
    };
  });
}

function otherUserId(row, currentUserId) {
  return row.user_a === currentUserId ? row.user_b : row.user_a;
}

function shortId(userId) {
  return userId ? `${userId.slice(0, 8)}...` : 'Unknown';
}
