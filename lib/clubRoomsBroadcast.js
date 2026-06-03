/**
 * 俱樂部房間列表 Socket.IO 增量廣播。
 */

const { resolveRoomListVisibility } = require('./clubRoomsList');

const CLUB_ROOMS_CHANNEL_PREFIX = 'clubRooms:';
const DEBOUNCE_MS = 250;

let io = null;
const revisionByClub = new Map();
/** @type {Map<string, { timer: NodeJS.Timeout, clubInternalId: string, roomCode: string }>} */
const debounceByKey = new Map();

function setIo(socketIo) {
  io = socketIo;
}

function clubChannel(clubInternalId) {
  return `${CLUB_ROOMS_CHANNEL_PREFIX}${clubInternalId}`;
}

function nextRevision(clubInternalId) {
  const revision = (revisionByClub.get(clubInternalId) || 0) + 1;
  revisionByClub.set(clubInternalId, revision);
  return revision;
}

function emitClubRoomsDelta(clubInternalId, ops) {
  if (!io || !clubInternalId || !Array.isArray(ops) || ops.length === 0) return;
  const revision = nextRevision(clubInternalId);
  io.to(clubChannel(clubInternalId)).emit('club_rooms_delta', {
    clubId: clubInternalId,
    revision,
    ops,
  });
}

function emitRoomRemove(clubInternalId, roomCode, reason = 'removed') {
  if (!clubInternalId || !roomCode) return;
  emitClubRoomsDelta(clubInternalId, [
    {
      type: 'room_remove',
      roomId: roomCode,
      reason,
    },
  ]);
}

function emitRoomUpsert(clubInternalId, room) {
  if (!clubInternalId || !room) return;
  emitClubRoomsDelta(clubInternalId, [
    {
      type: 'room_upsert',
      room,
    },
  ]);
}

function emitStaleRemoves(clubInternalId, roomCodes) {
  if (!clubInternalId || !roomCodes?.length) return;
  const ops = roomCodes.map((roomId) => ({
    type: 'room_remove',
    roomId,
    reason: 'stale',
  }));
  emitClubRoomsDelta(clubInternalId, ops);
}

async function flushRoomVisibility(prisma, clubInternalId, roomLookup) {
  if (!prisma || !clubInternalId) return;
  try {
    const resolved = await resolveRoomListVisibility(prisma, clubInternalId, roomLookup);
    if (resolved.shouldList && resolved.item) {
      emitRoomUpsert(clubInternalId, resolved.item);
    } else if (resolved.roomCode) {
      emitRoomRemove(clubInternalId, resolved.roomCode, resolved.reason || 'removed');
    }
  } catch (error) {
    console.error(
      `[ClubRoomsBroadcast] flushRoomVisibility failed club=${clubInternalId}`,
      error
    );
  }
}

function scheduleRoomVisibilityBroadcast(prisma, clubInternalId, roomLookup) {
  if (!prisma || !clubInternalId) return;
  const roomCode =
    typeof roomLookup === 'string'
      ? roomLookup
      : roomLookup?.roomId ?? roomLookup?.id ?? '';
  const key = `${clubInternalId}::${roomCode || 'unknown'}`;
  const existing = debounceByKey.get(key);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    debounceByKey.delete(key);
    void flushRoomVisibility(prisma, clubInternalId, roomLookup);
  }, DEBOUNCE_MS);
  debounceByKey.set(key, { timer, clubInternalId, roomCode });
}

async function broadcastClubRoomChange(prisma, clubInternalId, roomLookup) {
  scheduleRoomVisibilityBroadcast(prisma, clubInternalId, roomLookup);
}

function broadcastClubRoomRemoved(clubInternalId, roomCode, reason = 'removed') {
  emitRoomRemove(clubInternalId, roomCode, reason);
}

function attachClubRoomsHandlersToSocket(socket, prisma) {
    socket.on('subscribeClubRooms', async (payload) => {
      try {
        const clubId = payload?.clubId?.toString?.().trim?.() ?? '';
        const playerId = payload?.playerId?.toString?.().trim?.() ?? '';
        if (!clubId || !playerId) {
          socket.emit('club_rooms_subscribe_error', {
            error: '請提供 clubId 與 playerId',
          });
          return;
        }

        let club = await prisma.club.findUnique({ where: { id: clubId } });
        if (!club) {
          club = await prisma.club.findUnique({ where: { clubId } });
        }
        if (!club) {
          socket.emit('club_rooms_subscribe_error', { error: '俱樂部不存在' });
          return;
        }

        const member = await prisma.clubMember.findUnique({
          where: {
            clubId_playerId: { clubId: club.id, playerId },
          },
        });
        if (!member) {
          socket.emit('club_rooms_subscribe_error', { error: '非俱樂部成員' });
          return;
        }

        const channel = clubChannel(club.id);
        await socket.join(channel);
        socket.data.subscribedClubRoomsId = club.id;
        socket.emit('club_rooms_subscribed', {
          clubId: club.id,
          revision: revisionByClub.get(club.id) || 0,
        });
      } catch (error) {
        console.error('[ClubRoomsBroadcast] subscribeClubRooms failed', error);
        socket.emit('club_rooms_subscribe_error', {
          error: '訂閱失敗',
        });
      }
    });

    socket.on('unsubscribeClubRooms', async (payload) => {
      try {
        const clubId = payload?.clubId?.toString?.().trim?.() ?? '';
        const subscribed = socket.data.subscribedClubRoomsId;
        if (clubId) {
          let club = await prisma.club.findUnique({ where: { id: clubId } });
          if (!club) {
            club = await prisma.club.findUnique({ where: { clubId } });
          }
          if (club) {
            await socket.leave(clubChannel(club.id));
          }
        } else if (subscribed) {
          await socket.leave(clubChannel(subscribed));
        }
        delete socket.data.subscribedClubRoomsId;
        socket.emit('club_rooms_unsubscribed', { ok: true });
      } catch (error) {
        console.error('[ClubRoomsBroadcast] unsubscribeClubRooms failed', error);
      }
    });
}

function registerClubRoomsBroadcast(socketIo) {
  setIo(socketIo);
}

module.exports = {
  setIo,
  clubChannel,
  nextRevision,
  emitClubRoomsDelta,
  emitRoomRemove,
  emitRoomUpsert,
  emitStaleRemoves,
  broadcastClubRoomChange,
  broadcastClubRoomRemoved,
  attachClubRoomsHandlersToSocket,
  registerClubRoomsBroadcast,
};
