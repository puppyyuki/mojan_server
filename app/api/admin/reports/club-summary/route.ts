import { NextRequest, NextResponse } from 'next/server'
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

/**
 * GET /api/admin/reports/club-summary
 * 俱樂部玩家報表：指定時間區間＋俱樂部 ID，彙整玩家戰績/大贏家/房卡消耗/場次（房卡與俱樂部排行榜一致，來自結算 players[].roomCardConsumed）
 * Query: startDate, endDate (YYYY-MM-DD), clubId（俱樂部 6 碼）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()
    const clubSixId = (searchParams.get('clubId') || '').trim()

    if (!startRaw || !endRaw || !clubSixId) {
      return NextResponse.json(
        {
          success: false,
          error: '請提供完整查詢條件（時間區間與俱樂部 ID）',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    const startAt = parseTaipeiDateStart(startRaw)
    const endAt = parseTaipeiDateEnd(endRaw)
    if (!startAt || !endAt) {
      return NextResponse.json(
        {
          success: false,
          error: '時間格式錯誤，請使用 YYYY-MM-DD',
        },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (startAt > endAt) {
      return NextResponse.json(
        {
          success: false,
          error: '開始日期不可晚於結束日期',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findFirst({
      where: { clubId: clubSixId },
      select: { id: true, clubId: true, name: true },
    })
    if (!club) {
      return NextResponse.json(
        {
          success: true,
          data: {
            rows: [],
            totals: {
              playerCount: 0,
              totalBattleScore: 0,
              totalRoomCardConsumed: 0,
              totalCompletedGames: 0,
            },
            filter: { startDate: startRaw, endDate: endRaw, clubId: clubSixId },
            club: { clubInternalId: null, clubSixId, clubName: '俱樂部不存在' },
          },
        },
        { headers: corsHeaders() }
      )
    }

    const gameResults = await prisma.clubGameResult.findMany({
      where: {
        clubId: club.id,
        endedAt: {
          gte: startAt,
          lte: endAt,
        },
      },
      orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        roomInternalId: true,
        totalRounds: true,
        players: true,
      },
    })

    const roomInternalIds = gameResults
      .map((row) => row.roomInternalId)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)

    const sessions = roomInternalIds.length
      ? await prisma.v2MatchSession.findMany({
          where: { roomInternalId: { in: roomInternalIds } },
          select: { id: true, roomInternalId: true, status: true },
        })
      : []

    const sessionByRoomInternalId = new Map<string, { id: string; status: string }>()
    for (const session of sessions) {
      if (!session.roomInternalId) continue
      sessionByRoomInternalId.set(session.roomInternalId, {
        id: session.id,
        status: session.status,
      })
    }

    const sessionIds = sessions.map((s) => s.id)
    const rounds = sessionIds.length
      ? await prisma.v2MatchRound.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { sessionId: true, roundIndex: true, roundEndPayload: true },
        })
      : []

    const roundsBySessionId = new Map<string, Map<number, unknown>>()
    for (const row of rounds) {
      let roundMap = roundsBySessionId.get(row.sessionId)
      if (!roundMap) {
        roundMap = new Map<number, unknown>()
        roundsBySessionId.set(row.sessionId, roundMap)
      }
      roundMap.set(row.roundIndex, row.roundEndPayload)
    }

    type PlayerAgg = {
      playerId: string
      userId: string
      nickname: string
      battleScore: number
      bigWinnerCount: number
      roomCardConsumed: number
      completedGames: number
    }

    const playerAggMap = new Map<string, PlayerAgg>()

    for (const result of gameResults) {
      const players = Array.isArray(result.players) ? result.players : []
      const roomInternalId = result.roomInternalId || ''
      const session = roomInternalId ? sessionByRoomInternalId.get(roomInternalId) : null
      const roundPayload = session
        ? roundsBySessionId.get(session.id)?.get(Number(result.totalRounds) || 0)
        : null

      const payloadObj =
        roundPayload && typeof roundPayload === 'object' && !Array.isArray(roundPayload)
          ? (roundPayload as Record<string, unknown>)
          : null
      const winnerSeat = Number(payloadObj?.winnerSeat ?? NaN)
      const isExhaustiveDraw = payloadObj?.isExhaustiveDraw === true
      const hasHuWinner = Number.isFinite(winnerSeat) && winnerSeat >= 0 && !isExhaustiveDraw
      const isCompletedGame = session?.status === 'FINISHED' && hasHuWinner

      for (const item of players) {
        if (!item || typeof item !== 'object') continue
        const p = item as Record<string, unknown>
        const playerId = typeof p.playerId === 'string' ? p.playerId : ''
        if (!playerId) continue

        const userId = typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : '—'
        const nickname =
          typeof p.nickname === 'string' && p.nickname.trim() ? p.nickname.trim() : '未知玩家'
        const score = Number(p.score ?? 0) || 0
        const roomCardConsumed = Number(p.roomCardConsumed ?? 0) || 0
        const isBigWinner = p.isBigWinner === true

        const existing = playerAggMap.get(playerId)
        if (!existing) {
          playerAggMap.set(playerId, {
            playerId,
            userId,
            nickname,
            battleScore: score,
            bigWinnerCount: isBigWinner ? 1 : 0,
            roomCardConsumed,
            completedGames: isCompletedGame ? 1 : 0,
          })
          continue
        }

        existing.battleScore += score
        existing.bigWinnerCount += isBigWinner ? 1 : 0
        existing.roomCardConsumed += roomCardConsumed
        if (isCompletedGame) {
          existing.completedGames += 1
        }
        if (existing.userId === '—' && userId !== '—') {
          existing.userId = userId
        }
        if (existing.nickname === '未知玩家' && nickname !== '未知玩家') {
          existing.nickname = nickname
        }
      }
    }

    const rows = Array.from(playerAggMap.values())
      .map((r) => ({
        timeRange: `${startRaw} ~ ${endRaw}`,
        clubSixId: club.clubId,
        clubName: club.name,
        playerDisplay: `${r.nickname} (${r.userId})`,
        playerId: r.playerId,
        playerUserId: r.userId,
        playerNickname: r.nickname,
        battleScore: r.battleScore,
        bigWinnerCount: r.bigWinnerCount,
        roomCardConsumed: r.roomCardConsumed,
        completedGames: r.completedGames,
      }))
      .sort((a, b) => {
        if (b.battleScore !== a.battleScore) return b.battleScore - a.battleScore
        if (b.completedGames !== a.completedGames) return b.completedGames - a.completedGames
        return b.bigWinnerCount - a.bigWinnerCount
      })

    const totals = rows.reduce(
      (acc, row) => {
        acc.playerCount += 1
        acc.totalBattleScore += row.battleScore
        acc.totalRoomCardConsumed += row.roomCardConsumed
        acc.totalCompletedGames += row.completedGames
        return acc
      },
      { playerCount: 0, totalBattleScore: 0, totalRoomCardConsumed: 0, totalCompletedGames: 0 }
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          rows,
          totals,
          filter: { startDate: startRaw, endDate: endRaw, clubId: clubSixId },
          club: {
            clubInternalId: club.id,
            clubSixId: club.clubId,
            clubName: club.name,
          },
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] reports/club-summary GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得俱樂部報表失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
