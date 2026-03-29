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
 * GET /api/admin/game-records/club
 * Query: page, pageSize, keyword, clubSixId, version, deduction, startDate, endDate (YYYY-MM-DD)
 * deduction: ALL | AA_DEDUCTION | CLUB（俱樂部扣卡：含 HOST_DEDUCTION 與 CLUB_DEDUCTION，與 App 顯示一致）
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
        const s = new Date(startRaw)
        if (!Number.isNaN(s.getTime())) where.endedAt.gte = s
      }
      if (endRaw) {
        const e = new Date(endRaw)
        if (!Number.isNaN(e.getTime())) where.endedAt.lte = endOfDay(e)
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

    const items = rows.map((r) => {
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
