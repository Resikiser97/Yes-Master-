import assert from 'node:assert/strict';

import {
  ROOM_DETAIL_COLUMNS,
  ROOM_LIST_COLUMNS,
  ROOM_MEMBER_COLUMNS,
  buildCreateRoomBody,
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

console.log('roomManager tests passed');
