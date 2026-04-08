import { NextRequest, NextResponse } from 'next/server'

export function assertV2TileBiasInternalSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.V2_TILE_BIAS_INTERNAL_SECRET?.trim()
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'V2_TILE_BIAS_INTERNAL_SECRET 未設定' },
      { status: 503 }
    )
  }
  const sent = request.headers.get('x-v2-tile-bias-secret') ?? ''
  if (sent !== expected) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 })
  }
  return null
}

export function v2TileBiasCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-v2-tile-bias-secret',
  }
}
