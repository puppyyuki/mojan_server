/**
 * 俱樂部房間列表純函式單元測試（無 DB）。
 * 執行：node scripts/club_rooms_list_unit_test.js
 */

const assert = require('assert');
const {
  buildRoomListItem,
  isStaleWaitingRoom,
  shouldListRoom,
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
  testShouldListRoom();
  console.log('[club_rooms_list_unit_test] all passed');
}

main();
