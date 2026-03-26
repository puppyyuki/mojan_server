const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');
const {
  resolveClubV2HistoryVisibility,
} = require('../../utils/clubV2HistoryAccess');

/**
 * 查找俱樂部（支持內部ID或俱樂部ID）
 */
async function findClub(prisma, clubId) {
  // 先嘗試通過內部ID查找
  let club = await prisma.club.findUnique({
    where: { id: clubId },
  });

  // 如果找不到，嘗試通過俱樂部ID查找
  if (!club) {
    club = await prisma.club.findUnique({
      where: { clubId: clubId },
    });
  }

  return club;
}

async function createClubActivity(prisma, clubId, type, options = {}) {
  const {
    actorPlayerId = null,
    targetPlayerId = null,
    actorNickname = null,
    targetNickname = null,
  } = options;

  try {
    let resolvedActorNickname = actorNickname;
    let resolvedTargetNickname = targetNickname;

    if (!resolvedActorNickname && actorPlayerId) {
      const actor = await prisma.player.findUnique({
        where: { id: actorPlayerId },
        select: { nickname: true },
      });
      resolvedActorNickname = actor?.nickname ?? null;
    }

    if (!resolvedTargetNickname && targetPlayerId) {
      const target = await prisma.player.findUnique({
        where: { id: targetPlayerId },
        select: { nickname: true },
      });
      resolvedTargetNickname = target?.nickname ?? null;
    }

    await prisma.clubActivity.create({
      data: {
        clubId,
        type,
        actorPlayerId,
        targetPlayerId,
        actorNickname: resolvedActorNickname,
        targetNickname: resolvedTargetNickname,
      },
    });
  } catch (e) {
    console.error('[Clubs API] 寫入俱樂部動態失敗:', e);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 俱樂部對戰列表：與房卡顯示一致的規則摘要 */
function buildClubV2RulesSummary(gameSettings) {
  const g = gameSettings && typeof gameSettings === 'object' ? gameSettings : {};
  const gameType = g.game_type || 'NORTHERN';
  const gameModeStr = gameType === 'SOUTHERN' ? '南部麻將' : '北部麻將';
  const rounds = g.rounds ?? 2;
  const basePoints = g.base_points ?? 300;
  const scoringUnit = g.scoring_unit ?? 100;
  const deduction = g.deduction || 'AA_DEDUCTION';
  const deductionStr = deduction === 'HOST_DEDUCTION' ? '俱樂部扣卡' : 'AA扣卡';
  return `${gameModeStr}(${rounds}圈,${basePoints}底,${scoringUnit}台)${deductionStr}`;
}

/** 與主大廳戰績詳情相同：前 9 碼 + 局數範圍（Unicode 連字號） */
function buildV2ReplayCodeSummaryFromRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  let prefix = null;
  for (const r of rounds) {
    const digits = String(r.shareCode || '').replace(/\D/g, '');
    if (digits.length >= 9) {
      prefix = digits.slice(0, 9);
      break;
    }
  }
  if (!prefix) return null;
  let minR = null;
  let maxR = null;
  for (const r of rounds) {
    const digits = String(r.shareCode || '').replace(/\D/g, '');
    if (digits.length < 9) continue;
    const ri = Number(r.roundIndex);
    if (!Number.isFinite(ri) || ri < 1) continue;
    const c = Math.min(99, ri);
    if (minR === null || c < minR) minR = c;
    if (maxR === null || c > maxR) maxR = c;
  }
  const sa = String(minR ?? 1).padStart(2, '0');
  const sb = String(maxR ?? 1).padStart(2, '0');
  const enDash = '\u2013';
  return `${prefix} (${sa}${enDash}${sb})`;
}

function normalizeBoolPermissions(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const allowedKeys = [
    'modifyClubRules',
    'manageRoomCards',
    'approveJoinRequests',
    'kickMembers',
    'banMembers',
    'banSameTable',
    'setScoreLimit',
  ];
  const out = {};
  for (const key of allowedKeys) {
    out[key] = raw[key] === true;
  }
  const anyTrue = allowedKeys.some(k => out[k] === true);
  return anyTrue ? out : null;
}

function getCoLeaderPerms(member) {
  const perms = member?.coLeaderPermissions;
  if (!perms || typeof perms !== 'object') return null;
  return perms;
}

function normalizeRoomGameSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const special = input.special_rules && typeof input.special_rules === 'object'
    ? input.special_rules
    : {};
  const deductionRaw = String(input.deduction || 'AA_DEDUCTION').toUpperCase();
  const deduction = ['AA_DEDUCTION', 'HOST_DEDUCTION', 'CLUB_DEDUCTION'].includes(deductionRaw)
    ? deductionRaw
    : 'AA_DEDUCTION';
  const roundsNum = Number(input.rounds);
  const rounds = [1, 2, 4].includes(roundsNum) ? roundsNum : 1;
  const gameTypeRaw = String(input.game_type || 'NORTHERN').toUpperCase();
  const game_type = gameTypeRaw === 'SOUTHERN' ? 'SOUTHERN' : 'NORTHERN';
  const pointCapRaw = String(input.point_cap || 'UP_TO_8_POINTS').toUpperCase();
  const point_cap = ['UP_TO_4_POINTS', 'UP_TO_8_POINTS', 'NO_LIMIT'].includes(pointCapRaw)
    ? pointCapRaw
    : 'UP_TO_8_POINTS';
  const basePointsNum = Number(input.base_points);
  const scoringUnitNum = Number(input.scoring_unit);
  return {
    base_points: Number.isFinite(basePointsNum) ? Math.max(0, Math.floor(basePointsNum)) : 100,
    scoring_unit: Number.isFinite(scoringUnitNum) ? Math.max(0, Math.floor(scoringUnitNum)) : 20,
    rounds,
    game_type,
    special_rules: {
      li_gu: special.li_gu === true,
      eye_tile_feature: special.eye_tile_feature === true,
      forced_win: special.forced_win === true,
      no_points_dealer: special.no_points_dealer === true,
    },
    point_cap,
    deduction,
    manual_start: input.manual_start === true,
    ip_check: input.ip_check === true,
    gps_lock: input.gps_lock === true || input.location_check === true,
  };
}

