import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseTaipeiDateEnd, parseTaipeiDateStart } from '@/lib/taipei-time'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

/** 舊版查詢參數相容 */
const STATUS_ALIASES: Record<string, AdminGeneralCategory> = {
  FINISHED: 'COMPLETED_FULL',
  DISBANDED: 'DISBANDED_MID',
  IN_PROGRESS: 'LIVE',
}

type AdminGeneralCategory =
  | 'ALL'
  | 'COMPLETED_FULL'
  | 'DISBANDED_MID'
  | 'LIVE'
  | 'ERROR'

function normalizeCategory(raw: string): AdminGeneralCategory {
  const u = (raw || 'ALL').toUpperCase()
  if (u === 'ALL') return 'ALL'
  const mapped = STATUS_ALIASES[u]
  if (mapped) return mapped
  if (
    u === 'COMPLETED_FULL' ||
    u === 'DISBANDED_MID' ||
    u === 'LIVE' ||
    u === 'ERROR'
  ) {
    return u
  }
  return 'ALL'
}

function isLiveSessionRow(
  row: {
    status: string
    roomCode: string
    roomInternalId: string | null
  },
  playingInternalIds: Set<string>,
  playingRoomCodes: Set<string>
): boolean {
  if (row.status !== 'IN_PROGRESS') return false
  if (row.roomInternalId && playingInternalIds.has(row.roomInternalId)) return true
  if (playingRoomCodes.has(row.roomCode)) return true
  return false
}

function classifyRecord(
  row: {
    id: string
    status: string
    roomCode: string
    roomInternalId: string | null
  },
  roundCount: number,
  participantCount: number,
  playingInternalIds: Set<string>,
  playingRoomCodes: Set<string>,
  wrongParticipantIdSet: Set<string>
): { code: AdminGeneralCategory; label: string } {
  const live = isLiveSessionRow(row, playingInternalIds, playingRoomCodes)

  if (
    participantCount === 0 ||
    wrongParticipantIdSet.has(row.id) ||
    ((row.status === 'FINISHED' || row.status === 'DISBANDED') && roundCount === 0) ||
    (row.status === 'IN_PROGRESS' && !live)
  ) {
    return { code: 'ERROR', label: '錯誤戰績' }
  }
  if (row.status === 'FINISHED' && roundCount >= 1) {
    return { code: 'COMPLETED_FULL', label: '全局完結' }
  }
  if (row.status === 'DISBANDED' && roundCount >= 1) {
    return { code: 'DISBANDED_MID', label: '中途解散' }
  }
  if (row.status === 'IN_PROGRESS' && live) {
    return { code: 'LIVE', label: '進行中' }
  }
  return { code: 'ERROR', label: '錯誤戰績' }
}

async function fetchWrongParticipantSessionIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT s.id FROM "v2_match_sessions" s
    WHERE s."clubId" IS NULL
    AND (SELECT COUNT(*)::int FROM "v2_match_participants" p WHERE p."sessionId" = s.id) <> 4
  `)
  return rows.map((r) => r.id)
}

/**
 * GET /api/admin/game-records/general
 * 非俱樂部房（clubId 為 null）的 V2 對局
 *
 * Query: page, pageSize, keyword, status, startDate, endDate
 * status（戰績分類）:
 * - ALL
 * - COMPLETED_FULL — 全局完結（session FINISHED 且至少 1 局戰績）
 * - DISBANDED_MID — 中途解散（DISBANDED 且至少 1 局）
 * - LIVE — 進行中（IN_PROGRESS 且對應大廳房間仍為 PLAYING，即仍存活且對局中）
 * - ERROR — 錯誤戰績（參與者非 4 人、已結束/解散但 0 局、或 IN_PROGRESS 但房間已非對局中等）
 *
 * 相容舊參數：FINISHED→COMPLETED_FULL，DISBANDED→DISBANDED_MID，IN_PROGRESS→LIVE
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
    const keyword = (searchParams.get('keyword') || '').trim()
    const category = normalizeCategory(searchParams.get('status') || 'ALL')
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()

    const playingLobbyRooms = await prisma.room.findMany({
      where: {
        clubId: null,
        status: 'PLAYING',
      },
      select: { id: true, roomId: true },
    })
    const playingInternalIds = new Set(playingLobbyRooms.map((r) => r.id))
    const playingRoomCodes = new Set(playingLobbyRooms.map((r) => r.roomId))

    const wrongParticipantIds = await fetchWrongParticipantSessionIds()
    const wrongParticipantIdSet = new Set(wrongParticipantIds)

    const andParts: Prisma.V2MatchSessionWhereInput[] = [{ clubId: null }]

    if (category === 'COMPLETED_FULL') {
      andParts.push({ status: 'FINISHED', rounds: { some: {} } })
    } else if (category === 'DISBANDED_MID') {
      andParts.push({ status: 'DISBANDED', rounds: { some: {} } })
    } else if (category === 'LIVE') {
      if (playingInternalIds.size === 0 && playingRoomCodes.size === 0) {
        andParts.push({ id: '__admin_no_live_lobby_room__' })
      } else {
        andParts.push({
          status: 'IN_PROGRESS',
          OR: [
            ...(playingInternalIds.size
              ? [{ roomInternalId: { in: [...playingInternalIds] } }]
              : []),
            ...(playingRoomCodes.size
              ? [{ roomCode: { in: [...playingRoomCodes] } }]
              : []),
          ],
        })
      }
    } else if (category === 'ERROR') {
      const hasLiveLobbyRoom = playingInternalIds.size > 0 || playingRoomCodes.size > 0
      const inProgressAbnormal: Prisma.V2MatchSessionWhereInput = hasLiveLobbyRoom
        ? {
            AND: [
              { status: 'IN_PROGRESS' },
              {
                NOT: {
                  OR: [
                    ...(playingInternalIds.size
                      ? [{ roomInternalId: { in: [...playingInternalIds] } }]
                      : []),
                    ...(playingRoomCodes.size
                      ? [{ roomCode: { in: [...playingRoomCodes] } }]
                      : []),
                  ],
                },
              },
            ],
          }
        : { status: 'IN_PROGRESS' }

      const errorOr: Prisma.V2MatchSessionWhereInput[] = [
        { participants: { none: {} } },
        {
          AND: [
            { status: { in: ['FINISHED', 'DISBANDED'] } },
            { rounds: { none: {} } },
          ],
        },
        ...(wrongParticipantIds.length
          ? [{ id: { in: wrongParticipantIds } }]
          : []),
        inProgressAbnormal,
      ]
      andParts.push({ OR: errorOr })
    }

    if (keyword) {
      andParts.push({
        OR: [
          { roomCode: { contains: keyword } },
          {
            participants: {
              some: {
                OR: [
                  { userId: { contains: keyword, mode: 'insensitive' } },
                  { nickname: { contains: keyword, mode: 'insensitive' } },
                  { player: { userId: { contains: keyword } } },
                  { player: { nickname: { contains: keyword, mode: 'insensitive' } } },
                ],
              },
            },
          },
        ],
      })
    }

    if (startRaw || endRaw) {
      const timeFilter: Prisma.DateTimeFilter = {}
      if (startRaw) {
        const s = parseTaipeiDateStart(startRaw)
        if (s) timeFilter.gte = s
      }
      if (endRaw) {
        const e = parseTaipeiDateEnd(endRaw)
        if (e) timeFilter.lte = e
      }
      if (Object.keys(timeFilter).length > 0) {
        andParts.push({
          OR: [
            { endedAt: timeFilter },
            { AND: [{ endedAt: null }, { startedAt: timeFilter }] },
          ],
        })
      }
    }

    const where: Prisma.V2MatchSessionWhereInput =
      andParts.length === 1 ? andParts[0]! : { AND: andParts }

    const [total, rows] = await Promise.all([
      prisma.v2MatchSession.count({ where }),
      prisma.v2MatchSession.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }],
        include: {
          participants: {
            include: {
              player: {
                select: { id: true, userId: true, nickname: true, avatarUrl: true },
              },
            },
          },
          rounds: {
            select: { id: true, roundIndex: true, shareCode: true, endedAt: true },
            orderBy: { roundIndex: 'asc' },
          },
        },
      }),
    ])

    const items = rows.map((s) => {
      const gameSettings =
        s.gameSettings && typeof s.gameSettings === 'object' && !Array.isArray(s.gameSettings)
          ? (s.gameSettings as Record<string, unknown>)
          : {}
      const gameType = (gameSettings.game_type as string) || 'NORTHERN'
      const gameTypeLabel = gameType === 'SOUTHERN' ? '南部麻將' : '北部麻將'

      const players = (s.participants || []).map((p) => ({
        playerId: p.playerId,
        userId: p.userId ?? p.player?.userId ?? null,
        nickname: (p.nickname || p.player?.nickname || '').trim() || '—',
        avatarUrl: p.avatarUrl ?? p.player?.avatarUrl ?? null,
        seat: p.seat,
        isHost: p.isHost === true,
        matchTotalScore: p.matchTotalScore ?? 0,
      }))

      let best: number | null = null
      for (const pl of players) {
        const sc = Number(pl.matchTotalScore) || 0
        if (best === null || sc > best) best = sc
      }
      const bigWinnerPlayerIds =
        best === null
          ? []
          : players.filter((pl) => (Number(pl.matchTotalScore) || 0) === best).map((pl) => pl.playerId)

      const replayCodes = (s.rounds || [])
        .map((r) => r.shareCode)
        .filter((c): c is string => !!c && c.length > 0)

      const roundCount = s.rounds?.length ?? 0
      const participantCount = s.participants?.length ?? 0
      const { code: recordCategory, label: recordCategoryLabel } = classifyRecord(
        {
          id: s.id,
          status: s.status,
          roomCode: s.roomCode,
          roomInternalId: s.roomInternalId,
        },
        roundCount,
        participantCount,
        playingInternalIds,
        playingRoomCodes,
        wrongParticipantIdSet
      )

      return {
        id: s.id,
        roomCode: s.roomCode,
        roomInternalId: s.roomInternalId,
        hostPlayerId: s.hostPlayerId,
        status: s.status,
        multiplayerVersion: s.multiplayerVersion,
        gameTypeLabel,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        roundCount,
        replayCodes,
        lastReplayCode: replayCodes.length ? replayCodes[replayCodes.length - 1] : null,
        players,
        bigWinnerPlayerIds,
        recordCategory,
        recordCategoryLabel,
      }
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          items,
          total,
          page,
          pageSize,
          /** 供前端「進行中」輪詢提示：大廳 PLAYING 房數 */
          liveLobbyRoomCount: playingLobbyRooms.length,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] game-records/general GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得一般對戰紀錄失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
