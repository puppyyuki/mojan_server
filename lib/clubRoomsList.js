/**
 * 俱樂部房間列表：與 GET /clubs/:clubId/rooms 共用的查詢、過濾與 DTO。
 */

const STALE_GRACE_MS = 90 * 1000;

const ROOM_LIST_INCLUDE = {
  participants: {
    where: { leftAt: null },
    orderBy: { joinedAt: 'asc' },
    include: {
      player: {
        select: {
          id: true,
          userId: true,
          nickname: true,
          avatarUrl: true,
        },
      },
    },
  },
};

const _lastClubRoomsListLogSignatureByClubId = new Map();

function buildRoomListItem(room) {
  return {
    id: room.id,
    roomId: room.roomId,
    creatorId: room.creatorId,
    hostPlayerId: room.creatorId,
    multiplayerVersion: room.multiplayerVersion,
    status: room.status,
    currentPlayers: room.currentPlayers,
    maxPlayers: room.maxPlayers,
    gameSettings: room.gameSettings,
    game_settings: room.gameSettings,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    players: (room.participants || []).map((p) => ({
      id: p.player?.id ?? p.playerId ?? null,
      playerId: p.player?.id ?? p.playerId ?? null,
      userId: p.player?.userId ?? null,
      user_id: p.player?.userId ?? null,
      nickname: p.player?.nickname ?? '',
      display_name: p.player?.nickname ?? '',
      name: p.player?.nickname ?? '',
      avatarUrl: p.player?.avatarUrl ?? null,
      profile_picture_url: p.player?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      isHost: (p.player?.id ?? p.playerId) === room.creatorId,
    })),
  };
}

function isStaleWaitingRoom(room, nowMs = Date.now()) {
  if (room.status !== 'WAITING') return false;
  const activeCount = Array.isArray(room.participants) ? room.participants.length : 0;
  const currentPlayersRaw = Number(room.currentPlayers ?? 0);
  const currentPlayers = Number.isFinite(currentPlayersRaw) ? currentPlayersRaw : 0;
  const roomCreatedMs = new Date(room.createdAt).getTime();
  const ageMs = Number.isFinite(roomCreatedMs) ? nowMs - roomCreatedMs : STALE_GRACE_MS + 1;
  const noActiveParticipants = activeCount <= 0;
  const noSyncedPlayers = currentPlayers <= 0;
  return (noActiveParticipants || noSyncedPlayers) && ageMs >= STALE_GRACE_MS;
}

function shouldListRoom(room, finalizingRoomCodeSet) {
  if (!room) return false;
  const status = (room.status || '').toString().toUpperCase();
  if (status !== 'WAITING' && status !== 'PLAYING') return false;
  if (finalizingRoomCodeSet && finalizingRoomCodeSet.has(room.roomId)) return false;
  return true;
}

async function computeFinalizingRoomCodes(prisma, visibleRoomCodes) {
  const finalizingRoomCodeSet = new Set();
  if (!visibleRoomCodes || visibleRoomCodes.length === 0) {
    return finalizingRoomCodeSet;
  }
  const sessions = await prisma.v2MatchSession.findMany({
    where: {
      roomCode: { in: visibleRoomCodes },
      status: 'IN_PROGRESS',
    },
    select: {
      roomCode: true,
      rounds: {
        orderBy: { roundIndex: 'desc' },
        take: 1,
        select: { roundEndPayload: true },
      },
    },
  });
  for (const session of sessions) {
    const payload = session?.rounds?.[0]?.roundEndPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    if (payload.isLastRound === true) {
      finalizingRoomCodeSet.add(session.roomCode);
    }
  }
  return finalizingRoomCodeSet;
}

function pickStaleRoomIds(rooms, nowMs = Date.now()) {
  return rooms
    .filter((room) => isStaleWaitingRoom(room, nowMs))
    .map((room) => room.id);
}

async function loadActiveClubRooms(prisma, clubInternalId) {
  return prisma.room.findMany({
    where: {
      clubId: clubInternalId,
      status: { in: ['WAITING', 'PLAYING'] },
    },
    orderBy: { createdAt: 'desc' },
    include: ROOM_LIST_INCLUDE,
  });
}

