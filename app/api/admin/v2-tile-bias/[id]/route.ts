import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

function normalizePatternIds(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? '').trim()).filter(Boolean)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  const { id } = await params
  try {
    const existing = await prisma.v2TileBiasRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '規則不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    const body = await request.json()
    const data: Prisma.V2TileBiasRuleUpdateInput = {}

    if (body.gameType != null) {
      const g = String(body.gameType).toUpperCase()
      if (!['NORTHERN', 'SOUTHERN', 'BOTH'].includes(g)) {
        return NextResponse.json(
          { success: false, error: 'gameType 無效' },
          { status: 400, headers: corsHeaders() }
        )
      }
      data.gameType = g
    }
    if (body.phase != null) {
      const ph = String(body.phase).toLowerCase()
      if (!['opening', 'draw'].includes(ph)) {
        return NextResponse.json(
          { success: false, error: 'phase 無效' },
          { status: 400, headers: corsHeaders() }
        )
      }
      data.phase = ph
    }
    const pids = normalizePatternIds(body.patternIds)
    if (pids !== undefined) {
      if (pids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'patternIds 不可為空' },
          { status: 400, headers: corsHeaders() }
        )
      }
      data.patternIds = pids
    }
    if (body.combine != null) data.combine = body.combine === 'any' ? 'any' : 'all'
    if (body.probability != null) {
      const p = Math.min(1, Math.max(0, Number(body.probability)))
      if (!Number.isFinite(p)) {
        return NextResponse.json(
          { success: false, error: '機率無效' },
          { status: 400, headers: corsHeaders() }
        )
      }
      data.probability = p
    }
    if (body.priority != null) data.priority = Math.floor(Number(body.priority) || 0)
    if (body.enabled != null) data.enabled = Boolean(body.enabled)
    if (body.validFrom !== undefined) {
      data.validFrom =
        body.validFrom != null && String(body.validFrom).length > 0
          ? new Date(String(body.validFrom))
          : null
    }
    if (body.validTo !== undefined) {
      data.validTo =
        body.validTo != null && String(body.validTo).length > 0
          ? new Date(String(body.validTo))
          : null
    }

    const row = await prisma.v2TileBiasRule.update({
      where: { id },
      data,
      include: {
        player: { select: { id: true, userId: true, nickname: true } },
      },
    })
    return NextResponse.json({ success: true, data: row }, { headers: corsHeaders() })
  } catch (e) {
    console.error('admin v2-tile-bias PATCH:', e)
    return NextResponse.json(
      { success: false, error: '更新失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  const { id } = await params
  try {
    await prisma.v2TileBiasRule.delete({ where: { id } })
    return NextResponse.json({ success: true }, { headers: corsHeaders() })
  } catch {
    return NextResponse.json(
      { success: false, error: '刪除失敗或不存在' },
      { status: 404, headers: corsHeaders() }
    )
  }
}
