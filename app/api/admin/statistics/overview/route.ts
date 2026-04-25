import { NextRequest, NextResponse } from 'next/server'
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

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

function toTaipeiPseudoUtc(date: Date): Date {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS)
}

function fromTaipeiPseudoUtc(date: Date): Date {
  return new Date(date.getTime() - TAIPEI_OFFSET_MS)
}

function addTaipeiHours(date: Date, hours: number): Date {
  const x = toTaipeiPseudoUtc(date)
  x.setUTCHours(x.getUTCHours() + hours)
  return fromTaipeiPseudoUtc(x)
}

function addTaipeiDays(date: Date, days: number): Date {
  const x = toTaipeiPseudoUtc(date)
  x.setUTCDate(x.getUTCDate() + days)
  return fromTaipeiPseudoUtc(x)
}

function addTaipeiMonths(date: Date, months: number): Date {
  const x = toTaipeiPseudoUtc(date)
  x.setUTCMonth(x.getUTCMonth() + months)
  return fromTaipeiPseudoUtc(x)
}

function startOfTaipeiHour(date = new Date()): Date {
  const x = toTaipeiPseudoUtc(date)
  x.setUTCMinutes(0, 0, 0)
  return fromTaipeiPseudoUtc(x)
}

function startOfTaipeiDay(date = new Date()): Date {
  const x = toTaipeiPseudoUtc(date)
  x.setUTCHours(0, 0, 0, 0)
  return fromTaipeiPseudoUtc(x)
}

function startOfTaipeiWeek(date = new Date()): Date {
  const dayStart = startOfTaipeiDay(date)
  const x = toTaipeiPseudoUtc(dayStart)
  const day = x.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setUTCDate(x.getUTCDate() + diff)
  return fromTaipeiPseudoUtc(x)
}

function startOfTaipeiMonth(date = new Date()): Date {
  const dayStart = startOfTaipeiDay(date)
  const x = toTaipeiPseudoUtc(dayStart)
  x.setUTCDate(1)
  return fromTaipeiPseudoUtc(x)
}

function formatTaipeiHour(date: Date): string {
  const x = toTaipeiPseudoUtc(date)
  return `${String(x.getUTCHours()).padStart(2, '0')}:00`
}

function formatTaipeiDay(date: Date): string {
  const x = toTaipeiPseudoUtc(date)
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()}`
}

function isSameTaipeiDay(a: Date, b: Date): boolean {
  return startOfTaipeiDay(a).getTime() === startOfTaipeiDay(b).getTime()
}

function formatTaipeiHourWithDay(date: Date, now: Date): string {
  const prefix = isSameTaipeiDay(date, now) ? '今日' : formatTaipeiDay(date)
  return `${prefix} ${formatTaipeiHour(date)}`
}

function formatTaipeiMonth(date: Date): string {
  const x = toTaipeiPseudoUtc(date)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatTaipeiWeekLabel(weekStart: Date): string {
  const s = toTaipeiPseudoUtc(weekStart)
  const e = toTaipeiPseudoUtc(addTaipeiDays(weekStart, 6))
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()}-${e.getUTCMonth() + 1}/${e.getUTCDate()}`
}

function getDeductionFromGameSettings(gameSettings: unknown): string {
  if (gameSettings && typeof gameSettings === 'object' && !Array.isArray(gameSettings)) {
    const deduction = (gameSettings as Record<string, unknown>).deduction
    if (typeof deduction === 'string' && deduction.trim()) {
      return deduction.toUpperCase()
    }
  }
  return 'AA_DEDUCTION'
}

