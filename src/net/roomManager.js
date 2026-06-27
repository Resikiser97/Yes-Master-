/**
 * @file        roomManager.js
 * @module      net
 * @summary     Supabase rooms 表 CRUD + Edge Function 呼叫（token 申請/驗證、踢人、Host Migration peer 更新）
 * @exports     listRooms, createRoom, joinRoom, leaveRoom, getRoom, getRoomMembers, kickPlayer, startRoom, updateHostPeer, issueRoomJoinToken, verifyRoomJoinToken, heartbeatRoom, ROOM_LIST_COLUMNS, ROOM_DETAIL_COLUMNS
 * @depends     config/gameConfig.js、src/net/supabaseClient.js
 * @sourceOfTruth Docs/game-architecture-plan.md「存檔系統」「P2P 安全限制 → token 申請流程」
 * @version     v0.0.17.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { getSupabaseClient, requireSupabaseUser } from './supabaseClient.js';

export const ROOM_LIST_COLUMNS = Object.freeze([
  'room_id',
  'owner_id',
  'status',
  'name',
  'max_players',
  'current_players',
  'min_level',
  'difficulty',
  'visibility',
  'game_started',
  'has_password',
  'created_at',
  'last_seen_at',
]);

export const ROOM_DETAIL_COLUMNS = Object.freeze([
  ...ROOM_LIST_COLUMNS,
  'current_host_uid',
  'current_host_peer_id',
]);

export const ROOM_MEMBER_COLUMNS = Object.freeze([
  'user_id',
  'slot_id',
  'display_name',
  'player_level',
  'role',
  'is_host',
  'online',
  'join_order',
]);

let roomListColumnsCache = null;
let roomDetailColumnsCache = null;
let roomMemberColumnsCache = null;

function roomId() {
  return crypto?.randomUUID?.() ?? `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function listRooms(cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const data = await selectRoomsCompatible(supabase);
  return (data ?? []).filter(isListableRoom);
}

export async function createRoom({
  name = 'Room',
  room_id = roomId(),
  maxPlayers = 4,
  password = null,
  minLevel = 0,
  difficulty = 'normal',
  visibility = 'public',
} = {}, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('create-room', {
    body: buildCreateRoomBody({ room_id, name, maxPlayers, password, minLevel, difficulty, visibility }),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function joinRoom(room_id, cfg = GAME_CONFIG) {
  const { roomId, password } = normalizeJoinRoomInput(room_id);
  const supabase = await getSupabaseClient(cfg);
  const user = await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('join-room', {
    body: buildJoinRoomBody({ roomId, password }),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { room_id: roomId, user, membership: data.membership ?? data, room: data.room ?? null };
}

export async function leaveRoom(room_id, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('leave-room', {
    body: buildLeaveRoomBody(room_id),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? { ok: true };
}

export async function getRoom(room_id, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  return selectRoomCompatible(supabase, room_id);
}

export async function getRoomMembers(roomId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  const data = await selectMembersCompatible(supabase, roomId);
  return (data ?? []).map(normalizeMember);
}

export async function kickPlayer(roomId, userId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('kick-player', {
    body: buildKickPlayerBody(roomId, userId),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? { ok: true };
}

export async function startRoom(roomId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('start-room', {
    body: buildStartRoomBody(roomId),
  });
  if (error) throw new Error(`start-room Edge Function 未部署或 CORS 未通過: ${error.message || error}`);
  if (data?.error) throw new Error(data.error);
  return data ?? { ok: true };
}

export async function updateHostPeer(room_id, peerId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('update-host-peer', {
    body: { room_id, peer_id: peerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function issueRoomJoinToken({ room_id, join_type = 'join', slot_id = null } = {}, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
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

async function selectRoomsCompatible(supabase) {
  let selected = [...(roomListColumnsCache ?? ROOM_LIST_COLUMNS)];
  const removed = new Set();
  for (;;) {
    const { data, error } = await supabase
      .from('rooms')
      .select(selected.join(','))
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) {
      roomListColumnsCache = selected;
      return data ?? [];
    }
    const missing = missingColumn(error) ?? missingSelectColumn(error, selected);
    if (!missing || removed.has(missing) || !selected.includes(missing)) throw error;
    removed.add(missing);
    selected = selected.filter((column) => column !== missing);
  }
}

async function selectRoomCompatible(supabase, roomId) {
  let selected = [...(roomDetailColumnsCache ?? ROOM_DETAIL_COLUMNS)];
  const removed = new Set();
  for (;;) {
    const { data, error } = await supabase
      .from('rooms')
      .select(selected.join(','))
      .eq('room_id', roomId)
      .single();
    if (!error) {
      roomDetailColumnsCache = selected;
      return data;
    }
    const missing = missingColumn(error) ?? missingSelectColumn(error, selected);
    if (!missing || removed.has(missing) || !selected.includes(missing)) throw error;
    removed.add(missing);
    selected = selected.filter((column) => column !== missing);
  }
}

async function selectMembersCompatible(supabase, roomId) {
  let selected = [...(roomMemberColumnsCache ?? ROOM_MEMBER_COLUMNS)];
  const removed = new Set();
  for (;;) {
    let query = supabase
      .from('room_memberships')
      .select(selected.join(','))
      .eq('room_id', roomId);
    if (selected.includes('join_order')) query = query.order('join_order', { ascending: true });
    const { data, error } = await query;
    if (!error) {
      roomMemberColumnsCache = selected;
      return data ?? [];
    }
    const missing = missingColumn(error) ?? missingSelectColumn(error, selected);
    if (!missing || removed.has(missing) || !selected.includes(missing)) throw error;
    removed.add(missing);
    selected = selected.filter((column) => column !== missing);
  }
}

function missingSelectColumn(error, selected) {
  const message = error?.message ?? '';
  return selected.find((column) => message.includes(column)) ?? null;
}

function normalizeMember(member) {
  const role = member.role ?? (member.is_host ? 'host' : 'player');
  return {
    ...member,
    role,
    display_name: member.display_name ?? 'Goblin',
    player_level: member.player_level ?? 1,
  };
}

export function normalizeJoinRoomInput(room_id) {
  return {
    roomId: typeof room_id === 'object' ? room_id.room_id : room_id,
    password: typeof room_id === 'object' ? (room_id.password || null) : null,
  };
}

export function buildCreateRoomBody({ room_id, name, maxPlayers, password, minLevel, difficulty, visibility }) {
  return {
    room_id,
    name,
    max_players: maxPlayers,
    password,
    min_level: minLevel,
    difficulty,
    visibility,
  };
}

export function buildJoinRoomBody({ roomId, password }) {
  return { room_id: roomId, password };
}

export function buildLeaveRoomBody(roomId) {
  return { room_id: roomId };
}

export function buildKickPlayerBody(roomId, userId) {
  return { room_id: roomId, user_id: userId };
}

export function buildStartRoomBody(roomId) {
  return { room_id: roomId };
}

export function isListableRoom(room) {
  if (room.status !== 'active') return false;
  if (room.visibility && room.visibility !== 'public') return false;
  if (room.game_started === true) return false;
  const current = Number(room.current_players ?? 0);
  const max = Number(room.max_players ?? 4);
  if (current <= 0) return false;
  if (current >= max) return false;
  // Filter stale rooms (no heartbeat for > 90 seconds)
  if (room.last_seen_at) {
    const age = Date.now() - new Date(room.last_seen_at).getTime();
    if (age > 90_000) return false;
  }
  return true;
}

/**
 * Send heartbeat for a room membership.
 * @param {string} roomId
 * @param {object} [cfg]
 * @returns {Promise<{ok:boolean, current_players:number, room_closed?:boolean}>}
 */
export async function heartbeatRoom(roomId, cfg = GAME_CONFIG) {
  const supabase = await getSupabaseClient(cfg);
  await requireSupabaseUser(cfg);
  const { data, error } = await supabase.functions.invoke('room-heartbeat', {
    body: buildHeartbeatRoomBody(roomId),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? { ok: true };
}

/** Pure function: build heartbeat request body. */
export function buildHeartbeatRoomBody(roomId) {
  return { room_id: roomId };
}

/**
 * Trigger server-side room cleanup (requires CLEANUP_SECRET).
 * Not exported for UI use — CLI / cron only.
 * Usage:
 *   curl -X POST https://<project>.supabase.co/functions/v1/cleanup-rooms \
 *     -H "x-cleanup-secret: <CLEANUP_SECRET>" \
 *     -H "Content-Type: application/json" -d '{}'
 */
// export async function cleanupRooms(secret, cfg = GAME_CONFIG) { ... }
