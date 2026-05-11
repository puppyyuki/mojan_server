import { NextRequest, NextResponse } from 'next/server'
import { ensureAppReleaseSetting } from '@/lib/app-release-setting'

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

/** 客戶端讀取版本政策（無需登入） */
export async function GET(_request: NextRequest) {
  try {
    const row = await ensureAppReleaseSetting()
    return NextResponse.json(
      {
        success: true,
        data: {
          policyVersion: row.policyVersion,
          forceUpdate: row.forceUpdate,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (e) {
    console.error('client app-release GET:', e)
    return NextResponse.json(
      { success: false, error: '讀取版本設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