async function loadDeductedRoomOpenTimes(since: Date): Promise<Date[]> {
  const deductionReasons = [
    'game_start_aa_deduction',
    'game_start_host_deduction',
    'v2_game_start_aa_deduction',
    'v2_game_start_host_deduction',
    'v2_first_round_aa_deduction',
    'v2_first_round_host_deduction',
  ]
  const [playerDeductionRows, round1Rows, clubResultRows] = await Promise.all([
    prisma.cardConsumptionRecord.findMany({
      where: {
        createdAt: { gte: since },
        roomId: { not: null },
        reason: { in: deductionReasons },
      },
      select: {
        roomId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.v2MatchRound.findMany({
      where: {
        roundIndex: 1,
        endedAt: { gte: since },
      },
      select: {
        endedAt: true,
        session: {
          select: {
            roomCode: true,
            gameSettings: true,
          },
        },
      },
      orderBy: { endedAt: 'asc' },
    }),
    prisma.clubGameResult.findMany({
      where: {
        endedAt: { gte: since },
        roomCardConsumedTotal: { gt: 0 },
      },
      select: {
        roomId: true,
        endedAt: true,
      },
      orderBy: { endedAt: 'asc' },
    }),
  ])

  const roomTime = new Map<string, Date>()
  for (const row of playerDeductionRows) {
    const rid = (row.roomId || '').trim()
    if (!rid) continue
    const existing = roomTime.get(rid)
    if (!existing || row.createdAt < existing) {
      roomTime.set(rid, row.createdAt)
    }
  }
  for (const row of round1Rows) {
    const rid = (row.session?.roomCode || '').trim()
    if (!rid) continue
    const deduction = getDeductionFromGameSettings(row.session?.gameSettings)
    if (
      deduction !== 'AA_DEDUCTION' &&
      deduction !== 'HOST_DEDUCTION' &&
      deduction !== 'CLUB_DEDUCTION'
    ) {
      continue
    }
    const existing = roomTime.get(rid)
    if (!existing || row.endedAt < existing) {
      roomTime.set(rid, row.endedAt)
    }
  }
  // 補齊俱樂部扣卡（舊資料可能沒有 player 扣卡紀錄）。
  for (const row of clubResultRows) {
    const rid = (row.roomId || '').trim()
    if (!rid) continue
    if (!roomTime.has(rid)) {
      roomTime.set(rid, row.endedAt)
    }
  }
  return Array.from(roomTime.values())
}

type PlayerRankingScope = 'all' | 'club' | 'lobby'
type PlayerRankingPeriod = 'week' | 'month' | '3months'

function normalizePlayerRankingScope(raw: string | null): PlayerRankingScope {
  const v = (raw || '').trim().toLowerCase()
  if (v === 'club' || v === 'lobby' || v === 'all') return v
  return 'all'
}

function normalizePlayerRankingPeriod(raw: string | null): PlayerRankingPeriod {
  const v = (raw || '').trim().toLowerCase()
  if (v === 'week' || v === 'month' || v === '3months') return v
  return 'month'
}

function playerRankingWindowStart(now: Date, period: PlayerRankingPeriod): Date {
  const dayStart = startOfTaipeiDay(now)
  if (period === 'week') return startOfTaipeiWeek(now)
  if (period === 'month') return startOfTaipeiMonth(now)
  return addTaipeiMonths(dayStart, -3)
}

function normalizedRoomCardConsumedTotal(row: {
  roomCardConsumedTotal: number | null
  totalRounds: number
  deduction: string
}): number {
  const recorded = Number(row.roomCardConsumedTotal ?? 0) || 0
  if (recorded > 0) return recorded
  const d = String(row.deduction || '').toUpperCase()
  if (
    d === 'AA_DEDUCTION' ||
    d === 'HOST_DEDUCTION' ||
    d === 'CLUB_DEDUCTION' ||
    d === 'CLUB'
  ) {
    return (Number(row.totalRounds) || 0) * 4
  }
  return 0
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rankingScope = normalizePlayerRankingScope(searchParams.get('playerScope'))
    const rankingPeriod = normalizePlayerRankingPeriod(searchParams.get('playerPeriod'))

    const now = new Date()
    const dayStart = startOfTaipeiDay(now)
    const weekStart = startOfTaipeiWeek(now)
    const monthStart = startOfTaipeiMonth(now)
    const last7DayStart = addTaipeiDays(dayStart, -6)
    const last4WeekStart = addTaipeiDays(weekStart, -3 * 7)
    const last12MonthStart = addTaipeiMonths(monthStart, -11)

    const [daySales, weekSales, monthSales, last7DaySales, last4WeekSales, last12MonthSales] = await Promise.all([
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
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: last7DayStart } },
        _sum: { cardAmount: true },
      }),
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: last4WeekStart } },
        _sum: { cardAmount: true },
      }),
      prisma.roomCardOrder.aggregate({
        where: { status: 'PAID', createdAt: { gte: last12MonthStart } },
        _sum: { cardAmount: true },
      }),
    ])

    const currentHourStart = startOfTaipeiHour(now)
    const last24h = addTaipeiHours(currentHourStart, -23)
    const weekWindowStart = addTaipeiDays(weekStart, -7 * 7)
    const deductedRoomOpenTimes = await loadDeductedRoomOpenTimes(last12MonthStart)
    const roomByHour = new Map<string, number>()
    for (let i = 0; i < 24; i++) {
      const hour = addTaipeiHours(last24h, i)
      roomByHour.set(formatTaipeiHourWithDay(hour, now), 0)
    }
    for (const openedAt of deductedRoomOpenTimes) {
      if (openedAt < last24h) continue
      const key = formatTaipeiHourWithDay(startOfTaipeiHour(openedAt), now)
      roomByHour.set(key, (roomByHour.get(key) || 0) + 1)
    }

    const dailyRoomMap = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      dailyRoomMap.set(formatTaipeiDay(addTaipeiDays(dayStart, -i)), 0)
    }
    for (const openedAt of deductedRoomOpenTimes) {
      if (openedAt < last7DayStart) continue
      const key = formatTaipeiDay(openedAt)
      if (dailyRoomMap.has(key)) {
        dailyRoomMap.set(key, (dailyRoomMap.get(key) || 0) + 1)
      }
    }

    const weeklyRoomMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = addTaipeiDays(weekStart, -i * 7)
      weeklyRoomMap.set(formatTaipeiWeekLabel(ws), 0)
    }
    for (const openedAt of deductedRoomOpenTimes) {
      if (openedAt < weekWindowStart) continue
      const ws = startOfTaipeiWeek(openedAt)
      const key = formatTaipeiWeekLabel(ws)
      if (weeklyRoomMap.has(key)) {
        weeklyRoomMap.set(key, (weeklyRoomMap.get(key) || 0) + 1)
      }
    }

    const monthlyRoomMap = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const m = addTaipeiMonths(monthStart, -i)
      monthlyRoomMap.set(formatTaipeiMonth(m), 0)
    }
    for (const openedAt of deductedRoomOpenTimes) {
      if (openedAt < last12MonthStart) continue
      const key = formatTaipeiMonth(openedAt)
      if (monthlyRoomMap.has(key)) {
        monthlyRoomMap.set(key, (monthlyRoomMap.get(key) || 0) + 1)
      }
    }

    const newPlayerRaw = await prisma.player.findMany({
      where: { createdAt: { gte: last12MonthStart } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    const hourlyPlayerMap = new Map<string, number>()
    for (let i = 0; i < 24; i++) {
      const hour = addTaipeiHours(last24h, i)
      hourlyPlayerMap.set(formatTaipeiHourWithDay(hour, now), 0)
    }
    for (const row of newPlayerRaw) {
      if (row.createdAt < last24h) continue
      const key = formatTaipeiHourWithDay(startOfTaipeiHour(row.createdAt), now)
      if (hourlyPlayerMap.has(key)) {
        hourlyPlayerMap.set(key, (hourlyPlayerMap.get(key) || 0) + 1)
      }
    }

    const dailyPlayerMap = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      dailyPlayerMap.set(formatTaipeiDay(addTaipeiDays(dayStart, -i)), 0)
    }
    for (const row of newPlayerRaw) {
      if (row.createdAt < last7DayStart) continue
      const key = formatTaipeiDay(row.createdAt)
      if (dailyPlayerMap.has(key)) {
        dailyPlayerMap.set(key, (dailyPlayerMap.get(key) || 0) + 1)
      }
    }

    const weeklyPlayerMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = addTaipeiDays(weekStart, -i * 7)
      weeklyPlayerMap.set(formatTaipeiWeekLabel(ws), 0)
    }
    for (const row of newPlayerRaw) {
      if (row.createdAt < weekWindowStart) continue
      const ws = startOfTaipeiWeek(new Date(row.createdAt))
      const key = formatTaipeiWeekLabel(ws)
      if (weeklyPlayerMap.has(key)) {
        weeklyPlayerMap.set(key, (weeklyPlayerMap.get(key) || 0) + 1)
      }
    }

    const monthlyPlayerMap = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const m = addTaipeiMonths(monthStart, -i)
      monthlyPlayerMap.set(formatTaipeiMonth(m), 0)
    }
    for (const row of newPlayerRaw) {
      const key = formatTaipeiMonth(new Date(row.createdAt))
      if (monthlyPlayerMap.has(key)) {
        monthlyPlayerMap.set(key, (monthlyPlayerMap.get(key) || 0) + 1)
      }
    }

    const activePlayerRaw = await prisma.player.findMany({
      where: { lastLoginAt: { gte: last12MonthStart } },
      select: { lastLoginAt: true },
      orderBy: { lastLoginAt: 'asc' },
    })
    const hourlyActiveMap = new Map<string, number>()
    for (let i = 0; i < 24; i++) {
      const hour = addTaipeiHours(last24h, i)
      hourlyActiveMap.set(formatTaipeiHourWithDay(hour, now), 0)
    }
    for (const row of activePlayerRaw) {
      if (!row.lastLoginAt || row.lastLoginAt < last24h) continue
      const key = formatTaipeiHourWithDay(startOfTaipeiHour(row.lastLoginAt), now)
      if (hourlyActiveMap.has(key)) {
        hourlyActiveMap.set(key, (hourlyActiveMap.get(key) || 0) + 1)
      }
    }

    const dailyActiveMap = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      dailyActiveMap.set(formatTaipeiDay(addTaipeiDays(dayStart, -i)), 0)
    }
    for (const row of activePlayerRaw) {
      if (!row.lastLoginAt || row.lastLoginAt < last7DayStart) continue
      const key = formatTaipeiDay(row.lastLoginAt)
      if (dailyActiveMap.has(key)) {
        dailyActiveMap.set(key, (dailyActiveMap.get(key) || 0) + 1)
      }
    }

    const weeklyActiveMap = new Map<string, number>()
    for (let i = 7; i >= 0; i--) {
      const ws = addTaipeiDays(weekStart, -i * 7)
      weeklyActiveMap.set(formatTaipeiWeekLabel(ws), 0)
    }
    for (const row of activePlayerRaw) {
      if (!row.lastLoginAt) continue
      if (row.lastLoginAt < weekWindowStart) continue
      const ws = startOfTaipeiWeek(new Date(row.lastLoginAt))
      const key = formatTaipeiWeekLabel(ws)
      if (weeklyActiveMap.has(key)) {
        weeklyActiveMap.set(key, (weeklyActiveMap.get(key) || 0) + 1)
      }
    }

    const monthlyActiveMap = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
      const m = addTaipeiMonths(monthStart, -i)
      monthlyActiveMap.set(formatTaipeiMonth(m), 0)
    }
    for (const row of activePlayerRaw) {
      if (!row.lastLoginAt) continue
      const key = formatTaipeiMonth(new Date(row.lastLoginAt))
      if (monthlyActiveMap.has(key)) {
        monthlyActiveMap.set(key, (monthlyActiveMap.get(key) || 0) + 1)
      }
    }

    const clubRankingRaw = await prisma.clubGameResult.findMany({
      select: {
        clubId: true,
        totalRounds: true,
        roomCardConsumedTotal: true,
        deduction: true,
      },
    })
    const clubAgg = new Map<
      string,
      { gameCount: number; totalRounds: number; totalRoomCardsConsumed: number }
    >()
    for (const row of clubRankingRaw) {
      const curr = clubAgg.get(row.clubId) || {
        gameCount: 0,
        totalRounds: 0,
        totalRoomCardsConsumed: 0,
      }
      curr.gameCount += 1
      curr.totalRounds += Number(row.totalRounds) || 0
      curr.totalRoomCardsConsumed += normalizedRoomCardConsumedTotal({
        roomCardConsumedTotal: row.roomCardConsumedTotal,
        totalRounds: row.totalRounds,
        deduction: row.deduction,
      })
      clubAgg.set(row.clubId, curr)
    }

    const clubRows = Array.from(clubAgg.entries())
      .map(([clubId, stat]) => ({ clubId, ...stat }))
      .sort((a, b) => b.gameCount - a.gameCount)
      .slice(0, 20)

    const clubIds = clubRows.map((r) => r.clubId)
    const clubs = await prisma.club.findMany({
      where: { id: { in: clubIds } },
      select: { id: true, clubId: true, name: true },
    })
    const clubMap = new Map(clubs.map((c) => [c.id, c]))
    const clubRanking = clubRows.map((row, idx) => {
      const club = clubMap.get(row.clubId)
      return {
        rank: idx + 1,
        clubId: row.clubId,
        clubSixId: club?.clubId || '—',
        clubName: club?.name || '未知俱樂部',
        gameCount: row.gameCount,
        totalRounds: row.totalRounds || 0,
        totalRoomCardsConsumed: row.totalRoomCardsConsumed || 0,
      }
    })

    const playerRankingWindow = playerRankingWindowStart(now, rankingPeriod)
    const playerAggMap = new Map<
      string,
      { score: number; bigWinnerCount: number; gameCount: number }
    >()

    if (rankingScope === 'all' || rankingScope === 'club') {
      const playerGames = await prisma.clubGameResult.findMany({
        where: { endedAt: { gte: playerRankingWindow } },
        select: { players: true },
      })
      for (const game of playerGames) {
        const rows = Array.isArray(game.players) ? game.players : []
        for (const item of rows) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          const playerId = typeof row.playerId === 'string' ? row.playerId : ''
          if (!playerId) continue
          const score = typeof row.score === 'number' ? row.score : 0
          const isBigWinner = row.isBigWinner === true
          const curr = playerAggMap.get(playerId) || {
            score: 0,
            bigWinnerCount: 0,
            gameCount: 0,
          }
          curr.score += score
          curr.gameCount += 1
          curr.bigWinnerCount += isBigWinner ? 1 : 0
          playerAggMap.set(playerId, curr)
        }
      }
    }

    if (rankingScope === 'all' || rankingScope === 'lobby') {
      const lobbySessions = await prisma.v2MatchSession.findMany({
        where: {
          clubId: null,
          endedAt: { gte: playerRankingWindow },
          status: { in: ['FINISHED', 'DISBANDED'] },
        },
        select: {
          participants: {
            select: {
              playerId: true,
              matchTotalScore: true,
            },
          },
        },
      })
      for (const session of lobbySessions) {
        const players = session.participants ?? []
        if (players.length === 0) continue
        let bestScore: number | null = null
        for (const p of players) {
          if (bestScore === null || p.matchTotalScore > bestScore) {
            bestScore = p.matchTotalScore
          }
        }
        for (const p of players) {
          const curr = playerAggMap.get(p.playerId) || {
            score: 0,
            bigWinnerCount: 0,
            gameCount: 0,
          }
          curr.score += p.matchTotalScore
          curr.gameCount += 1
          if (bestScore !== null && p.matchTotalScore === bestScore) {
            curr.bigWinnerCount += 1
          }
          playerAggMap.set(p.playerId, curr)
        }
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
            last7Days: last7DaySales._sum.cardAmount || 0,
            last4Weeks: last4WeekSales._sum.cardAmount || 0,
            last12Months: last12MonthSales._sum.cardAmount || 0,
          },
          roomOpenStats: {
            hourly: Array.from(roomByHour.entries()).map(([label, value]) => ({ label, value })),
            daily: Array.from(dailyRoomMap.entries()).map(([label, value]) => ({ label, value })),
            weekly: Array.from(weeklyRoomMap.entries()).map(([label, value]) => ({ label, value })),
            monthly: Array.from(monthlyRoomMap.entries()).map(([label, value]) => ({ label, value })),
          },
          newPlayers: {
            hourly: Array.from(hourlyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
            daily: Array.from(dailyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
            weekly: Array.from(weeklyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
            monthly: Array.from(monthlyPlayerMap.entries()).map(([label, value]) => ({ label, value })),
          },
          playerActivity: {
            hourly: Array.from(hourlyActiveMap.entries()).map(([label, value]) => ({ label, value })),
            daily: Array.from(dailyActiveMap.entries()).map(([label, value]) => ({ label, value })),
            weekly: Array.from(weeklyActiveMap.entries()).map(([label, value]) => ({ label, value })),
            monthly: Array.from(monthlyActiveMap.entries()).map(([label, value]) => ({ label, value })),
          },
          clubRanking,
          playerRanking,
          playerRankingMeta: {
            scope: rankingScope,
            period: rankingPeriod,
          },
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
