/**
 * 俱樂部房間列表：與 GET /clubs/:clubId/rooms 共用的查詢、過濾與 DTO。
 */

const STALE_GRACE_MS = 90 * 1000;

const ROOM_LIST_INCLUDE = {
  participants: {
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

function countActiveParticipants(participants) {
  if (!Array.isArray(participants)) return 0;
  return participants.filter((p) => p.leftAt == null).length;
}

/**
 * 房間列表顯示用參與者：
 * - WAITING：僅在線（leftAt 為 null），斷線即空位可補人。
 * - PLAYING：保留已斷線（leftAt 已寫入）的座位，避免列表出現空槽。
 */
function participantsForRoomListDisplay(room) {
  const all = Array.isArray(room.participants) ? room.participants : [];
  const status = (room.status || '').toString().toUpperCase();
  const maxPlayersRaw = Number(room.maxPlayers ?? 4);
  const maxPlayers = Number.isFinite(maxPlayersRaw) && maxPlayersRaw > 0 ? maxPlayersRaw : 4;

  const active = all.filter((p) => p.leftAt == null);
  if (status !== 'PLAYING') {
    return active;
  }

  const disconnected = all
    .filter((p) => p.leftAt != null)
    .sort((a, b) => new Date(b.leftAt).getTime() - new Date(a.leftAt).getTime());
  const slotsForDisconnected = Math.max(0, maxPlayers - active.length);
  const disconnectedInGame = disconnected.slice(0, slotsForDisconnected);

  const combined = [...active, ...disconnectedInGame];
  combined.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
  return combined.slice(0, maxPlayers);
}

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
    players: participantsForRoomListDisplay(room).map((p) => ({
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
  const activeCount = countActiveParticipants(room.participants);
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
  countActiveParticipants,
  participantsForRoomListDisplay,
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
