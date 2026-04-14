import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { V2_BIAS_PATTERN_OPTIONS } from '@/lib/v2-tile-bias-catalog'

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
  return Array.from(new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean)))
}

function parseNullableDateInput(
  raw: unknown,
  label: 'validFrom' | 'validTo'
): { value: Date | null; error: string | null } {
  if (raw == null || String(raw).trim().length === 0) return { value: null, error: null }
  const parsed = new Date(String(raw))
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: `${label} 日期格式無效` }
  }
  return { value: parsed, error: null }
}

function findInvalidPatternIds(
  phase: 'opening' | 'draw',
  gameType: 'NORTHERN' | 'SOUTHERN' | 'BOTH',
  patternIds: string[]
): string[] {
  return patternIds.filter((id) => {
    const opt = V2_BIAS_PATTERN_OPTIONS.find((p) => p.id === id)
    if (!opt) return true
    const phaseOk = phase === 'opening' ? opt.opening : opt.draw
    if (!phaseOk) return true
    if (gameType === 'NORTHERN' && opt.southernOnly) return true
    if (gameType === 'SOUTHERN' && opt.northernOnly) return true
    return false
  })
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
      orderBy: [{ weight: 'desc' } as any, { priority: 'desc' }, { updatedAt: 'desc' }],
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
    const invalidPatternIds = findInvalidPatternIds(
      phase as 'opening' | 'draw',
      gameType as 'NORTHERN' | 'SOUTHERN' | 'BOTH',
      patternIds
    )
    if (invalidPatternIds.length > 0) {
      return NextResponse.json(
        { success: false, error: `包含無效台型或不適用此階段: ${invalidPatternIds.join(', ')}` },
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
    const weight = Math.floor(Number(body.weight) || 0)
    const priority = Math.floor(Number(body.priority) || 0)
    const enabled = body.enabled !== false
    const validFromResult = parseNullableDateInput(body.validFrom, 'validFrom')
    if (validFromResult.error) {
      return NextResponse.json(
        { success: false, error: validFromResult.error },
        { status: 400, headers: corsHeaders() }
      )
    }
    const validToResult = parseNullableDateInput(body.validTo, 'validTo')
    if (validToResult.error) {
      return NextResponse.json(
        { success: false, error: validToResult.error },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (
      validFromResult.value &&
      validToResult.value &&
      validFromResult.value.getTime() > validToResult.value.getTime()
    ) {
      return NextResponse.json(
        { success: false, error: 'validFrom 不可晚於 validTo' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const createData: any = {
        playerId,
        gameType,
        phase,
        patternIds,
        combine,
        probability,
        weight,
        priority,
        enabled,
        validFrom: validFromResult.value,
        validTo: validToResult.value,
        createdByUserId: adminId,
      };
    const row = await prisma.v2TileBiasRule.create({
      data: createData,
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
