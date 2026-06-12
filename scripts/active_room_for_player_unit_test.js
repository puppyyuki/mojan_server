/**
 * active-for-player 房間選擇邏輯單元測試（無 DB）。
 * 執行：node scripts/active_room_for_player_unit_test.js
 */

const assert = require('assert');
const {
  pickRoomFromV2MatchCandidates,
  pickRoomFromWaitingParticipants,
} = require('../lib/activeRoomForPlayer');

function testV2SessionBeatsStalePlayingParticipant() {
  const older = {
    session: { roomCode: '757717', startedAt: '2026-06-13T00:20:00Z' },
    room: {
      roomId: '757717',
      status: 'PLAYING',
    },
  };
  const newer = {
    session: { roomCode: '441985', startedAt: '2026-06-13T00:30:00Z' },
    room: {
      roomId: '441985',
      status: 'PLAYING',
    },
  };
  const picked = pickRoomFromV2MatchCandidates([older, newer]);
  assert.strictEqual(picked?.roomId, '441985');
}

function testV2SessionSkipsMissingPlayingRoom() {
  const picked = pickRoomFromV2MatchCandidates([
    {
      session: { roomCode: '757717', startedAt: '2026-06-13T00:30:00Z' },
      room: null,
    },
    {
      session: { roomCode: '441985', startedAt: '2026-06-13T00:20:00Z' },
      room: { roomId: '441985', status: 'PLAYING' },
    },
  ]);
  assert.strictEqual(picked?.roomId, '441985');
}

function testWaitingParticipantPicksLatestJoin() {
  const picked = pickRoomFromWaitingParticipants([
    {
      joinedAt: '2026-06-13T00:10:00Z',
      room: { roomId: '111111', status: 'WAITING' },
    },
    {
      joinedAt: '2026-06-13T00:15:00Z',
      room: { roomId: '222222', status: 'WAITING' },
    },
  ]);
  assert.strictEqual(picked?.roomId, '222222');
}

function run() {
  testV2SessionBeatsStalePlayingParticipant();
  testV2SessionSkipsMissingPlayingRoom();
  testWaitingParticipantPicksLatestJoin();
  console.log('active_room_for_player_unit_test: ok');
}

run();
