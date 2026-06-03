/**
 * 俱樂部房間列表純函式單元測試（無 DB）。
 * 執行：node scripts/club_rooms_list_unit_test.js
 */

const assert = require('assert');
const {
  buildRoomListItem,
  isStaleWaitingRoom,
  shouldListRoom,
  participantsForRoomListDisplay,
  STALE_GRACE_MS,
} = require('../lib/clubRoomsList');

function testBuildRoomListItem() {
  const room = {
    id: 'internal-1',
    roomId: '123456',
    creatorId: 'p-host',
    multiplayerVersion: 'V2',
    status: 'WAITING',
    currentPlayers: 1,
    maxPlayers: 4,
    gameSettings: { base: 100 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    participants: [
      {
        playerId: 'p-host',
        joinedAt: new Date(),
        leftAt: null,
        player: {
          id: 'p-host',
          userId: 'u1',
          nickname: 'Host',
          avatarUrl: null,
        },
      },
    ],
  };
  const item = buildRoomListItem(room);
  assert.strictEqual(item.roomId, '123456');
  assert.strictEqual(item.players.length, 1);
  assert.strictEqual(item.players[0].isHost, true);
  assert.strictEqual(item.game_settings.base, 100);
}

function testStaleWaitingRoom() {
  const oldCreated = new Date(Date.now() - STALE_GRACE_MS - 1000);
  const freshCreated = new Date();
  assert.strictEqual(
    isStaleWaitingRoom({
      status: 'WAITING',
      participants: [],
      currentPlayers: 0,
      createdAt: oldCreated,
    }),
    true
  );
  assert.strictEqual(
    isStaleWaitingRoom({
      status: 'WAITING',
      participants: [],
      currentPlayers: 0,
      createdAt: freshCreated,
    }),
    false
  );
  assert.strictEqual(
    isStaleWaitingRoom({
      status: 'PLAYING',
      participants: [],
      currentPlayers: 0,
      createdAt: oldCreated,
    }),
    false
  );
}

function testPlayingRoomKeepsDisconnectedPlayerInList() {
  const joinedEarly = new Date('2026-01-01T00:00:00Z');
  const joinedLate = new Date('2026-01-01T00:01:00Z');
  const room = {
    status: 'PLAYING',
    maxPlayers: 4,
    participants: [
      {
        playerId: 'p1',
        joinedAt: joinedEarly,
        leftAt: null,
        player: { id: 'p1', userId: 'u1', nickname: 'A', avatarUrl: null },
      },
      {
        playerId: 'p2',
        joinedAt: joinedLate,
        leftAt: null,
        player: { id: 'p2', userId: 'u2', nickname: 'B', avatarUrl: null },
      },
      {
        playerId: 'p3',
        joinedAt: joinedLate,
        leftAt: null,
        player: { id: 'p3', userId: 'u3', nickname: 'C', avatarUrl: null },
      },
      {
        playerId: 'p4',
        joinedAt: joinedLate,
        leftAt: new Date('2026-01-01T01:00:00Z'),
        player: { id: 'p4', userId: 'u4', nickname: 'D', avatarUrl: null },
      },
      {
        playerId: 'p-old',
        joinedAt: joinedEarly,
        leftAt: new Date('2026-01-01T00:30:00Z'),
        player: { id: 'p-old', userId: 'u-old', nickname: 'Old', avatarUrl: null },
      },
    ],
  };
  const displayed = participantsForRoomListDisplay(room);
  assert.strictEqual(displayed.length, 4);
  assert.strictEqual(
    displayed.some((p) => (p.player?.id ?? p.playerId) === 'p4'),
    true,
    '斷線中的對局玩家應保留在列表'
  );
  assert.strictEqual(
    displayed.some((p) => (p.player?.id ?? p.playerId) === 'p-old'),
    false,
    '等待階段已離開的玩家不應佔 PLAYING 列表名額'
  );

  const item = buildRoomListItem({
    id: 'internal-2',
    roomId: '654321',
    creatorId: 'p1',
    status: 'PLAYING',
    currentPlayers: 3,
    maxPlayers: 4,
    gameSettings: {},
    createdAt: joinedEarly,
    updatedAt: joinedEarly,
    participants: room.participants,
  });
  assert.strictEqual(item.players.length, 4);
  assert.strictEqual(
    item.players.some((p) => p.userId === 'u4'),
    true
  );
}

function testWaitingRoomExcludesDisconnectedPlayer() {
  const room = {
    status: 'WAITING',
    maxPlayers: 4,
    participants: [
      {
        playerId: 'p1',
        joinedAt: new Date(),
        leftAt: null,
        player: { id: 'p1', userId: 'u1', nickname: 'A', avatarUrl: null },
      },
      {
        playerId: 'p2',
        joinedAt: new Date(),
        leftAt: new Date(),
        player: { id: 'p2', userId: 'u2', nickname: 'B', avatarUrl: null },
      },
    ],
  };
  assert.strictEqual(participantsForRoomListDisplay(room).length, 1);
}

function testShouldListRoom() {
  const finalizing = new Set(['999999']);
  assert.strictEqual(
    shouldListRoom({ roomId: '111111', status: 'WAITING' }, finalizing),
    true
  );
  assert.strictEqual(
    shouldListRoom({ roomId: '999999', status: 'PLAYING' }, finalizing),
    false
  );
  assert.strictEqual(
    shouldListRoom({ roomId: '111111', status: 'FINISHED' }, new Set()),
    false
  );
}

function main() {
  testBuildRoomListItem();
  testStaleWaitingRoom();
  testPlayingRoomKeepsDisconnectedPlayerInList();
  testWaitingRoomExcludesDisconnectedPlayer();
  testShouldListRoom();
  console.log('[club_rooms_list_unit_test] all passed');
}

main();
