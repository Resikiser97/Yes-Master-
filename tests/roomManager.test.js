import assert from 'node:assert/strict';

import {
  ROOM_DETAIL_COLUMNS,
  ROOM_LIST_COLUMNS,
  ROOM_MEMBER_COLUMNS,
  buildCreateRoomBody,
  buildHeartbeatRoomBody,
  buildJoinRoomBody,
  buildKickPlayerBody,
  buildLeaveRoomBody,
  buildStartRoomBody,
  isListableRoom,
  normalizeJoinRoomInput,
} from '../src/net/roomManager.js';

assert.equal(ROOM_LIST_COLUMNS.includes('password'), false);
assert.equal(ROOM_LIST_COLUMNS.includes('password_hash'), false);
assert.equal(ROOM_DETAIL_COLUMNS.includes('password'), false);
assert.equal(ROOM_DETAIL_COLUMNS.includes('password_hash'), false);
assert.equal(ROOM_DETAIL_COLUMNS.includes('current_host_peer_id'), true);
assert.equal(ROOM_MEMBER_COLUMNS.includes('user_id'), true);
assert.equal(ROOM_MEMBER_COLUMNS.includes('role'), true);

assert.deepEqual(normalizeJoinRoomInput('room-a'), { roomId: 'room-a', password: null });
assert.deepEqual(
  normalizeJoinRoomInput({ room_id: 'room-b', password: 'secret' }),
  { roomId: 'room-b', password: 'secret' }
);
assert.deepEqual(buildJoinRoomBody({ roomId: 'room-b', password: 'secret' }), { room_id: 'room-b', password: 'secret' });
assert.deepEqual(buildStartRoomBody('room-c'), { room_id: 'room-c' });
assert.deepEqual(buildLeaveRoomBody('room-d'), { room_id: 'room-d' });
assert.deepEqual(buildKickPlayerBody('room-e', 'user-2'), { room_id: 'room-e', user_id: 'user-2' });
assert.deepEqual(
  buildCreateRoomBody({
    room_id: 'room-f',
    name: 'Password Room',
    maxPlayers: 3,
    password: 'pw',
    minLevel: 5,
    difficulty: 'test',
    visibility: 'private',
  }),
  {
    room_id: 'room-f',
    name: 'Password Room',
    max_players: 3,
    password: 'pw',
    min_level: 5,
    difficulty: 'test',
    visibility: 'private',
  }
);

assert.equal(isListableRoom({ status: 'active', visibility: 'public', current_players: 1, max_players: 4 }), true);
assert.equal(isListableRoom({ status: 'completed', visibility: 'public', current_players: 1, max_players: 4 }), false);
assert.equal(isListableRoom({ status: 'active', visibility: 'private', current_players: 1, max_players: 4 }), false);
assert.equal(isListableRoom({ status: 'active', visibility: 'public', game_started: true, current_players: 1, max_players: 4 }), false);
assert.equal(isListableRoom({ status: 'active', visibility: 'public', current_players: 4, max_players: 4 }), false);

// --- v0.0.14.2: heartbeat body ---
assert.deepEqual(buildHeartbeatRoomBody('room-h'), { room_id: 'room-h' });

// --- v0.0.14.2: stale room filtering ---
assert.equal(
  isListableRoom({ status: 'active', visibility: 'public', current_players: 0, max_players: 4 }),
  false,
  'current_players=0 should be filtered'
);
assert.equal(
  isListableRoom({
    status: 'active', visibility: 'public', current_players: 2, max_players: 4,
    last_seen_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
  }),
  false,
  'stale last_seen_at (>90s) should be filtered'
);
assert.equal(
  isListableRoom({
    status: 'active', visibility: 'public', current_players: 2, max_players: 4,
    last_seen_at: new Date(Date.now() - 30_000).toISOString(), // 30s ago
  }),
  true,
  'recent last_seen_at (<90s) should pass'
);
assert.equal(
  isListableRoom({
    status: 'active', visibility: 'public', current_players: 2, max_players: 4,
    // no last_seen_at — compatible fallback
  }),
  true,
  'missing last_seen_at should pass (backwards compatible)'
);

// ROOM_LIST_COLUMNS includes last_seen_at
assert.equal(ROOM_LIST_COLUMNS.includes('last_seen_at'), true);

console.log('roomManager tests passed');