function applyClubGameSettingsPolicy(clubSettingsRaw, requestedRaw) {
  const requested = normalizeRoomGameSettings(requestedRaw);
  const clubSettings = clubSettingsRaw && typeof clubSettingsRaw === 'object' ? clubSettingsRaw : null;
  if (!clubSettings) return requested;
  const mode = String(clubSettings.global_settings || '').toUpperCase();
  const isForced = mode === 'FORCED';
  const specialRulePolicy = clubSettings.special_rules && typeof clubSettings.special_rules === 'object'
    ? clubSettings.special_rules
    : {};

  const out = { ...requested, special_rules: { ...requested.special_rules } };

  const lockOrValidateEnum = (key, value, allowed) => {
    if (isForced) {
      if (value != null) out[key] = value;
      return;
    }
    if (!Array.isArray(allowed) || allowed.length === 0) return;
    if (!allowed.includes(out[key])) out[key] = allowed[0];
  };

  if (clubSettings.game_type) {
    out.game_type = String(clubSettings.game_type).toUpperCase() === 'SOUTHERN' ? 'SOUTHERN' : 'NORTHERN';
  }

  if (isForced) {
    if (clubSettings.base_points != null) out.base_points = Number(clubSettings.base_points) || out.base_points;
    if (clubSettings.scoring_unit != null) out.scoring_unit = Number(clubSettings.scoring_unit) || out.scoring_unit;
    if (clubSettings.rounds != null) out.rounds = Number(clubSettings.rounds) || out.rounds;
    if (clubSettings.point_cap != null) out.point_cap = String(clubSettings.point_cap);
  } else {
    const minBase = Number(clubSettings.minimum_base_point);
    const maxBase = Number(clubSettings.maximum_base_point);
    if (Number.isFinite(minBase)) out.base_points = Math.max(out.base_points, minBase);
    if (Number.isFinite(maxBase)) out.base_points = Math.min(out.base_points, maxBase);
    const minUnit = Number(clubSettings.minimum_scoring_unit);
    const maxUnit = Number(clubSettings.maximum_scoring_unit);
    if (Number.isFinite(minUnit)) out.scoring_unit = Math.max(out.scoring_unit, minUnit);
    if (Number.isFinite(maxUnit)) out.scoring_unit = Math.min(out.scoring_unit, maxUnit);
    lockOrValidateEnum('rounds', out.rounds, clubSettings.rounds);
    lockOrValidateEnum('point_cap', out.point_cap, clubSettings.point_cap);
  }

  const deductionPolicy = clubSettings.deduction && typeof clubSettings.deduction === 'object'
    ? clubSettings.deduction
    : null;
  if (deductionPolicy) {
    const allowAA = deductionPolicy.aa_deduction === true;
    const allowHost = deductionPolicy.host_deduction === true;
    if (isForced) {
      if (allowHost && !allowAA) out.deduction = 'HOST_DEDUCTION';
      else if (allowAA && !allowHost) out.deduction = 'AA_DEDUCTION';
      else if (!allowAA && !allowHost) out.deduction = 'CLUB_DEDUCTION';
    } else {
      if (out.deduction === 'AA_DEDUCTION' && !allowAA) {
        out.deduction = allowHost ? 'HOST_DEDUCTION' : 'CLUB_DEDUCTION';
      } else if (out.deduction === 'HOST_DEDUCTION' && !allowHost) {
        out.deduction = allowAA ? 'AA_DEDUCTION' : 'CLUB_DEDUCTION';
      }
    }
  }

  for (const key of ['li_gu', 'eye_tile_feature', 'forced_win', 'no_points_dealer']) {
    const policy = specialRulePolicy[key];
    if (isForced) {
      if (policy != null) out.special_rules[key] = policy === true;
    } else if (policy === false) {
      out.special_rules[key] = false;
    }
  }

  for (const key of ['manual_start', 'ip_check', 'gps_lock']) {
    const policy = clubSettings[key];
    if (isForced) {
      if (typeof policy === 'boolean') out[key] = policy;
    } else if (policy === false) {
      out[key] = false;
    }
  }

  return normalizeRoomGameSettings(out);
}

