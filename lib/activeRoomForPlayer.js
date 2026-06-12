'use strict';

/**
 * 解析玩家應續局的 V2 房間（冷啟動 / active-for-player）。
 *
 * 優先序：
 * 1. v2_match_sessions.status = IN_PROGRESS 且玩家在 v2_match_participants（開局四人，權威來源）
 * 2. room.status = WAITING 且 room_participants.leftAt IS NULL
 *
 * 刻意不再用「任意 PLAYING room_participants（含開局前已離開的等待房）」推斷，
 * 避免誤導向曾進入等待大廳但已離開、後由他人開局的房間。
 */

const DEFAULT_ROOM_SELECT = {
  roomId: true,
  clubId: true,
  status: true,
  gameSettings: true,
  currentPlayers: true,
  maxPlayers: true,
  multiplayerVersion: true,
};

/**
 * @param {Array<{ session: { roomCode: string, startedAt: Date|string, clubId?: string|null }, room: object|null }>} v2Matches
 * @returns {object|null}
 */
function pickRoomFromV2MatchCandidates(v2Matches) {
  if (!Array.isArray(v2Matches) || v2Matches.length === 0) return null;
  const sorted = [...v2Matches].sort((a, b) => {
    const ta = new Date(a.session?.startedAt ?? 0).getTime();
    const tb = new Date(b.session?.startedAt ?? 0).getTime();
    return tb - ta;
  });
  for (const entry of sorted) {
    const room = entry?.room;
    if (room && room.roomId) return room;
  }
  return null;
}

/**
 * @param {Array<{ room: object, joinedAt: Date|string }>} waitingParticipants
 * @returns {object|null}
 */
function pickRoomFromWaitingParticipants(waitingParticipants) {
  if (!Array.isArray(waitingParticipants) || waitingParticipants.length === 0) {
    return null;
  }
  const sorted = [...waitingParticipants].sort((a, b) => {
    const ta = new Date(a.joinedAt ?? 0).getTime();
    const tb = new Date(b.joinedAt ?? 0).getTime();
    return tb - ta;
  });
  const room = sorted[0]?.room;
  return room?.roomId ? room : null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} playerId
 * @param {object} [roomSelect]
 * @returns {Promise<object|null>}
 */
async function resolveActiveRoomForPlayer(prisma, playerId, roomSelect = DEFAULT_ROOM_SELECT) {
  const pid = playerId?.toString?.().trim?.() ?? '';
  if (!pid) return null;

  const inProgressSessions = await prisma.v2MatchSession.findMany({
    where: {
      status: 'IN_PROGRESS',
      multiplayerVersion: 'V2',
      participants: { some: { playerId: pid } },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      roomCode: true,
      startedAt: true,
      clubId: true,
    },
    take: 5,
  });

  if (inProgressSessions.length > 0) {
    const roomCodes = [
      ...new Set(
        inProgressSessions
          .map((s) => s.roomCode?.toString?.().trim?.() ?? '')
          .filter((code) => code.length > 0)
      ),
    ];
    const playingRooms = await prisma.room.findMany({
      where: {
        roomId: { in: roomCodes },
        status: 'PLAYING',
        multiplayerVersion: 'V2',
      },
      select: roomSelect,
    });
    const roomByCode = new Map(
      playingRooms.map((room) => [room.roomId, room])
    );
    const v2Matches = inProgressSessions.map((session) => ({
      session,
      room: roomByCode.get(session.roomCode) ?? null,
    }));
    const fromSession = pickRoomFromV2MatchCandidates(v2Matches);
    if (fromSession) return fromSession;
  }

  const waitingParticipants = await prisma.roomParticipant.findMany({
    where: {
      playerId: pid,
      leftAt: null,
      room: {
        status: 'WAITING',
        multiplayerVersion: 'V2',
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: 5,
    select: {
      joinedAt: true,
      room: { select: roomSelect },
    },
  });

  return pickRoomFromWaitingParticipants(waitingParticipants);
}

module.exports = {
  DEFAULT_ROOM_SELECT,
  pickRoomFromV2MatchCandidates,
  pickRoomFromWaitingParticipants,
  resolveActiveRoomForPlayer,
};
