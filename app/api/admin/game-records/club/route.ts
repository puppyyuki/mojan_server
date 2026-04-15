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

type RecordCategory =
  | 'ALL'
  | 'COMPLETED_FULL'
  | 'DISBANDED_MID'
  | 'LIVE'
  | 'ERROR'

const CATEGORY_ALIASES: Record<string, RecordCategory> = {
  FINISHED: 'COMPLETED_FULL',
  DISBANDED: 'DISBANDED_MID',
  IN_PROGRESS: 'LIVE',
}

function normalizeRecordCategory(raw: string): RecordCategory {
  const u = (raw || 'ALL').toUpperCase()
  if (u === 'ALL') return 'ALL'
  const m = CATEGORY_ALIASES[u]
  if (m) return m
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

function classifyClubGameResultRow(playersJson: unknown, totalRounds: number) {
  const players = Array.isArray(playersJson) ? playersJson : []
  const pc = players.length
  if (totalRounds < 1 || pc !== 4) {
    return { recordCategory: 'ERROR' as const, recordCategoryLabel: '錯誤戰績' }
  }
  return {
    recordCategory: 'COMPLETED_FULL' as const,
    recordCategoryLabel: '全局完結',
  }
}

/** 結算表：戰績分類為「全局完結／錯誤」時篩選 id（players 為長度 4 的 JSON 陣列且 totalRounds>=1） */
async function clubResultIdsForCategory(
  category: 'COMPLETED_FULL' | 'ERROR'
): Promise<string[]> {
  if (category === 'COMPLETED_FULL') {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT cgr.id FROM "club_game_results" cgr
      WHERE cgr."totalRounds" >= 1
      AND jsonb_typeof(cgr.players::jsonb) = 'array'
      AND jsonb_array_length(cgr.players::jsonb) = 4
    `)
    return rows.map((r) => r.id)
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT cgr.id FROM "club_game_results" cgr
    WHERE cgr."totalRounds" < 1
    OR jsonb_typeof(cgr.players::jsonb) != 'array'
    OR jsonb_array_length(COALESCE(cgr.players::jsonb, '[]'::jsonb)) != 4
  `)
  return rows.map((r) => r.id)
}

function mapClubGameResultRow(
  r: {
    id: string
    roomId: string
    roomInternalId: string | null
    multiplayerVersion: string
    totalRounds: number
    deduction: string
    roomCardConsumedTotal: number
    bigWinnerPlayerIds: string[]
    players: unknown
    endedAt: Date
    createdAt: Date
    club: { id: string; clubId: string; name: string }
  },
  forcedLabel?: { recordCategory: string; recordCategoryLabel: string }
) {
  const players = Array.isArray(r.players) ? (r.players as Record<string, unknown>[]) : []
  const playerSummaries = players.map((p) => ({
    playerId: String(p.playerId ?? ''),
    userId: p.userId != null ? String(p.userId) : null,
    nickname: String(p.nickname ?? '—'),
    seat: typeof p.seat === 'number' ? p.seat : null,
    score: Number(p.score ?? 0) || 0,
    isBigWinner: p.isBigWinner === true,
    roomCardConsumed: Number(p.roomCardConsumed ?? 0) || 0,
    rank: typeof p.rank === 'number' ? p.rank : null,
  }))
  const bigIds = new Set((r.bigWinnerPlayerIds || []).map(String))
  const bigWinnerLabels = playerSummaries
    .filter((p) => bigIds.has(p.playerId))
    .map((p) => p.nickname)
  const scoreLine = [...playerSummaries]
    .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
    .map((p) => `${p.nickname}:${p.score}`)
    .join(' / ')

  const cls = forcedLabel ?? classifyClubGameResultRow(r.players, r.totalRounds)

  return {
    id: r.id,
    roomId: r.roomId,
    roomInternalId: r.roomInternalId,
    multiplayerVersion: r.multiplayerVersion,
    totalRounds: r.totalRounds,
    deduction: r.deduction,
    roomCardConsumedTotal: r.roomCardConsumedTotal,
    bigWinnerPlayerIds: r.bigWinnerPlayerIds || [],
    bigWinnerLabels,
    scoreLine,
    playerSummaries,
    endedAt: r.endedAt,
    createdAt: r.createdAt,
    club: r.club,
    listRowKind: 'settlement' as const,
    recordCategory: cls.recordCategory,
    recordCategoryLabel: cls.recordCategoryLabel,
  }
}

function normalizeSessionDeduction(gameSettings: unknown): 'AA_DEDUCTION' | 'HOST_DEDUCTION' | 'CLUB_DEDUCTION' {
  if (!gameSettings || typeof gameSettings !== 'object' || Array.isArray(gameSettings)) {
    return 'AA_DEDUCTION'
  }
  const raw = String((gameSettings as Record<string, unknown>).deduction || '').toUpperCase()
  if (raw === 'HOST_DEDUCTION' || raw === 'CLUB_DEDUCTION') return raw
  return 'AA_DEDUCTION'
}

function normalizeSessionRounds(gameSettings: unknown): 1 | 2 | 4 {
  if (!gameSettings || typeof gameSettings !== 'object' || Array.isArray(gameSettings)) {
    return 1
  }
  const rounds = Number((gameSettings as Record<string, unknown>).rounds)
  if (rounds === 2 || rounds === 4) return rounds
  return 1
}

function deductionFilterMatch(
  deductionFilter: string,
  sessionDeduction: 'AA_DEDUCTION' | 'HOST_DEDUCTION' | 'CLUB_DEDUCTION'
): boolean {
  if (deductionFilter === 'ALL') return true
  if (deductionFilter === 'AA_DEDUCTION') return sessionDeduction === 'AA_DEDUCTION'
  if (deductionFilter === 'CLUB') {
    return sessionDeduction === 'HOST_DEDUCTION' || sessionDeduction === 'CLUB_DEDUCTION'
  }
  return sessionDeduction === deductionFilter
}

/**
 * GET /api/admin/game-records/club
 *
 * recordCategory（戰績分類）:
 * - ALL — ClubGameResult（結算） + 俱樂部 V2 session（中途解散／進行中）
 * - COMPLETED_FULL — 結算表：局數≥1 且 players 為 4 人
 * - ERROR — 結算表：資料異常（局數或人數不符等）
 * - DISBANDED_MID — 俱樂部 V2 session：DISBANDED（不限制局數）
 * - LIVE — 俱樂部 V2 session：IN_PROGRESS 且對應俱樂部房仍為 PLAYING
 *
 * deduction: ALL | AA_DEDUCTION | CLUB（+ 舊 HOST/CLUB_DEDUCTION）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
    const keyword = (searchParams.get('keyword') || '').trim()
    const clubSixId = (searchParams.get('clubSixId') || '').trim()
    const version = (searchParams.get('version') || 'ALL').toUpperCase()
    const deduction = (searchParams.get('deduction') || 'ALL').toUpperCase()
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()
    const recordCategory = normalizeRecordCategory(
      searchParams.get('recordCategory') || searchParams.get('status') || 'ALL'
    )

    if (recordCategory === 'LIVE' || recordCategory === 'DISBANDED_MID') {
      return handleClubV2Sessions({
        page,
        pageSize,
        keyword,
        clubSixId,
        version,
        deduction,
        startRaw,
        endRaw,
        mode: recordCategory,
      })
    }

    if (recordCategory === 'ALL') {
      return handleClubAllRecords({
        page,
        pageSize,
        keyword,
        clubSixId,
        version,
        deduction,
        startRaw,
        endRaw,
      })
    }

    const where: Prisma.ClubGameResultWhereInput = {}

    if (clubSixId) {
      where.club = { clubId: { contains: clubSixId } }
    }

    if (keyword) {
      const kw = keyword
      where.OR = [
        { roomId: { contains: kw } },
        { club: { clubId: { contains: kw } } },
        { club: { name: { contains: kw, mode: 'insensitive' } } },
      ]
    }

    if (startRaw || endRaw) {
      where.endedAt = {}
      if (startRaw) {
        const s = parseTaipeiDateStart(startRaw)
        if (s) where.endedAt.gte = s
      }
      if (endRaw) {
        const e = parseTaipeiDateEnd(endRaw)
        if (e) where.endedAt.lte = e
      }
    }

    if (version === 'V1' || version === 'V2') {
      where.multiplayerVersion = version as 'V1' | 'V2'
    }

    if (deduction === 'AA_DEDUCTION') {
      where.deduction = 'AA_DEDUCTION'
    } else if (deduction === 'CLUB') {
      where.deduction = { in: ['HOST_DEDUCTION', 'CLUB_DEDUCTION'] }
    } else if (deduction === 'HOST_DEDUCTION' || deduction === 'CLUB_DEDUCTION') {
      where.deduction = deduction
    }

    if (recordCategory === 'COMPLETED_FULL' || recordCategory === 'ERROR') {
      const ids = await clubResultIdsForCategory(recordCategory)
      if (ids.length === 0) {
        return NextResponse.json(
          {
            success: true,
            data: { items: [], total: 0, page, pageSize, liveClubPlayingRoomCount: null },
          },
          { headers: corsHeaders() }
        )
      }
      where.id = { in: ids }
    }

    const [total, rows] = await Promise.all([
      prisma.clubGameResult.count({ where }),
      prisma.clubGameResult.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          club: {
            select: { id: true, clubId: true, name: true },
          },
        },
      }),
    ])

    const playingClubRooms = await prisma.room.count({
      where: { clubId: { not: null }, status: 'PLAYING' },
    })

    const items = rows.map((r) =>
      mapClubGameResultRow(
        {
          ...r,
          bigWinnerPlayerIds: r.bigWinnerPlayerIds || [],
        },
        recordCategory === 'COMPLETED_FULL'
          ? { recordCategory: 'COMPLETED_FULL', recordCategoryLabel: '全局完結' }
          : recordCategory === 'ERROR'
            ? { recordCategory: 'ERROR', recordCategoryLabel: '錯誤戰績' }
            : undefined
      )
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          items,
          total,
          page,
          pageSize,
          liveClubPlayingRoomCount: playingClubRooms,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] game-records/club GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得俱樂部對戰紀錄失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

async function handleClubAllRecords(opts: {
  page: number
  pageSize: number
  keyword: string
  clubSixId: string
  version: string
  deduction: string
  startRaw: string
  endRaw: string
}) {
  const { page, pageSize, keyword, clubSixId, version, deduction, startRaw, endRaw } = opts

  const playingClubRooms = await prisma.room.findMany({
    where: { clubId: { not: null }, status: 'PLAYING' },
    select: { id: true, roomId: true },
  })
  const playingInternalIds = new Set(playingClubRooms.map((r) => r.id))
  const playingRoomCodes = new Set(playingClubRooms.map((r) => r.roomId))

  const matchedClubs = clubSixId
    ? await prisma.club.findMany({
        where: { clubId: { contains: clubSixId } },
        select: { id: true },
      })
    : []
  const clubIds = matchedClubs.map((c) => c.id)

  const settlementWhere: Prisma.ClubGameResultWhereInput = {}
  if (clubSixId) {
    settlementWhere.club =
      clubIds.length === 0 ? { id: '__admin_club_six_no_match__' } : { id: { in: clubIds } }
  }
  if (keyword) {
    settlementWhere.OR = [
      { roomId: { contains: keyword } },
      { club: { clubId: { contains: keyword } } },
      { club: { name: { contains: keyword, mode: 'insensitive' } } },
    ]
  }
  if (startRaw || endRaw) {
    settlementWhere.endedAt = {}
    if (startRaw) {
      const s = parseTaipeiDateStart(startRaw)
      if (s) settlementWhere.endedAt.gte = s
    }
    if (endRaw) {
      const e = parseTaipeiDateEnd(endRaw)
      if (e) settlementWhere.endedAt.lte = e
    }
  }
  if (version === 'V1' || version === 'V2') {
    settlementWhere.multiplayerVersion = version as 'V1' | 'V2'
  }
  if (deduction === 'AA_DEDUCTION') {
    settlementWhere.deduction = 'AA_DEDUCTION'
  } else if (deduction === 'CLUB') {
    settlementWhere.deduction = { in: ['HOST_DEDUCTION', 'CLUB_DEDUCTION'] }
  } else if (deduction === 'HOST_DEDUCTION' || deduction === 'CLUB_DEDUCTION') {
    settlementWhere.deduction = deduction
  }

  const sessionAndParts: Prisma.V2MatchSessionWhereInput[] = [{ clubId: { not: null } }]
  const sessionStatusOr: Prisma.V2MatchSessionWhereInput[] = [{ status: 'DISBANDED' }]
  if (playingInternalIds.size > 0 || playingRoomCodes.size > 0) {
    sessionStatusOr.push({
      status: 'IN_PROGRESS',
      OR: [
        ...(playingInternalIds.size ? [{ roomInternalId: { in: [...playingInternalIds] } }] : []),
        ...(playingRoomCodes.size ? [{ roomCode: { in: [...playingRoomCodes] } }] : []),
      ],
    })
  }
  sessionAndParts.push({ OR: sessionStatusOr })

  if (clubSixId) {
    if (clubIds.length === 0) {
      sessionAndParts.push({ id: '__admin_club_six_no_match__' })
    } else {
      sessionAndParts.push({ clubId: { in: clubIds } })
    }
  }
  if (keyword) {
    sessionAndParts.push({
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
  if (version === 'V1' || version === 'V2') {
    sessionAndParts.push({ multiplayerVersion: version as 'V1' | 'V2' })
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
      sessionAndParts.push({
        OR: [{ endedAt: timeFilter }, { AND: [{ endedAt: null }, { startedAt: timeFilter }] }],
      })
    }
  }

  const sessionWhere: Prisma.V2MatchSessionWhereInput =
    sessionAndParts.length === 1 ? sessionAndParts[0]! : { AND: sessionAndParts }

  const [settlementRows, sessions] = await Promise.all([
    prisma.clubGameResult.findMany({
      where: settlementWhere,
      orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
      include: { club: { select: { id: true, clubId: true, name: true } } },
    }),
    prisma.v2MatchSession.findMany({
      where: sessionWhere,
      orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }],
      include: {
        participants: {
          include: { player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } } },
        },
        rounds: {
          select: { id: true, roundIndex: true, shareCode: true, endedAt: true },
          orderBy: { roundIndex: 'asc' },
        },
      },
    }),
  ])

  const filteredSessions = sessions.filter((s) =>
    deductionFilterMatch(deduction, normalizeSessionDeduction(s.gameSettings))
  )

  const sessionClubIds = [
    ...new Set(
      filteredSessions.map((s) => s.clubId).filter((id): id is string => typeof id === 'string')
    ),
  ]
  const sessionClubs =
    sessionClubIds.length > 0
      ? await prisma.club.findMany({
          where: { id: { in: sessionClubIds } },
          select: { id: true, clubId: true, name: true },
        })
      : []
  const clubById = new Map(sessionClubs.map((c) => [c.id, c]))

  const settlementItems = settlementRows.map((r) =>
    mapClubGameResultRow({
      ...r,
      bigWinnerPlayerIds: r.bigWinnerPlayerIds || [],
    })
  )

  const sessionItems = filteredSessions.map((s) => {
    const players = (s.participants || []).map((p) => ({
      playerId: p.playerId,
      userId: p.userId ?? p.player?.userId ?? null,
      nickname: (p.nickname || p.player?.nickname || '').trim() || '—',
      seat: typeof p.seat === 'number' ? p.seat : null,
      score: p.matchTotalScore ?? 0,
      isBigWinner: false,
      roomCardConsumed: 0,
      rank: null,
    }))

    let best: number | null = null
    for (const pl of players) {
      const sc = Number(pl.score) || 0
      if (best === null || sc > best) best = sc
    }
    const bigWinnerPlayerIds =
      best === null
        ? []
        : players.filter((pl) => (Number(pl.score) || 0) === best).map((pl) => pl.playerId)
    const bigWinnerLabels = players
      .filter((pl) => bigWinnerPlayerIds.includes(pl.playerId))
      .map((pl) => pl.nickname)
    const scoreLine = [...players]
      .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
      .map((p) => `${p.nickname}:${p.score}`)
      .join(' / ')

    const sessionDeduction = normalizeSessionDeduction(s.gameSettings)
    const sessionRounds = normalizeSessionRounds(s.gameSettings)
    const roomCardConsumedTotal = (s.rounds?.length ?? 0) >= 1 ? sessionRounds * 4 : 0

    const isLive =
      s.status === 'IN_PROGRESS' &&
      ((!!s.roomInternalId && playingInternalIds.has(s.roomInternalId)) ||
        playingRoomCodes.has(s.roomCode))

    const category =
      s.status === 'DISBANDED' ? 'DISBANDED_MID' : isLive ? 'LIVE' : 'ERROR'
    const categoryLabel =
      category === 'DISBANDED_MID' ? '中途解散' : category === 'LIVE' ? '進行中' : '錯誤戰績'

    const club =
      (s.clubId && clubById.get(s.clubId)) || {
        id: s.clubId || '',
        clubId: '—',
        name: '（俱樂部資料缺失）',
      }

    return {
      id: s.id,
      roomId: s.roomCode,
      roomInternalId: s.roomInternalId,
      multiplayerVersion: s.multiplayerVersion,
      totalRounds: s.rounds?.length ?? 0,
      deduction: sessionDeduction,
      roomCardConsumedTotal,
      bigWinnerPlayerIds,
      bigWinnerLabels,
      scoreLine,
      playerSummaries: players,
      endedAt: s.endedAt ?? s.startedAt,
      createdAt: s.createdAt,
      club,
      listRowKind: 'session' as const,
      recordCategory: category,
      recordCategoryLabel: categoryLabel,
    }
  })

  const merged = [...settlementItems, ...sessionItems]
  const toTs = (v: Date | string | null | undefined) => {
    if (!v) return 0
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : 0
  }
  merged.sort((a, b) => {
    const endedDiff = toTs(b.endedAt) - toTs(a.endedAt)
    if (endedDiff !== 0) return endedDiff
    return toTs(b.createdAt) - toTs(a.createdAt)
  })

  const total = merged.length
  const items = merged.slice((page - 1) * pageSize, page * pageSize)

  return NextResponse.json(
    {
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        liveClubPlayingRoomCount: playingClubRooms.length,
      },
    },
    { headers: corsHeaders() }
  )
}

async function handleClubV2Sessions(opts: {
  page: number
  pageSize: number
  keyword: string
  clubSixId: string
  version: string
  deduction: string
  startRaw: string
  endRaw: string
  mode: 'LIVE' | 'DISBANDED_MID'
}) {
  const { page, pageSize, keyword, clubSixId, version, deduction, startRaw, endRaw, mode } = opts

  const playingClubRooms = await prisma.room.findMany({
    where: { clubId: { not: null }, status: 'PLAYING' },
    select: { id: true, roomId: true },
  })
  const playingInternalIds = new Set(playingClubRooms.map((r) => r.id))
  const playingRoomCodes = new Set(playingClubRooms.map((r) => r.roomId))

  const andParts: Prisma.V2MatchSessionWhereInput[] = [{ clubId: { not: null } }]

  if (mode === 'DISBANDED_MID') {
    andParts.push({ status: 'DISBANDED' })
  } else {
    if (playingInternalIds.size === 0 && playingRoomCodes.size === 0) {
      andParts.push({ id: '__admin_no_club_playing_room__' })
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
  }

  if (clubSixId) {
    const matchedClubs = await prisma.club.findMany({
      where: { clubId: { contains: clubSixId } },
      select: { id: true },
    })
    const ids = matchedClubs.map((c) => c.id)
    if (ids.length === 0) {
      andParts.push({ id: '__admin_club_six_no_match__' })
    } else {
      andParts.push({ clubId: { in: ids } })
    }
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

  if (version === 'V1' || version === 'V2') {
    andParts.push({ multiplayerVersion: version as 'V1' | 'V2' })
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

  const sessions = await prisma.v2MatchSession.findMany({
    where,
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
  })

  const filteredSessions = sessions.filter((s) =>
    deductionFilterMatch(deduction, normalizeSessionDeduction(s.gameSettings))
  )

  const total = filteredSessions.length
  const pagedSessions = filteredSessions.slice((page - 1) * pageSize, page * pageSize)

  const sessionClubIds = [
    ...new Set(pagedSessions.map((s) => s.clubId).filter((id): id is string => !!id)),
  ]
  const clubRows =
    sessionClubIds.length > 0
      ? await prisma.club.findMany({
          where: { id: { in: sessionClubIds } },
          select: { id: true, clubId: true, name: true },
        })
      : []
  const clubById = new Map(clubRows.map((c) => [c.id, c]))

  const items = pagedSessions.map((s) => {
    const sessionDeduction = normalizeSessionDeduction(s.gameSettings)
    const sessionRounds = normalizeSessionRounds(s.gameSettings)
    const roomCardConsumedTotal = (s.rounds?.length ?? 0) >= 1 ? sessionRounds * 4 : 0

    const players = (s.participants || []).map((p) => ({
      playerId: p.playerId,
      userId: p.userId ?? p.player?.userId ?? null,
      nickname: (p.nickname || p.player?.nickname || '').trim() || '—',
      seat: typeof p.seat === 'number' ? p.seat : null,
      score: p.matchTotalScore ?? 0,
      isBigWinner: false,
      roomCardConsumed: 0,
      rank: null,
    }))
    let best: number | null = null
    for (const pl of players) {
      const sc = Number(pl.score) || 0
      if (best === null || sc > best) best = sc
    }
    const bigWinnerPlayerIds =
      best === null
        ? []
        : players.filter((pl) => (Number(pl.score) || 0) === best).map((pl) => pl.playerId)
    const bigWinnerLabels = players
      .filter((pl) => bigWinnerPlayerIds.includes(pl.playerId))
      .map((pl) => pl.nickname)
    const scoreLine = [...players]
      .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
      .map((p) => `${p.nickname}:${p.score}`)
      .join(' / ')

    const club =
      (s.clubId && clubById.get(s.clubId)) || {
        id: s.clubId || '',
        clubId: '—',
        name: '（俱樂部資料缺失）',
      }

    const label = mode === 'LIVE' ? '進行中' : '中途解散'
    const cat = mode === 'LIVE' ? 'LIVE' : 'DISBANDED_MID'

    return {
      id: s.id,
      roomId: s.roomCode,
      roomInternalId: s.roomInternalId,
      multiplayerVersion: s.multiplayerVersion,
      totalRounds: s.rounds?.length ?? 0,
      deduction: sessionDeduction,
      roomCardConsumedTotal,
      bigWinnerPlayerIds,
      bigWinnerLabels,
      scoreLine,
      playerSummaries: players,
      endedAt: s.endedAt ?? s.startedAt,
      createdAt: s.createdAt,
      club,
      listRowKind: 'session' as const,
      recordCategory: cat,
      recordCategoryLabel: label,
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
        liveClubPlayingRoomCount: playingClubRooms.length,
      },
    },
    { headers: corsHeaders() }
  )
}