async function requireClubOwnerOrPermission(prisma, clubInternalId, actorPlayerId, permissionKey) {
  const club = await prisma.club.findUnique({
    where: { id: clubInternalId },
    select: { creatorId: true },
  });
  if (!club) {
    return { ok: false, status: 404, error: '俱樂部不存在' };
  }
  const isOwner = club.creatorId === actorPlayerId;
  if (isOwner) {
    return { ok: true, clubCreatorId: club.creatorId };
  }

  const actorMember = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId: clubInternalId, playerId: actorPlayerId } },
    select: { role: true, coLeaderPermissions: true },
  });
  const perms = getCoLeaderPerms(actorMember);
  const allowed = actorMember?.role === 'CO_LEADER' && perms?.[permissionKey] === true;
  if (!allowed) {
    return { ok: false, status: 403, error: '沒有權限' };
  }
  return { ok: true, clubCreatorId: club.creatorId };
}

/**
 * GET /api/client/clubs
 * 獲取所有俱樂部
 */
router.get('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const clubs = await prisma.club.findMany({
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, clubs);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部列表失敗:', error);
    return errorResponse(res, '獲取俱樂部列表失敗', null, 500);
  }
});

/**
 * POST /api/client/clubs
 * 創建俱樂部
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { name, creatorId, avatarUrl } = req.body;

    if (!name || !name.trim()) {
      return errorResponse(res, '請輸入俱樂部名稱', null, 400);
    }

    if (!creatorId) {
      return errorResponse(res, '請提供創建者ID', null, 400);
    }

    // 檢查創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: creatorId },
    });

    if (!creator) {
      return errorResponse(res, '創建者不存在', null, 404);
    }

    // 生成唯一的6位數字ID
    const clubId = await generateUniqueId(async (id) => {
      const exists = await prisma.club.findUnique({
        where: { clubId: id },
      });
      return !exists;
    });

    // 創建俱樂部
    const club = await prisma.club.create({
      data: {
        clubId,
        name: name.trim(),
        creatorId,
        avatarUrl: avatarUrl || null,
        cardCount: 0,
      },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
      },
    });

    // 將創建者添加為成員
    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        playerId: creatorId,
      },
    });

    // 重新獲取包含成員的俱樂部
    const clubWithMembers = await prisma.club.findUnique({
      where: { id: club.id },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
    });

    return successResponse(res, clubWithMembers, '俱樂部創建成功');
  } catch (error) {
    console.error('[Clubs API] 創建俱樂部失敗:', error);
    return errorResponse(res, '創建俱樂部失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId
 * 獲取單個俱樂部詳細資訊
 */
router.get('/:clubId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    // 獲取完整資訊
    const fullClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: {
        id: true,
        clubId: true,
        name: true,
        cardCount: true,
        avatarUrl: true,
        logoUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
    });

    return successResponse(res, fullClub);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部詳細資訊失敗:', error);
    return errorResponse(res, '獲取俱樂部詳細資訊失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/rooms
 * 獲取俱樂部的房間列表（包含目前房間內的玩家資訊）
 */
router.get('/:clubId/rooms', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const rooms = await prisma.room.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          where: { leftAt: null },
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
      },
    });

    // 舊資料或異常中斷可能留下「無人在房但房間仍存在」的殘留房。
    // 對 WAITING 且無活躍 participants 的房間做即時清理，避免列表卡住。
    const staleRoomIds = rooms
      .filter((room) => {
        const activeCount = Array.isArray(room.participants)
          ? room.participants.length
          : 0;
        return room.status === 'WAITING' && activeCount <= 0;
      })
      .map((room) => room.id);

    if (staleRoomIds.length > 0) {
      await prisma.room.deleteMany({
        where: { id: { in: staleRoomIds } },
      });
    }

    const visibleRooms = rooms.filter((room) => !staleRoomIds.includes(room.id));

    const data = visibleRooms.map((room) => ({
      id: room.id,
      roomId: room.roomId,
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
      })),
    }));

    return successResponse(res, data);
  } catch (error) {
    console.error('[Clubs API] 獲取房間列表失敗:', error);
    return errorResponse(res, '獲取房間列表失敗', null, 500);
  }
});

router.post('/:clubId/join-requests', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const existingMember = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (existingMember) {
      return errorResponse(res, '玩家已經是俱樂部成員', null, 400);
    }

    const existingRequest = await prisma.clubJoinRequest.findFirst({
      where: { clubId: club.id, playerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });
    if (existingRequest) {
      return successResponse(res, existingRequest, '加入申請已送出');
    }

    const request = await prisma.clubJoinRequest.create({
      data: { clubId: club.id, playerId, status: 'PENDING' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });

    await createClubActivity(prisma, club.id, 'JOIN_REQUESTED', {
      actorPlayerId: playerId,
      targetPlayerId: playerId,
      actorNickname: request.player?.nickname ?? player.nickname ?? null,
      targetNickname: request.player?.nickname ?? player.nickname ?? null,
    });

    return successResponse(res, request, '加入申請已送出');
  } catch (error) {
    console.error('[Clubs API] 建立加入申請失敗:', error);
    return errorResponse(res, '加入申請失敗', error.message, 500);
  }
});

