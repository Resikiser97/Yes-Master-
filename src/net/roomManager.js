/**
 * @file roomManager.js
 * @module net
 * @summary Supabase room helpers used by the PeerJS session layer.
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { ensureSupabaseUser, getSupabaseClient } from './supabaseClient.js';

function roomId() {
  return crypto?.randomUUID?.() ?? `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function listRooms(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function createRoom({ name = 'Room', room_id = roomId(), maxPlayers = 4 } = {}, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const row = {
    room_id,
    name,
    status: 'active',
    max_players: maxPlayers,
    current_host_uid: user.id,
    host_epoch: 1,
  };
  const { data, error } = await supabase.from('rooms').insert(row).select().single();
  if (error) throw error;
  await upsertMembership({ room_id, user_id: user.id, slot_id: 'p1', is_host: true, join_order: 0 }, cfg);
  return data;
}

export async function joinRoom(room_id, cfg = GAME_CONFIG) {
  const user = await ensureSupabaseUser(cfg);
  const member = await upsertMembership({ room_id, user_id: user.id, is_host: false }, cfg);
  return { room_id, user, membership: member };
}

export async function leaveRoom(room_id, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const { error } = await supabase
    .from('room_memberships')
    .update({ online: false, disconnected_at: new Date().toISOString() })
    .eq('room_id', room_id)
    .eq('user_id', user.id);
  if (error) throw error;
  return { ok: true };
}

export async function getRoom(room_id, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase.from('rooms').select('*').eq('room_id', room_id).single();
  if (error) throw error;
  return data;
}

export async function updateHostPeer(room_id, peerId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const { data, error } = await supabase
    .from('rooms')
    .update({ current_host_uid: user.id, current_host_peer_id: peerId, status: 'active' })
    .eq('room_id', room_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function issueRoomJoinToken({ room_id, join_type = 'join', slot_id = null } = {}, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await ensureSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('issue-room-join-token', {
    body: { room_id, join_type, slot_id },
  });
  if (error) throw error;
  if (!data?.token) throw new Error(data?.error ?? 'join token not returned');
  return data.token;
}

export async function verifyRoomJoinToken(token, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const { data, error } = await supabase.functions.invoke('verify-room-join-token', {
    body: { token },
  });
  if (error) throw error;
  if (!data?.verified) throw new Error(data?.error ?? 'join token rejected');
  return data;
}

async function upsertMembership(row, cfg) {
  const supabase = await getSupabaseClient(cfg);
  const payload = {
    ...row,
    online: true,
    disconnected_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('room_memberships')
    .upsert(payload, { onConflict: 'room_id,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
