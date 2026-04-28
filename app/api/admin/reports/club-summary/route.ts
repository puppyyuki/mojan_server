import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseTaipeiDateEnd, parseTaipeiDateStart } from '@/lib/taipei-time'

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

const WATER_RATE = 0.05 // 俱樂部贏分水錢比例（依該場最終／解散後結算為正之分數）

function scoringUnitFromStoredGameSettings(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 20
  const n = Number((raw as Record<string, unknown>).scoring_unit)
  if (!Number.isFinite(n)) return 20
  return Math.max(0, Math.floor(n))
}

/**
 * GET /api/admin/reports/club-summary
 * 俱樂部玩家報表：指定時間區間＋俱樂部 ID，彙整玩家戰績/大贏家/房卡消耗/場次；咚錢＝各已結算場次內（自摸×該房台數）；水錢＝各場結算或中途解散後分數為正者 ×5%（見程式常數）
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
              totalSelfDrawCount: 0,
              totalRoomCardConsumed: 0,
              totalCompletedGames: 0,
              totalDongMoney: 0,
              totalWaterMoney: 0,
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
        roomInternalId: true,
      },
    })

    const roomInternalIds = [
      ...new Set(
        gameResults.map((gr) => gr.roomInternalId).filter((rid): rid is string => typeof rid === 'string' && !!rid)
      ),
    ]
    const roomRows =
      roomInternalIds.length > 0
        ? await prisma.room.findMany({
            where: { id: { in: roomInternalIds } },
            select: { id: true, gameSettings: true },
          })
        : []
    const gameSettingsByRoomId = new Map(roomRows.map((r) => [r.id, r.gameSettings]))

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
      selfDrawCount: number
      roomCardConsumed: number
      completedGames: number
      dongMoney: number
      waterMoney: number
    }

    const playerAggMap = new Map<string, PlayerAgg>()

    for (const result of gameResults) {
      const players = Array.isArray(result.players) ? result.players : []
      const gs = result.roomInternalId ? gameSettingsByRoomId.get(result.roomInternalId) : undefined
      const taiUnit = scoringUnitFromStoredGameSettings(gs)

      for (const item of players) {
        if (!item || typeof item !== 'object') continue
        const p = item as Record<string, unknown>
        const playerId = typeof p.playerId === 'string' ? p.playerId : ''
        if (!playerId) continue

        const userId = typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : '—'
        const nickname =
          typeof p.nickname === 'string' && p.nickname.trim() ? p.nickname.trim() : '未知玩家'
        const score = Number(p.score ?? 0) || 0
        const statistics =
          p.statistics && typeof p.statistics === 'object'
            ? (p.statistics as Record<string, unknown>)
            : null
        const selfDrawCount = Number(statistics?.selfDraws ?? p.selfDrawCount ?? 0) || 0
        const roomCardConsumed = Number(p.roomCardConsumed ?? 0) || 0
        const isBigWinner = p.isBigWinner === true
        const dongThisGame = selfDrawCount * taiUnit
        const waterThisGame = score > 0 ? score * WATER_RATE : 0

        const existing = playerAggMap.get(playerId)
        if (!existing) {
          playerAggMap.set(playerId, {
            playerId,
            userId,
            nickname,
            battleScore: score,
            bigWinnerCount: isBigWinner ? 1 : 0,
            selfDrawCount,
            roomCardConsumed,
            completedGames: 0,
            dongMoney: dongThisGame,
            waterMoney: waterThisGame,
          })
          continue
        }

        existing.battleScore += score
        existing.bigWinnerCount += isBigWinner ? 1 : 0
        existing.selfDrawCount += selfDrawCount
        existing.roomCardConsumed += roomCardConsumed
        existing.dongMoney += dongThisGame
        existing.waterMoney += waterThisGame
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
          selfDrawCount: 0,
          roomCardConsumed: 0,
          completedGames: 0,
          dongMoney: 0,
          waterMoney: 0,
        })
      }
    }

    const disbandedSessions = await prisma.v2MatchSession.findMany({
      where: {
        clubId: club.id,
        status: 'DISBANDED',
        endedAt: { gte: startAt, lte: endAt },
      },
      select: {
        participants: {
          select: { playerId: true, matchTotalScore: true, userId: true, nickname: true },
        },
      },
    })
    for (const sess of disbandedSessions) {
      for (const part of sess.participants ?? []) {
        const playerId = part.playerId
        if (!playerId) continue
        const score = Number(part.matchTotalScore ?? 0) || 0
        const waterThisGame = score > 0 ? score * WATER_RATE : 0
        if (waterThisGame === 0) continue
        const existing = playerAggMap.get(playerId)
        if (existing) {
          existing.waterMoney += waterThisGame
          continue
        }
        const userId =
          typeof part.userId === 'string' && part.userId.trim() ? part.userId.trim() : '—'
        const nickname =
          typeof part.nickname === 'string' && part.nickname.trim() ? part.nickname.trim() : '未知玩家'
        playerAggMap.set(playerId, {
          playerId,
          userId,
          nickname,
          battleScore: 0,
          bigWinnerCount: 0,
          selfDrawCount: 0,
          roomCardConsumed: 0,
          completedGames: 0,
          dongMoney: 0,
          waterMoney: waterThisGame,
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
        selfDrawCount: r.selfDrawCount,
        roomCardConsumed: r.roomCardConsumed,
        completedGames: r.completedGames,
        dongMoney: Math.round(r.dongMoney),
        waterMoney: Math.round(r.waterMoney * 100) / 100,
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
        acc.totalSelfDrawCount += row.selfDrawCount
        acc.totalRoomCardConsumed += row.roomCardConsumed
        acc.totalCompletedGames += row.completedGames
        acc.totalDongMoney += row.dongMoney
        acc.totalWaterMoney += row.waterMoney
        return acc
      },
      {
        playerCount: 0,
        totalBattleScore: 0,
        totalSelfDrawCount: 0,
        totalRoomCardConsumed: 0,
        totalCompletedGames: 0,
        totalDongMoney: 0,
        totalWaterMoney: 0,
      }
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