router.get('/:clubId/activity', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const limitRaw = req.query.limit;
    const limitParsed = Number(limitRaw);
    const limit = Number.isFinite(limitParsed)
      ? Math.min(Math.max(limitParsed, 1), 200)
      : 50;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const rows = await prisma.clubActivity.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return successResponse(res, rows);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部動態失敗:', error);
    return errorResponse(res, '獲取俱樂部動態失敗', error.message, 500);
  }
});

router.get('/:clubId/join-requests', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const actorPlayerId = req.query.actorPlayerId;
    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const canReview = actorMember?.role === 'CO_LEADER' && perms?.approveJoinRequests === true;
      if (!canReview) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const rawStatus = (req.query.status || 'PENDING').toString().toUpperCase();
    const status = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(rawStatus)
      ? rawStatus
      : 'PENDING';

    const requests = await prisma.clubJoinRequest.findMany({
      where: { clubId: club.id, status },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });

    return successResponse(res, requests);
  } catch (error) {
    console.error('[Clubs API] 獲取加入申請列表失敗:', error);
    return errorResponse(res, '獲取加入申請列表失敗', error.message, 500);
  }
});

router.post('/:clubId/join-requests/:requestId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId, requestId } = req.params;
    const action = (req.query.action || '').toString().toLowerCase();
    const { actorPlayerId } = req.body || {};

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const request = await prisma.clubJoinRequest.findFirst({
      where: { id: requestId, clubId: club.id },
    });
    if (!request) {
      return errorResponse(res, '加入申請不存在', null, 404);
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'cancel') {
      return errorResponse(res, '無效的操作', null, 400);
    }

    if (action === 'cancel') {
      if (actorPlayerId !== request.playerId) {
        return errorResponse(res, '沒有權限', null, 403);
      }
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
      });
      return successResponse(res, null, '已取消加入申請');
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const canReview = actorMember?.role === 'CO_LEADER' && perms?.approveJoinRequests === true;
      if (!canReview) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    if (action === 'approve') {
      const existingMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: request.playerId } },
      });
      if (!existingMember) {
        await prisma.clubMember.create({
          data: { clubId: club.id, playerId: request.playerId },
        });
      }
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED' },
      });
      await createClubActivity(prisma, club.id, 'JOIN_APPROVED', {
        actorPlayerId: actorPlayerId ?? null,
        targetPlayerId: request.playerId,
      });
      return successResponse(res, null, '已批准加入申請');
    }

    if (action === 'reject') {
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });
      await createClubActivity(prisma, club.id, 'JOIN_REJECTED', {
        actorPlayerId: actorPlayerId ?? null,
        targetPlayerId: request.playerId,
      });
      return successResponse(res, null, '已拒絕加入申請');
    }
  } catch (error) {
    console.error('[Clubs API] 更新加入申請失敗:', error);
    return errorResponse(res, '更新加入申請失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/rankings
 * 獲取俱樂部排行榜（可依日期區間聚合）
 */
router.get('/:clubId/rankings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const startDateRaw = req.query.startDate?.toString?.() ?? '';
    const endDateRaw = req.query.endDate?.toString?.() ?? '';
    const hasDateFilter = !!(startDateRaw || endDateRaw);
    const parseDateMaybe = (raw, isEnd) => {
      if (!raw) return null;
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) return null;
      if (isDateOnly && isEnd) {
        dt.setHours(23, 59, 59, 999);
      }
      return dt;
    };
    const startDate = parseDateMaybe(startDateRaw, false);
    const endDate = parseDateMaybe(endDateRaw, true);
    if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
      return errorResponse(res, '日期格式錯誤，請使用 YYYY-MM-DD', null, 400);
    }
    if (startDate && endDate && startDate > endDate) {
      return errorResponse(res, '開始日期不可晚於結束日期', null, 400);
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id, isBanned: false },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
            cardCount: true,
          },
        },
      },
    });

    const byPlayerId = new Map();
    for (const m of members) {
      const pid = m.player?.id ?? null;
      if (!pid) continue;
      byPlayerId.set(pid, {
        playerId: pid,
        userId: m.player?.userId ?? null,
        nickname: m.player?.nickname ?? '',
        avatarUrl: m.player?.avatarUrl ?? null,
        role: m.role,
        clubScore: m.clubScore ?? 0,
        totalGames: m.totalGames ?? 0,
        bigWinnerCount: m.bigWinnerCount ?? 0,
        roomCardConsumed: m.roomCardConsumed ?? 0,
        lastGameTime: m.lastGameTime ?? null,
      });
    }

    if (hasDateFilter) {
      for (const row of byPlayerId.values()) {
        row.clubScore = 0;
        row.totalGames = 0;
        row.bigWinnerCount = 0;
        row.roomCardConsumed = 0;
        row.lastGameTime = null;
      }

      const where = {
        clubId: club.id,
      };
      if (startDate || endDate) {
        where.endedAt = {};
        if (startDate) where.endedAt.gte = startDate;
        if (endDate) where.endedAt.lte = endDate;
      }
      const gameResults = await prisma.clubGameResult.findMany({
        where,
        select: {
          endedAt: true,
          players: true,
        },
      });

      for (const game of gameResults) {
        const players = Array.isArray(game.players) ? game.players : [];
        for (const p of players) {
          const pid = p?.playerId?.toString?.() ?? '';
          if (!pid || !byPlayerId.has(pid)) continue;
          const row = byPlayerId.get(pid);
          row.clubScore += Number(p?.score ?? 0) || 0;
          row.totalGames += 1;
          if (p?.isBigWinner === true) row.bigWinnerCount += 1;
          row.roomCardConsumed += Number(p?.roomCardConsumed ?? 0) || 0;
          row.lastGameTime =
            !row.lastGameTime || row.lastGameTime < game.endedAt
              ? game.endedAt
              : row.lastGameTime;
        }
      }
    }

    const rankings = Array.from(byPlayerId.values())
      .filter((r) => !hasDateFilter || r.totalGames > 0)
      .sort((a, b) => {
        if ((b.clubScore || 0) !== (a.clubScore || 0)) {
          return (b.clubScore || 0) - (a.clubScore || 0);
        }
        if ((b.bigWinnerCount || 0) !== (a.bigWinnerCount || 0)) {
          return (b.bigWinnerCount || 0) - (a.bigWinnerCount || 0);
        }
        return (b.totalGames || 0) - (a.totalGames || 0);
      })
      .map((r, idx) => ({
        rank: idx + 1,
        ...r,
      }));

    return successResponse(res, rankings);
  } catch (error) {
    console.error('[Clubs API] 獲取排行榜失敗:', error);
    return errorResponse(res, '獲取排行榜失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/match-history
 * 俱樂部 v2 對戰歷史（V2MatchSession，含重播碼摘要、四位玩家總分）
 * Query: actorPlayerId（必填，用於身分與可見範圍）
 *        startDate, endDate (YYYY-MM-DD，依結束時間為主，無 endedAt 則用 startedAt)
 *        playerId（可選，比對參與者 playerId / userId 子字串；一般成員僅能看到含自己的場次）
 *
 * 可見範圍：擁有者、副會長、已核准公關代理可看全部；其餘成員僅看自己參與的場次。
 */
router.get('/:clubId/match-history', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const actorPlayerId = (req.query.actorPlayerId || '').toString().trim();
    const vis = await resolveClubV2HistoryVisibility(prisma, club, actorPlayerId);
    if (!vis.ok) {
      return errorResponse(res, vis.message, null, vis.status);
    }
    const canSeeAllClubMatches = vis.canSeeAll;

    const startDateRaw = req.query.startDate?.toString?.() ?? '';
    const endDateRaw = req.query.endDate?.toString?.() ?? '';
    const playerIdRaw = (req.query.playerId || '').toString().trim();

    const parseDateMaybe = (raw, isEnd) => {
      if (!raw) return null;
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) return null;
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
      if (isDateOnly && isEnd) {
        dt.setHours(23, 59, 59, 999);
      }
      return dt;
    };
    const startDate = parseDateMaybe(startDateRaw, false);
    const endDate = parseDateMaybe(endDateRaw, true);
    if ((startDateRaw && !startDate) || (endDateRaw && !endDate)) {
      return errorResponse(res, '日期格式錯誤，請使用 YYYY-MM-DD', null, 400);
    }
    if (startDate && endDate && startDate > endDate) {
      return errorResponse(res, '開始日期不可晚於結束日期', null, 400);
    }

    const searchParticipantFilter = isNonEmptyString(playerIdRaw)
      ? {
          some: {
            OR: [
              { playerId: { contains: playerIdRaw, mode: 'insensitive' } },
              { userId: { contains: playerIdRaw, mode: 'insensitive' } },
            ],
          },
        }
      : null;

    const scopeAnd = [];
    if (!canSeeAllClubMatches) {
      scopeAnd.push({
        participants: { some: { playerId: actorPlayerId } },
      });
    }
    if (searchParticipantFilter) {
      scopeAnd.push({ participants: searchParticipantFilter });
    }

    const sessions = await prisma.v2MatchSession.findMany({
      where: {
        clubId: club.id,
        status: { in: ['FINISHED', 'DISBANDED'] },
        ...(scopeAnd.length > 0 ? { AND: scopeAnd } : {}),
      },
      orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }],
      take: 100,
      include: {
        participants: {
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
        rounds: {
          select: {
            roundIndex: true,
            shareCode: true,
          },
          orderBy: { roundIndex: 'asc' },
        },
      },
    });

    const inRange = (s) => {
      if (!startDate && !endDate) return true;
      const t = s.endedAt ?? s.startedAt;
      if (!t) return false;
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    };

    const history = sessions.filter(inRange).map((s) => {
      const gameSettings = s.gameSettings && typeof s.gameSettings === 'object' ? s.gameSettings : {};
      const gameType = gameSettings.game_type || 'NORTHERN';
      const gameTypeLabel = gameType === 'SOUTHERN' ? '南部麻將' : '北部麻將';
      const rulesSummary = buildClubV2RulesSummary(gameSettings);
      const replayCodeSummary = buildV2ReplayCodeSummaryFromRounds(s.rounds || []);

      const players = (s.participants || []).map((p) => ({
        playerId: p.playerId,
        userId: p.userId ?? p.player?.userId ?? null,
        nickname: (p.nickname || p.player?.nickname || '').trim() || '—',
        avatarUrl: p.avatarUrl ?? p.player?.avatarUrl ?? null,
        seat: p.seat,
        isHost: p.isHost === true,
        matchTotalScore: p.matchTotalScore ?? 0,
      }));

      let best = null;
      for (const pl of players) {
        const sc = Number(pl.matchTotalScore) || 0;
        if (best === null || sc > best) best = sc;
      }
      const bigWinnerPlayerIds =
        best === null
          ? []
          : players.filter((pl) => (Number(pl.matchTotalScore) || 0) === best).map((pl) => pl.playerId);

      return {
        sessionId: s.id,
        roomCode: s.roomCode,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        gameSettings,
        gameTypeLabel,
        rulesSummary,
        replayCodeSummary,
        players,
        bigWinnerPlayerIds,
      };
    });

    return successResponse(res, history);
  } catch (error) {
    console.error('[Clubs API] 獲取戰績失敗:', error);
    return errorResponse(res, '獲取戰績失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/rooms
 * 創建房間
 */
router.post('/:clubId/rooms', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { maxPlayers, creatorId, gameSettings, multiplayerVersion } = req.body;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (!isNonEmptyString(creatorId)) {
      return errorResponse(res, '請提供開房玩家ID', null, 400);
    }
    const roomCreatorId = creatorId.toString();

    // 驗證創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: roomCreatorId },
    });

    if (!creator) {
      return errorResponse(res, '創建者不存在', null, 404);
    }

    const member = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: roomCreatorId,
        },
      },
      select: { role: true, isBanned: true, coLeaderPermissions: true },
    });

    if (!member) {
      return errorResponse(res, '只有俱樂部成員可開房', null, 403);
    }
    if (member.isBanned === true) {
      return errorResponse(res, '您目前被禁止開房', null, 403);
    }
    if (
      member.role === 'CO_LEADER' &&
      getCoLeaderPerms(member)?.modifyClubRules === false
    ) {
      return errorResponse(res, '沒有開房權限', null, 403);
    }

    // 生成唯一的6位數字ID
    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({
        where: { roomId: id },
      });
      return !exists;
    });

    const normalizedMultiplayerVersion =
      multiplayerVersion === 'v2' || multiplayerVersion === 'V2'
        ? 'V2'
        : 'V1';

    const finalGameSettings = applyClubGameSettingsPolicy(
      club.gameSettings || null,
      gameSettings || null
    );

    if (finalGameSettings?.deduction === 'HOST_DEDUCTION' || finalGameSettings?.deduction === 'CLUB_DEDUCTION') {
      const rounds = finalGameSettings?.rounds || 1;
      const requiredCards = rounds * 4;
      const clubCardBalance = club?.cardCount ?? 0;
      if (clubCardBalance < requiredCards) {
        return errorResponse(
          res,
          `俱樂部房卡不足無法創建房間\n需要：${requiredCards} 張，目前：${clubCardBalance} 張`,
          null,
          400
        );
      }
    }

    // 創建房間
    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: club.id,
        creatorId: roomCreatorId,
        currentPlayers: 0,
        maxPlayers: maxPlayers || 4,
        status: 'WAITING',
        multiplayerVersion: normalizedMultiplayerVersion,
        gameSettings: finalGameSettings,
      },
    });

    return successResponse(res, room, '房間創建成功');
  } catch (error) {
    console.error('[Clubs API] 創建房間失敗:', error);
    return errorResponse(res, '創建房間失敗', error.message, 500);
  }
});

