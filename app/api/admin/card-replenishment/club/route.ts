import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseTaipeiDateEnd, parseTaipeiDateStart } from '@/lib/taipei-time'
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

async function resolveClubId(raw: string): Promise<string | null> {
  const q = raw.trim()
  if (!q) return null
  const byId = await prisma.club.findUnique({ where: { id: q }, select: { id: true } })
  if (byId) return byId.id
  const byClubId = await prisma.club.findUnique({ where: { clubId: q }, select: { id: true } })
  return byClubId?.id ?? null
}

/**
 * POST /api/admin/card-replenishment/club
 * body: { clubLookup: string (內部 id 或 6 碼 clubId), amount: number, note: string }
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
    const clubLookup = String(body.clubLookup ?? '').trim()
    const amount = Number(body.amount)
    const note = String(body.note ?? '').trim()

    if (!clubLookup) {
      return NextResponse.json(
        { success: false, error: '請輸入俱樂部識別（內部 ID 或 6 碼俱樂部編號）' },
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

    const clubId = await resolveClubId(clubLookup)
    if (!clubId) {
      return NextResponse.json(
        { success: false, error: '找不到此俱樂部，請確認內部 ID 或 6 碼俱樂部編號' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const club = await tx.club.findUnique({ where: { id: clubId } })
      if (!club) {
        return { ok: false as const, status: 404, message: '俱樂部不存在' }
      }
      const previousCount = club.cardCount
      const newCount = previousCount + amount
      await tx.club.update({
        where: { id: clubId },
        data: { cardCount: newCount },
      })
      const record = await tx.clubAdminCardRechargeRecord.create({
        data: {
          clubId,
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
          clubId,
          clubSixId: club.clubId,
          clubName: club.name,
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
      { success: true, data: result.data, message: '俱樂部補卡成功' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] card-replenishment/club POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: '俱樂部補卡失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

/**
 * GET /api/admin/card-replenishment/club
 * Query: page, pageSize, startDate, endDate, keyword（俱樂部 6 碼／名稱／內部 id）, manualOnly
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

    const where: Prisma.ClubAdminCardRechargeRecordWhereInput = {}

    if (manualOnly) {
      where.note = { not: null }
    }

    if (startRaw || endRaw) {
      where.createdAt = {}
      if (startRaw) {
        const s = parseTaipeiDateStart(startRaw)
        if (s) where.createdAt.gte = s
      }
      if (endRaw) {
        const e = parseTaipeiDateEnd(endRaw)
        if (e) where.createdAt.lte = e
      }
    }

    if (keyword) {
      where.club = {
        OR: [
          { clubId: { contains: keyword } },
          { name: { contains: keyword, mode: 'insensitive' } },
          { id: { contains: keyword } },
        ],
      }
    }

    const [total, rows] = await Promise.all([
      prisma.clubAdminCardRechargeRecord.count({ where }),
      prisma.clubAdminCardRechargeRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          club: { select: { id: true, clubId: true, name: true } },
          adminUser: { select: { username: true } },
        },
      }),
    ])

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      clubInternalId: r.clubId,
      clubSixId: r.club.clubId,
      clubName: r.club.name,
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
    console.error('[Admin] card-replenishment/club GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得俱樂部補卡紀錄失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