async function cleanStaleClubRooms(prisma, rooms, clubInternalId) {
  const nowMs = Date.now();
  const staleRoomIds = pickStaleRoomIds(rooms, nowMs);
  const staleRoomCodes = rooms
    .filter((room) => staleRoomIds.includes(room.id))
    .map((room) => room.roomId)
    .filter((code) => typeof code === 'string' && code.length > 0);

  if (staleRoomIds.length > 0) {
    console.warn(
      `[ClubRoomsList] 清理 stale 房間 club=${clubInternalId} totalRooms=${rooms.length} staleCount=${staleRoomIds.length} staleIds=${staleRoomIds.join(',')}`
    );
    await prisma.room.deleteMany({
      where: { id: { in: staleRoomIds } },
    });
  }

  const visibleRooms = rooms.filter((room) => !staleRoomIds.includes(room.id));
  return { staleRoomIds, staleRoomCodes, visibleRooms };
}

async function listClubRooms(prisma, clubInternalId, { cleanStale = true } = {}) {
  const rooms = await loadActiveClubRooms(prisma, clubInternalId);

  let visibleRooms = rooms;
  let staleRoomCodes = [];
  if (cleanStale) {
    const cleaned = await cleanStaleClubRooms(prisma, rooms, clubInternalId);
    visibleRooms = cleaned.visibleRooms;
    staleRoomCodes = cleaned.staleRoomCodes;
  }

  const visibleRoomCodes = visibleRooms
    .map((room) => room.roomId)
    .filter((code) => typeof code === 'string' && code.length > 0);

  const finalizingRoomCodeSet = await computeFinalizingRoomCodes(prisma, visibleRoomCodes);
  const listRooms = visibleRooms.filter((room) => !finalizingRoomCodeSet.has(room.roomId));

  const listLogSignature = [
    rooms.length,
    visibleRooms.length,
    listRooms.length,
    staleRoomCodes.length,
    finalizingRoomCodeSet.size,
  ].join('|');
  if (_lastClubRoomsListLogSignatureByClubId.get(clubInternalId) !== listLogSignature) {
    _lastClubRoomsListLogSignatureByClubId.set(clubInternalId, listLogSignature);
    console.log(
      `[ClubRoomsList] 俱樂部房間列表 club=${clubInternalId} total=${rooms.length} visible=${visibleRooms.length} listed=${listRooms.length} staleCleaned=${staleRoomCodes.length} finalizingHidden=${finalizingRoomCodeSet.size}`
    );
  }

  const data = listRooms.map((room) => buildRoomListItem(room));
  return {
    data,
    staleRoomCodes,
    finalizingRoomCodeSet,
  };
}

async function fetchRoomForClubList(prisma, roomLookup) {
  const where =
    typeof roomLookup === 'object' && roomLookup !== null && roomLookup.id
      ? { id: roomLookup.id }
      : { roomId: String(roomLookup) };

  return prisma.room.findFirst({
    where,
    include: ROOM_LIST_INCLUDE,
  });
}

/**
 * 判定單一房間在俱樂部列表上應 upsert 或 remove。
 */
async function resolveRoomListVisibility(prisma, clubInternalId, roomLookup) {
  const room = await fetchRoomForClubList(prisma, roomLookup);
  const roomCode =
    typeof roomLookup === 'string'
      ? roomLookup
      : room?.roomId ?? roomLookup?.roomId ?? null;

  if (!room || room.clubId !== clubInternalId) {
    return {
      shouldList: false,
      item: null,
      roomCode,
      reason: 'deleted',
    };
  }

  if (isStaleWaitingRoom(room)) {
    return {
      shouldList: false,
      item: null,
      roomCode: room.roomId,
      reason: 'stale',
    };
  }

  const finalizingRoomCodeSet = await computeFinalizingRoomCodes(prisma, [room.roomId]);
  if (!shouldListRoom(room, finalizingRoomCodeSet)) {
    const status = (room.status || '').toString().toUpperCase();
    let reason = 'hidden';
    if (finalizingRoomCodeSet.has(room.roomId)) {
      reason = 'finalizing';
    } else if (status === 'FINISHED' || status === 'DISBANDED') {
      reason = 'finished';
    }
    return {
      shouldList: false,
      item: null,
      roomCode: room.roomId,
      reason,
    };
  }

  return {
    shouldList: true,
    item: buildRoomListItem(room),
    roomCode: room.roomId,
    reason: null,
  };
}

module.exports = {
  STALE_GRACE_MS,
  ROOM_LIST_INCLUDE,
  buildRoomListItem,
  isStaleWaitingRoom,
  shouldListRoom,
  computeFinalizingRoomCodes,
  pickStaleRoomIds,
  loadActiveClubRooms,
  cleanStaleClubRooms,
  listClubRooms,
  fetchRoomForClubList,
  resolveRoomListVisibility,
};