/**
 * GET /api/client/players/:playerId/clubs
 * 獲取玩家加入的俱樂部列表
 */
router.get('/players/:playerId/clubs', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId } = req.params;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const memberships = await prisma.clubMember.findMany({
      where: { playerId: playerId },
      include: {
        club: {
          select: {
            id: true,
            clubId: true,
            name: true,
            cardCount: true,
            avatarUrl: true,
            creator: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
              },
            },
            members: {
              select: {
                id: true,
                playerId: true,
                role: true,
                bannedTablePlayers: true,
                player: {
                  select: {
                    id: true,
                    userId: true,
                    nickname: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    // 將 memberships 轉換為 clubs 陣列（前端期望的格式）
    const clubs = memberships.map((membership) => membership.club);

    return successResponse(res, clubs);
  } catch (error) {
    console.error('[Clubs API] 獲取玩家俱樂部列表失敗:', error);
    return errorResponse(res, '獲取玩家俱樂部列表失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/members
 * 獲取俱樂部成員列表
 */
router.get('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return successResponse(res, members);
  } catch (error) {
    console.error('[Clubs API] 獲取成員列表失敗:', error);
    return errorResponse(res, '獲取成員列表失敗', null, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members
 * 添加成員到俱樂部（加入俱樂部）
 */
router.post('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId } = req.body;

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    // 檢查玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    // 檢查是否已經是成員
    const existingMember = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    if (existingMember) {
      return errorResponse(res, '玩家已經是俱樂部成員', null, 400);
    }

    // 添加成員
    const member = await prisma.clubMember.create({
      data: {
        clubId: club.id,
        playerId: playerId,
      },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
    });

    return successResponse(res, member, '成員添加成功');
  } catch (error) {
    console.error('[Clubs API] 添加成員失敗:', error);
    return errorResponse(res, '添加成員失敗', error.message, 500);
  }
});

/**
 * DELETE /api/client/clubs/:clubId/members
 * 退出俱樂部（刪除成員）
 */
router.delete('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId, action } = req.query;

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const resolvedAction = (action || '').toString().toLowerCase();
    const actorId = isNonEmptyString(actorPlayerId) ? actorPlayerId.toString() : null;
    const isKick = resolvedAction === 'kick' || (actorId && actorId !== playerId.toString());
    if (isKick) {
      if (!isNonEmptyString(actorId)) {
        return errorResponse(res, '請提供操作者ID', null, 400);
      }
    } else {
      if (actorId && actorId !== playerId.toString()) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId.toString()) {
      return errorResponse(res, '不可移除擁有者', null, 400);
    }

    if (isKick) {
      const authz = await requireClubOwnerOrPermission(
        prisma,
        club.id,
        actorId,
        'kickMembers'
      );
      if (!authz.ok) {
        return errorResponse(res, authz.error, null, authz.status);
      }
    }

    // 檢查成員是否存在
    const member = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    // 刪除成員
    await prisma.clubMember.delete({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    await createClubActivity(prisma, club.id, isKick ? 'MEMBER_KICKED' : 'MEMBER_LEFT', {
      actorPlayerId: (actorId ?? playerId.toString()),
      targetPlayerId: playerId.toString(),
    });

    return successResponse(res, null, '退出俱樂部成功');
  } catch (error) {
    console.error('[Clubs API] 退出俱樂部失敗:', error);
    return errorResponse(res, '退出俱樂部失敗', error.message, 500);
  }
});

router.post('/:clubId/members/role', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, role, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const nextRole = (role ?? '').toString().toUpperCase();
    if (nextRole !== 'CO_LEADER' && nextRole !== 'MEMBER') {
      return errorResponse(res, '無效的角色', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId !== actorPlayerId) {
      return errorResponse(res, '沒有權限', null, 403);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: nextRole === 'MEMBER' ? { role: nextRole, coLeaderPermissions: null } : { role: nextRole },
    });

    return successResponse(res, updated, '更新成員角色成功');
  } catch (error) {
    console.error('[Clubs API] 更新成員角色失敗:', error);
    return errorResponse(res, '更新成員角色失敗', error.message, 500);
  }
});

router.post('/:clubId/members/ban', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可封禁擁有者', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banMembers'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { isBanned: true },
    });

    await createClubActivity(prisma, club.id, 'MEMBER_KICKED', {
      actorPlayerId: actorPlayerId ?? null,
      targetPlayerId: playerId,
    });

    return successResponse(res, updated, '封禁成員成功');
  } catch (error) {
    console.error('[Clubs API] 封禁成員失敗:', error);
    return errorResponse(res, '封禁成員失敗', error.message, 500);
  }
});

router.post('/:clubId/members/unban', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banMembers'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { isBanned: false },
    });

    return successResponse(res, updated, '解禁成員成功');
  } catch (error) {
    console.error('[Clubs API] 解禁成員失敗:', error);
    return errorResponse(res, '解禁成員失敗', error.message, 500);
  }
});

