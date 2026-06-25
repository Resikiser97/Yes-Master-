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
  await ensureSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('create-room', {
    body: { room_id, name, max_players: maxPlayers },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function joinRoom(room_id, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const user = await ensureSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('join-room', {
    body: { room_id },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { room_id, user, membership: data.membership ?? data };
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
  await ensureSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('update-host-peer', {
    body: { room_id, peer_id: peerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
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
  return upsertCompatible(supabase, 'room_memberships', payload, { onConflict: 'room_id,user_id' });
}

async function insertCompatible(supabase, table, row) {
  return mutateCompatible(row, (payload) => supabase.from(table).insert(payload).select().single());
}

async function upsertCompatible(supabase, table, row, options) {
  return mutateCompatible(row, (payload) => supabase.from(table).upsert(payload, options).select().single());
}

async function updateCompatible(supabase, table, row, where) {
  return mutateCompatible(row, (payload) => where(supabase.from(table).update(payload)).select().single());
}

async function mutateCompatible(row, run) {
  let payload = { ...row };
  const removed = new Set();
  for (;;) {
    const { data, error } = await run(payload);
    if (!error) return data;
    const missing = missingColumn(error);
    if (!missing || removed.has(missing) || !(missing in payload)) throw error;
    removed.add(missing);
    const { [missing]: _drop, ...next } = payload;
    payload = next;
  }
}

function missingColumn(error) {
  if (error?.code !== 'PGRST204') return null;
  const message = error.message ?? '';
  const match = /'([^']+)' column/.exec(message);
  return match?.[1] ?? null;
}
