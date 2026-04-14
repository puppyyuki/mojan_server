import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  assertV2TileBiasInternalSecret,
  v2TileBiasCorsHeaders,
} from '@/lib/v2-tile-bias-internal'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: v2TileBiasCorsHeaders() })
}

/**
 * Colyseus V2 服務拉取啟用中的牌型加權規則（需 x-v2-tile-bias-secret）。
 * 完整 URL 設於 V2_TILE_BIAS_RULES_URL，例如 https://api.example.com/api/internal/v2-tile-bias/rules
 */
export async function GET(request: NextRequest) {
  const deny = assertV2TileBiasInternalSecret(request)
  if (deny) {
    return NextResponse.json(
      { rules: [], error: 'forbidden' },
      { status: 403, headers: v2TileBiasCorsHeaders() }
    )
  }

  try {
    const rows = await prisma.v2TileBiasRule.findMany({
      where: { enabled: true },
      orderBy: [{ weight: 'desc' } as any, { priority: 'desc' }, { updatedAt: 'desc' }],
    })
    const rules = rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      gameType: r.gameType as 'NORTHERN' | 'SOUTHERN' | 'BOTH',
      phase: r.phase as 'opening' | 'draw',
      patternIds: Array.isArray(r.patternIds)
        ? (r.patternIds as string[])
        : JSON.parse(JSON.stringify(r.patternIds ?? [])),
      combine: (r.combine === 'any' ? 'any' : 'all') as 'all' | 'any',
      probability: r.probability,
      weight: (r as any).weight ?? 0,
      priority: r.priority,
      enabled: r.enabled,
      validFrom: r.validFrom?.toISOString() ?? null,
      validTo: r.validTo?.toISOString() ?? null,
    }))
    return NextResponse.json({ rules }, { headers: v2TileBiasCorsHeaders() })
  } catch (e) {
    console.error('internal v2-tile-bias rules:', e)
    return NextResponse.json(
      { rules: [], error: 'server_error' },
      { status: 500, headers: v2TileBiasCorsHeaders() }
    )
  }
}
