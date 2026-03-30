import { NextResponse } from 'next/server'
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

function startOfDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date = new Date()) {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function startOfMonth(date = new Date()) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

function formatHour(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

function formatMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatWeekLabel(d: Date) {
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return `${d.getMonth() + 1}/${d.getDate()}-${end.getMonth() + 1}/${end.getDate()}`
}

export async function GET() {
  try {
    const now = new Date()
    const dayStart = startOfDay(now)
    const weekStart = startOfWeek(now)
    const monthStart = startOfMonth(now)

    const [daySales, weekSales, monthSales] = await Promise.all([
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: dayStart } },
        _sum: { cardAmount: true },
      }),
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: weekStart } },
        _sum: { cardAmount: true },
      }),
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: monthStart } },
        _sum: { cardAmount: true },
      }),
    ])

    const last24h = new Date(now)
    last24h.setHours(last24h.getHours() - 23, 0, 0, 0)
    const hourlyRooms = await prisma.room.findMany({
      where: { createdAt: { gte: last24h } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const roomByHour = new Map<string, number>()
    for (let i = 0; i < 24; i++) {
      const t = new Date(last24h)
      t.setHours(last24h.getHours() + i)
      roomByHour.set(formatHour(t), 0)
    }
    for (const row of hourlyRooms) {
      const key = formatHour(new Date(row.createdAt))
      roomByHour.set(key, (roomByHour.get(key) || 0) + 1)
    }

    const weekWindowStart = startOfWeek(now)
    weekWindowStart.setDate(weekWindowStart.getDate() - 7 * 7)
    const weeklyRoomsRaw = await prisma.room.findMany({
      where: { createdAt: { gte: weekWindowStart } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const weeklyRoomMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(now)
      ws.setDate(ws.getDate() - i * 7)
      weeklyRoomMap.set(formatWeekLabel(ws), 0)
    }
    for (const row of weeklyRoomsRaw) {
      const ws = startOfWeek(new Date(row.createdAt))
      const key = formatWeekLabel(ws)
      if (weeklyRoomMap.has(key)) {
        weeklyRoomMap.set(key, (weeklyRoomMap.get(key) || 0) + 1)
      }
    }

    const weeklyPlayerRaw = await prisma.player.findMany({
      where: { createdAt: { gte: weekWindowStart } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const weeklyPlayerMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(now)
      ws.setDate(ws.getDate() - i * 7)
      weeklyPlayerMap.set(formatWeekLabel(ws), 0)
    }
    for (const row of weeklyPlayerRaw) {
      const ws = startOfWeek(new Date(row.createdAt))
      const key = formatWeekLabel(ws)
      if (weeklyPlayerMap.has(key)) {
        weeklyPlayerMap.set(key, (weeklyPlayerMap.get(key) || 0) + 1)
      }
    }

    const monthWindowStart = new Date(monthStart)
    monthWindowStart.setMonth(monthWindowStart.getMonth() - 5)
    const monthlyPlayerRaw = await prisma.player.findMany({
      where: { createdAt: { gte: monthWindowStart } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const monthlyPlayerMap = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const m = new Date(monthStart)
      m.setMonth(m.getMonth() - i)
      monthlyPlayerMap.set(formatMonth(m), 0)
    }
    for (const row of monthlyPlayerRaw) {
      const key = formatMonth(new Date(row.createdAt))
      if (monthlyPlayerMap.has(key)) {
        monthlyPlayerMap.set(key, (monthlyPlayerMap.get(key) || 0) + 1)
      }
    }

    const weeklyActiveRaw = await prisma.player.findMany({
      where: { lastLoginAt: { gte: weekWindowStart } },
      select: { lastLoginAt: true },
      orderBy: { lastLoginAt: 'asc' },
    })
    const weeklyActiveMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(now)
      ws.setDate(ws.getDate() - i * 7)
      weeklyActiveMap.set(formatWeekLabel(ws), 0)
    }
    for (const row of weeklyActiveRaw) {
      if (!row.lastLoginAt) continue
      const ws = startOfWeek(new Date(row.lastLoginAt))
      const key = formatWeekLabel(ws)
      if (weeklyActiveMap.has(key)) {
        weeklyActiveMap.set(key, (weeklyActiveMap.get(key) || 0) + 1)
      }
    }

    const monthlyActiveRaw = await prisma.player.findMany({
      where: { lastLoginAt: { gte: monthWindowStart } },
      select: { lastLoginAt: true },
      orderBy: { lastLoginAt: 'asc' },
    })
    const monthlyActiveMap = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const m = new Date(monthStart)
      m.setMonth(m.getMonth() - i)
      monthlyActiveMap.set(formatMonth(m), 0)
    }
    for (const row of monthlyActiveRaw) {
      if (!row.lastLoginAt) continue
      const key = formatMonth(new Date(row.lastLoginAt))
      if (monthlyActiveMap.has(key)) {
        monthlyActiveMap.set(key, (monthlyActiveMap.get(key) || 0) + 1)
      }
    }

    const clubRankingRaw = await prisma.clubGameResult.groupBy({
      by: ['clubId'],
      _count: { id: true },
      _sum: { totalRounds: true, roomCardConsumedTotal: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })
    const clubIds = clubRankingRaw.map((r) => r.clubId)
    const clubs = await prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, clubId: true, name: true },
    })
    const clubMap = new Map(clubs.map((c) => [c.id, c]))
    const clubRanking = clubRankingRaw.map((row, idx) => {
      const club = clubMap.get(row.clubId)
      return {
        rank: idx + 1,
        clubId: row.clubId,
        clubSixId: club?.clubId || '—',
        clubName: club?.name || '未知俱樂部',
        gameCount: row._count.id,
        totalRounds: row._sum.totalRounds || 0,
        totalRoomCardsConsumed: row._sum.roomCardConsumedTotal || 0,
      }
    })

    const playerRankingWindow = new Date(monthStart)
    const playerGames = await prisma.clubGameResult.findMany({
      where: { endedAt: { gte: playerRankingWindow } },
      select: { players: true },
    })
    const playerAggMap = new Map<
      string,
      { score: number; bigWinnerCount: number; gameCount: number }
    >()
    for (const game of playerGames) {
      const rows = Array.isArray(game.players) ? game.players : []
      for (const item of rows) {
        if (!item || typeof item !== 'object') continue
        const row = item as Record<string, unknown>
        const playerId = typeof row.playerId === 'string' ? row.playerId : ''
        if (!playerId) continue
        const score = typeof row.score === 'number' ? row.score : 0
        const isBigWinner = row.isBigWinner === true
        const curr = playerAggMap.get(playerId) || { score: 0, bigWinnerCount: 0, gameCount: 0 }
        curr.score += score
        curr.gameCount += 1
        curr.bigWinnerCount += isBigWinner ? 1 : 0
        playerAggMap.set(playerId, curr)
      }
    }
    const playerIds = Array.from(playerAggMap.keys())
    const playerRows = playerIds.length
      ? await prisma.player.findMany({
          where: { id: { in: playerIds } },
          select: { id: true, userId: true, nickname: true, cardCount: true },
        })
      : []
    const playerMap = new Map(playerRows.map((p) => [p.id, p]))
    const playerRanking = Array.from(playerAggMap.entries())
      .map(([playerId, stat]) => {
        const p = playerMap.get(playerId)
        return {
          playerId,
          userId: p?.userId || '未知玩家',
          nickname: p?.nickname || '未知玩家',
          cardCount: p?.cardCount || 0,
          totalScore: stat.score,
          bigWinnerCount: stat.bigWinnerCount,
          gameCount: stat.gameCount,
        }
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
        if (b.bigWinnerCount !== a.bigWinnerCount) return b.bigWinnerCount - a.bigWinnerCount
        return b.gameCount - a.gameCount
      })
      .slice(0, 20)
      .map((row, idx) => ({ rank: idx + 1, ...row }))

    return NextResponse.json(
      {
        success: true,
        data: {
          salesCards: {
            daily: daySales._sum.cardAmount || 0,
            weekly: weekSales._sum.cardAmount || 0,
            monthly: monthSales._sum.cardAmount || 0,
          },
          roomOpenStats: {
            hourly: Array.from(roomByHour.entries()).map(([label, value]) => ({ label, value })),
            weekly: Array.from(weeklyRoomMap.entries()).map(([label, value]) => ({ label, value })),
          },
          newPlayers: {
            weekly: Array.from(weeklyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
            monthly: Array.from(monthlyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
          },
          playerActivity: {
            weekly: Array.from(weeklyActiveMap.entries()).map(([label, value]) => ({ label, value })),
            monthly: Array.from(monthlyActiveMap.entries()).map(([label, value]) => ({ label, value })),
          },
          clubRanking,
          playerRanking,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] statistics/overview GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得統計資料失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
