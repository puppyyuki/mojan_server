import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * GET /api/admin/reports/club-summary
 * 俱樂部對戰彙總：區間內對局數、總局數、總耗卡等
 * Query: startDate, endDate (YYYY-MM-DD), keyword（俱樂部名稱或 clubId 片段）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()
    const keyword = (searchParams.get('keyword') || '').trim()

    const where: Prisma.ClubGameResultWhereInput = {}

    if (startRaw || endRaw) {
      where.endedAt = {}
      if (startRaw) {
        const s = new Date(startRaw)
        if (!Number.isNaN(s.getTime())) where.endedAt.gte = s
      }
      if (endRaw) {
        const e = new Date(endRaw)
        if (!Number.isNaN(e.getTime())) where.endedAt.lte = endOfDay(e)
      }
    }

    if (keyword) {
      where.club = {
        OR: [
          { clubId: { contains: keyword } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ],
      }
    }

    const grouped = await prisma.clubGameResult.groupBy({
      by: ['clubId'],
      where,
      _count: { id: true },
      _sum: {
        roomCardConsumedTotal: true,
        totalRounds: true,
      },
    })

    const clubIds = grouped.map((g) => g.clubId)
    const clubs = await prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, clubId: true, name: true, cardCount: true },
    })
    const clubMap = new Map(clubs.map((c) => [c.id, c]))

    const winnerCounterByClub = new Map<string, Map<string, number>>()
    const clubGames = await prisma.clubGameResult.findMany({
      where,
      select: {
        clubId: true,
        players: true,
      },
    })
    for (const game of clubGames) {
      const players = Array.isArray(game.players) ? game.players : []
      for (const item of players) {
        if (!item || typeof item !== 'object') continue
        const row = item as Record<string, unknown>
        const isBigWinner = row.isBigWinner === true
        const playerId = typeof row.playerId === 'string' ? row.playerId : ''
        if (!isBigWinner || !playerId) continue
        let counter = winnerCounterByClub.get(game.clubId)
        if (!counter) {
          counter = new Map<string, number>()
          winnerCounterByClub.set(game.clubId, counter)
        }
        counter.set(playerId, (counter.get(playerId) || 0) + 1)
      }
    }
    const winnerPlayerIds = Array.from(
      new Set(
        Array.from(winnerCounterByClub.values()).flatMap((counter) => Array.from(counter.keys()))
      )
    )
    const winnerPlayers = winnerPlayerIds.length
      ? await prisma.player.findMany({
          where: { id: { in: winnerPlayerIds } },
          select: { id: true, userId: true, nickname: true },
        })
      : []
    const winnerPlayerMap = new Map(winnerPlayers.map((p) => [p.id, p]))

    const rows = grouped
      .map((g) => {
        const c = clubMap.get(g.clubId)
        const gameCount = g._count.id
        const totalRounds = g._sum.totalRounds ?? 0
        const totalCards = g._sum.roomCardConsumedTotal ?? 0
        const avgCardsPerGame = gameCount > 0 ? totalCards / gameCount : 0
        const winnerCounter = winnerCounterByClub.get(g.clubId)
        let topBigWinner: {
          playerId: string
          userId: string
          nickname: string
          winCount: number
        } | null = null
        if (winnerCounter) {
          for (const [playerId, winCount] of winnerCounter.entries()) {
            if (!topBigWinner || winCount > topBigWinner.winCount) {
              const player = winnerPlayerMap.get(playerId)
              topBigWinner = {
                playerId,
                userId: player?.userId || '未知玩家',
                nickname: player?.nickname || '未知玩家',
                winCount,
              }
            }
          }
        }
        return {
          clubInternalId: g.clubId,
          clubSixId: c?.clubId ?? '—',
          clubName: c?.name ?? '（已刪或異常）',
          clubCardBalance: c?.cardCount ?? null,
          gameCount,
          totalRounds,
          totalRoomCardsConsumed: totalCards,
          avgRoomCardsPerGame: Math.round(avgCardsPerGame * 100) / 100,
          topBigWinner,
        }
      })
      .sort((a, b) => b.gameCount - a.gameCount)

    const totals = rows.reduce(
      (acc, r) => {
        acc.gameCount += r.gameCount
        acc.totalRounds += r.totalRounds
        acc.totalRoomCardsConsumed += r.totalRoomCardsConsumed
        return acc
      },
      { gameCount: 0, totalRounds: 0, totalRoomCardsConsumed: 0 }
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          rows,
          totals,
          filter: { startDate: startRaw || null, endDate: endRaw || null, keyword: keyword || null },
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
