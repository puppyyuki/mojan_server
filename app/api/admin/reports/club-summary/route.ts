import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseTaipeiDateEnd, parseTaipeiDateStart } from '@/lib/taipei-time'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isV2RoundCompletedForStatistics } = require('../../../../../utils/v2RoundStatistics')

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
 * 俱樂部玩家報表：指定時間區間＋俱樂部 ID，彙整玩家戰績/大贏家/房卡消耗/場次（場次＝該區間內已結束小局數：胡牌、自摸或流局；房卡與俱樂部排行榜一致，來自結算 players[].roomCardConsumed）
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
        players: true,
      },
    })

    const completedRounds = await prisma.v2MatchRound.findMany({
      where: {
        session: { clubId: club.id },
        endedAt: { gte: startAt, lte: endAt },
      },
      select: {
        roundEndPayload: true,
        session: {
          select: {
            participants: { select: { playerId: true } },
          },
        },
      },
    })

    const completedGamesByPlayer = new Map<string, number>()
    for (const rr of completedRounds) {
      if (!isV2RoundCompletedForStatistics(rr.roundEndPayload)) continue
      for (const part of rr.session?.participants ?? []) {
        const pid = part.playerId
        if (!pid) continue
        completedGamesByPlayer.set(pid, (completedGamesByPlayer.get(pid) || 0) + 1)
      }
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
            completedGames: 0,
          })
          continue
        }

        existing.battleScore += score
        existing.bigWinnerCount += isBigWinner ? 1 : 0
        existing.roomCardConsumed += roomCardConsumed
        if (existing.userId === '—' && userId !== '—') {
          existing.userId = userId
        }
        if (existing.nickname === '未知玩家' && nickname !== '未知玩家') {
          existing.nickname = nickname
        }
      }
    }

    const roundOnlyIds = [...completedGamesByPlayer.keys()].filter((id) => !playerAggMap.has(id))
    if (roundOnlyIds.length) {
      const playersMeta = await prisma.player.findMany({
        where: { id: { in: roundOnlyIds } },
        select: { id: true, userId: true, nickname: true },
      })
      const metaById = new Map(playersMeta.map((pl) => [pl.id, pl]))
      for (const pid of roundOnlyIds) {
        const meta = metaById.get(pid)
        const userId =
          typeof meta?.userId === 'string' && meta.userId.trim() ? meta.userId.trim() : '—'
        const nickname =
          typeof meta?.nickname === 'string' && meta.nickname.trim()
            ? meta.nickname.trim()
            : '未知玩家'
        playerAggMap.set(pid, {
          playerId: pid,
          userId,
          nickname,
          battleScore: 0,
          bigWinnerCount: 0,
          roomCardConsumed: 0,
          completedGames: 0,
        })
      }
    }

    for (const row of playerAggMap.values()) {
      row.completedGames = completedGamesByPlayer.get(row.playerId) || 0
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
