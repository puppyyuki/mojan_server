import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureAppReleaseSetting } from '@/lib/app-release-setting'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  try {
    const row = await ensureAppReleaseSetting()
    return NextResponse.json(
      {
        success: true,
        data: {
          policyVersion: row.policyVersion,
          forceUpdate: row.forceUpdate,
          updatedAt: row.updatedAt.toISOString(),
        },
      },
      { headers: corsHeaders() }
    )
  } catch (e) {
    console.error('admin app-release GET:', e)
    return NextResponse.json(
      { success: false, error: '讀取版本設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const adminId = await getCurrentUserId(request)
  if (!adminId) {
    return NextResponse.json(
      { success: false, error: '未授權' },
      { status: 401, headers: corsHeaders() }
    )
  }
  try {
    const body = await request.json()
    let policyVersion =
      typeof body.policyVersion === 'string' ? body.policyVersion.trim() : ''
    if (policyVersion.length > 80) {
      return NextResponse.json(
        { success: false, error: '版本字串過長' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (policyVersion.startsWith('v') || policyVersion.startsWith('V')) {
      policyVersion = policyVersion.slice(1)
    }

    const forceUpdateRaw = body.forceUpdate
    const forceUpdate =
      forceUpdateRaw === true ||
      forceUpdateRaw === 'true' ||
      forceUpdateRaw === 1 ||
      forceUpdateRaw === '1'

    await ensureAppReleaseSetting()
    const row = await prisma.appReleaseSetting.update({
      where: { id: 'default' },
      data: {
        policyVersion,
        forceUpdate,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          policyVersion: row.policyVersion,
          forceUpdate: row.forceUpdate,
          updatedAt: row.updatedAt.toISOString(),
        },
      },
      { headers: corsHeaders() }
    )
  } catch (e) {
    console.error('admin app-release PATCH:', e)
    return NextResponse.json(
      { success: false, error: '更新版本設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
