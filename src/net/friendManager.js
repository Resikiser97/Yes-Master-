/**
 * @file        friendManager.js
 * @module      net
 * @summary     Supabase friendships 表操作：送出、接受、刪除好友與查詢清單
 * @exports     sendFriendRequest, acceptFriendRequest, removeFriend, listFriends, listPendingRequests
 * @depends     config/gameConfig.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase C
 * @version     v0.0.14.1
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { ensureSupabaseUser, getSupabaseClient } from './supabaseClient.js';

function assertTargetUser(currentUserId, targetUserId) {
  if (!targetUserId) throw new Error('target user id is required');
  if (targetUserId === currentUserId) throw new Error('cannot add yourself as a friend');
}

function friendshipPairFilter(a, b) {
  return `and(user_a.eq.${a},user_b.eq.${b}),and(user_a.eq.${b},user_b.eq.${a})`;
}

export async function sendFriendRequest(targetUserId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
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
  const user = await ensureSupabaseUser(cfg);
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
  const user = await ensureSupabaseUser(cfg);
  assertTargetUser(user.id, userId);

  const first = await supabase.from('friendships').delete().eq('user_a', user.id).eq('user_b', userId);
  if (first.error) throw first.error;
  const second = await supabase.from('friendships').delete().eq('user_a', userId).eq('user_b', user.id);
  if (second.error) throw second.error;
  return { ok: true };
}

export async function listFriends(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPendingRequests(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'pending')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  return {
    received: rows.filter((row) => row.user_b === user.id),
    sent: rows.filter((row) => row.user_a === user.id),
  };
}
