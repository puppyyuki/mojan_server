import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

async function resolvePlayerId(raw: string): Promise<string | null> {
  const q = raw.trim()
  if (!q) return null
  const byId = await prisma.player.findUnique({ where: { id: q }, select: { id: true } })
  if (byId) return byId.id
  const byUserId = await prisma.player.findUnique({ where: { userId: q }, select: { id: true } })
  return byUserId?.id ?? null
}

/**
 * POST /api/admin/card-replenishment
 * body: { playerLookup: string (內部 id 或 6 碼 userId), amount: number, note: string }
 */
export async function POST(request: NextRequest) {
  try {
    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權，請重新登入' },
        { status: 401, headers: corsHeaders() }
      )
    }

    const body = await request.json()
    const playerLookup = String(body.playerLookup ?? body.playerIdOrUserId ?? '').trim()
    const amount = Number(body.amount)
    const note = String(body.note ?? '').trim()

    if (!playerLookup) {
      return NextResponse.json(
        { success: false, error: '請輸入玩家 ID（內部 ID 或 使用者 ID）' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { success: false, error: '補卡數量須為正整數' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (!note) {
      return NextResponse.json(
        { success: false, error: '請填寫補卡備註／原因' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const playerId = await resolvePlayerId(playerLookup)
    if (!playerId) {
      return NextResponse.json(
        { success: false, error: '找不到此玩家，請確認內部 ID 或 6 碼使用者 ID' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: playerId } })
      if (!player) {
        return { ok: false as const, status: 404, message: '玩家不存在' }
      }
      const previousCount = player.cardCount
      const newCount = previousCount + amount
      await tx.player.update({
        where: { id: playerId },
        data: { cardCount: newCount },
      })
      const record = await tx.cardRechargeRecord.create({
        data: {
          playerId,
          adminUserId,
          amount,
          previousCount,
          newCount,
          note,
        },
      })
      return {
        ok: true as const,
        data: {
          recordId: record.id,
          playerId,
          userId: player.userId,
          nickname: player.nickname,
          amount,
          previousCount,
          newCount,
          note,
          createdAt: record.createdAt,
        },
      }
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: result.status, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      { success: true, data: result.data, message: '補卡成功' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] card-replenishment POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: '補卡失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

/**
 * GET /api/admin/card-replenishment
 * Query: page, pageSize, startDate, endDate (YYYY-MM-DD), keyword, manualOnly (1 = 僅有備註的紀錄)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
    const keyword = (searchParams.get('keyword') || '').trim()
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()
    const manualOnly = searchParams.get('manualOnly') === '1' || searchParams.get('manualOnly') === 'true'

    const where: Prisma.CardRechargeRecordWhereInput = {}

    if (manualOnly) {
      where.note = { not: null }
    }

    if (startRaw || endRaw) {
      where.createdAt = {}
      if (startRaw) {
        const s = new Date(startRaw)
        if (!Number.isNaN(s.getTime())) where.createdAt.gte = s
      }
      if (endRaw) {
        const e = new Date(endRaw)
        if (!Number.isNaN(e.getTime())) where.createdAt.lte = endOfDay(e)
      }
    }

    if (keyword) {
      where.player = {
        OR: [
          { userId: { contains: keyword } },
          { nickname: { contains: keyword, mode: 'insensitive' } },
          { id: { contains: keyword } },
        ],
      }
    }

    const [total, rows] = await Promise.all([
      prisma.cardRechargeRecord.count({ where }),
      prisma.cardRechargeRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          player: { select: { id: true, userId: true, nickname: true } },
          adminUser: { select: { username: true } },
        },
      }),
    ])

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      playerId: r.playerId,
      userId: r.player.userId,
      nickname: r.player.nickname,
      amount: r.amount,
      previousCount: r.previousCount,
      newCount: r.newCount,
      note: r.note ?? '',
      adminUsername: r.adminUser.username,
    }))

    return NextResponse.json(
      {
        success: true,
        data: { items, total, page, pageSize },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] card-replenishment GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得補卡紀錄失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
