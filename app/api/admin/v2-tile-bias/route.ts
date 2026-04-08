import { NextRequest, NextResponse } from 'next/server'
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

function normalizePatternIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
}

/** 列出規則；可帶 ?playerId= 篩選 */
export async function GET(request: NextRequest) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')?.trim()
    const rows = await prisma.v2TileBiasRule.findMany({
      where: playerId ? { playerId } : undefined,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      include: {
        player: { select: { id: true, userId: true, nickname: true } },
      },
    })
    return NextResponse.json(
      { success: true, data: rows },
      { headers: corsHeaders() }
    )
  } catch (e) {
    console.error('admin v2-tile-bias GET:', e)
    return NextResponse.json(
      { success: false, error: '讀取失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

/** 新增規則（稽核：createdByUserId） */
export async function POST(request: NextRequest) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  try {
    const body = await request.json()
    const playerId = String(body.playerId ?? '').trim()
    if (!playerId) {
      return NextResponse.json(
        { success: false, error: '請指定 playerId' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    const gameType = String(body.gameType ?? 'BOTH').toUpperCase()
    if (!['NORTHERN', 'SOUTHERN', 'BOTH'].includes(gameType)) {
      return NextResponse.json(
        { success: false, error: 'gameType 無效' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const phase = String(body.phase ?? '').toLowerCase()
    if (!['opening', 'draw'].includes(phase)) {
      return NextResponse.json(
        { success: false, error: 'phase 須為 opening 或 draw' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const patternIds = normalizePatternIds(body.patternIds)
    if (patternIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '請至少選擇一個台型' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const combine = body.combine === 'any' ? 'any' : 'all'
    const probability = Math.min(1, Math.max(0, Number(body.probability)))
    if (!Number.isFinite(probability)) {
      return NextResponse.json(
        { success: false, error: '機率無效' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const priority = Math.floor(Number(body.priority) || 0)
    const enabled = body.enabled !== false
    const validFrom =
      body.validFrom != null && String(body.validFrom).length > 0
        ? new Date(String(body.validFrom))
        : null
    const validTo =
      body.validTo != null && String(body.validTo).length > 0
        ? new Date(String(body.validTo))
        : null

    const row = await prisma.v2TileBiasRule.create({
      data: {
        playerId,
        gameType,
        phase,
        patternIds,
        combine,
        probability,
        priority,
        enabled,
        validFrom: validFrom && !Number.isNaN(validFrom.getTime()) ? validFrom : null,
        validTo: validTo && !Number.isNaN(validTo.getTime()) ? validTo : null,
        createdByUserId: adminId,
      },
      include: {
        player: { select: { id: true, userId: true, nickname: true } },
      },
    })
    return NextResponse.json(
      { success: true, data: row },
      { status: 201, headers: corsHeaders() }
    )
  } catch (e) {
    console.error('admin v2-tile-bias POST:', e)
    return NextResponse.json(
      { success: false, error: '建立失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