router.post('/:clubId/members/score-limit', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, scoreLimit, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'setScoreLimit'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const parsed =
      scoreLimit === null || scoreLimit === undefined
        ? null
        : Number.isFinite(Number(scoreLimit))
        ? Number(scoreLimit)
        : null;

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { scoreLimit: parsed },
    });

    return successResponse(res, updated, '設定分數上限成功');
  } catch (error) {
    console.error('[Clubs API] 設定分數上限失敗:', error);
    return errorResponse(res, '設定分數上限失敗', error.message, 500);
  }
});

router.post('/:clubId/members/no-same-table', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, enabled, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banSameTable'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { noSameTable: Boolean(enabled) },
    });

    return successResponse(res, updated, '設定禁止同桌成功');
  } catch (error) {
    console.error('[Clubs API] 設定禁止同桌失敗:', error);
    return errorResponse(res, '設定禁止同桌失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members/banned-table-players
 * 設定禁止同桌的玩家列表
 */
router.post('/:clubId/members/banned-table-players', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, bannedPlayerIds, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banSameTable'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { bannedTablePlayers: bannedPlayerIds || [] },
    });

    return successResponse(res, updated, '設定禁止同桌玩家成功');
  } catch (error) {
    console.error('[Clubs API] 設定禁止同桌玩家失敗:', error);
    return errorResponse(res, '設定禁止同桌失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/table-restrictions/check-join
 * v2 即時伺服器用：檢查加入者與房內玩家是否雙向禁止同桌（與 server.js joinTable 邏輯一致）
 */
router.post('/:clubId/table-restrictions/check-join', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { joinerPlayerId, seatedPlayerIds } = req.body || {};

    if (!isNonEmptyString(joinerPlayerId)) {
      return errorResponse(res, '請提供加入者玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const ids = Array.isArray(seatedPlayerIds)
      ? [...new Set(seatedPlayerIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
      : [];

    if (ids.length === 0) {
      return successResponse(res, { ok: true }, '禁止同桌檢查通過');
    }

    const joinerMember = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: { clubId: club.id, playerId: joinerPlayerId },
      },
      select: { bannedTablePlayers: true },
    });
    const joinerBanned = joinerMember?.bannedTablePlayers || [];
    for (const ep of ids) {
      if (joinerBanned.includes(ep)) {
        return successResponse(
          res,
          {
            ok: false,
            message: '您與房內玩家有禁止同桌設定，無法加入',
          },
          '禁止同桌'
        );
      }
    }

    const others = await prisma.clubMember.findMany({
      where: {
        clubId: club.id,
        playerId: { in: ids },
      },
      select: { playerId: true, bannedTablePlayers: true },
    });
    for (const row of others) {
      const list = row.bannedTablePlayers || [];
      if (list.includes(joinerPlayerId)) {
        return successResponse(
          res,
          {
            ok: false,
            message: '您與房內玩家有禁止同桌設定，無法加入',
          },
          '禁止同桌'
        );
      }
    }

    return successResponse(res, { ok: true }, '禁止同桌檢查通過');
  } catch (error) {
    console.error('[Clubs API] 禁止同桌加入檢查失敗:', error);
    return errorResponse(res, '禁止同桌加入檢查失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members/co-leader-permissions
 * 設定副會長權限
 */
router.post('/:clubId/members/co-leader-permissions', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, permissions, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId !== actorPlayerId) {
      return errorResponse(res, '沒有權限', null, 403);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    if (member.role !== 'CO_LEADER') {
      return errorResponse(res, '僅可設定副會長權限', null, 400);
    }

    const normalized = normalizeBoolPermissions(permissions);

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { coLeaderPermissions: normalized },
    });

    return successResponse(res, updated, '設定副會長權限成功');
  } catch (error) {
    console.error('[Clubs API] 設定副會長權限失敗:', error);
    return errorResponse(res, '設定副會長權限失敗', error.message, 500);
  }
});

/**
 * PUT /api/client/clubs/:clubId
 * 更新俱樂部資訊（名稱/描述/Logo/房卡數）
 */
router.put('/:clubId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { name, description, logoUrl, cardCount, actorPlayerId } = req.body || {};

    if (
      name === undefined &&
      description === undefined &&
      logoUrl === undefined &&
      cardCount === undefined
    ) {
      return errorResponse(res, '請提供要更新的欄位', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const needsModifyRules = name !== undefined || description !== undefined || logoUrl !== undefined;
      const needsManageCards = cardCount !== undefined;
      if (needsModifyRules) {
        const canModify = actorMember?.role === 'CO_LEADER' && perms?.modifyClubRules === true;
        if (!canModify) return errorResponse(res, '沒有權限', null, 403);
      }
      if (needsManageCards) {
        const canManage = actorMember?.role === 'CO_LEADER' && perms?.manageRoomCards === true;
        if (!canManage) return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = String(description);
    if (logoUrl !== undefined) data.logoUrl = logoUrl ? String(logoUrl) : null;
    if (cardCount !== undefined) data.cardCount = Number(cardCount) || 0;

    const updated = await prisma.club.update({
      where: { id: club.id },
      data,
      select: {
        id: true,
        clubId: true,
        name: true,
        cardCount: true,
        avatarUrl: true,
        logoUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse(res, updated, '俱樂部資訊已更新');
  } catch (error) {
    console.error('[Clubs API] 更新俱樂部資訊失敗:', error);
    return errorResponse(res, '更新俱樂部資訊失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/game-settings
 * 獲取俱樂部遊戲設定
 */
router.get('/:clubId/game-settings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const fullClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: {
        id: true,
        clubId: true,
        name: true,
        gameSettings: true,
      },
    });

    return successResponse(res, {
      game_settings: fullClub.gameSettings || null,
    });
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部遊戲設定失敗:', error);
    return errorResponse(res, '獲取俱樂部遊戲設定失敗', error.message, 500);
  }
});

/**
 * PUT /api/client/clubs/:clubId/game-settings
 * 更新俱樂部遊戲設定
 */
router.put('/:clubId/game-settings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { gameSettings, actorPlayerId } = req.body;

    if (!gameSettings) {
      return errorResponse(res, '請提供遊戲設定', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'modifyClubRules'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    // 更新遊戲設定
    const updatedClub = await prisma.club.update({
      where: { id: club.id },
      data: {
        gameSettings: gameSettings,
      },
      select: {
        id: true,
        clubId: true,
        name: true,
        gameSettings: true,
      },
    });

    return successResponse(res, {
      game_settings: updatedClub.gameSettings,
    }, '遊戲設定更新成功');
  } catch (error) {
    console.error('[Clubs API] 更新俱樂部遊戲設定失敗:', error);
    return errorResponse(res, '更新俱樂部遊戲設定失敗', error.message, 500);
  }
});

module.exports = router;
