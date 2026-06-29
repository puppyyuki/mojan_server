import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

function serializeBranch(row: {
  id: string
  clubId: string
  masterAgentPlayerId: string
  branchRoomCardFee: number
  masterAgent: { id: string; userId: string; nickname: string } | null
}) {
  return {
    id: row.id,
    clubId: row.clubId,
    masterAgentPlayerId: row.masterAgentPlayerId,
    branchRoomCardFee: row.branchRoomCardFee,
    masterAgent: row.masterAgent,
  }
}

async function requireAdminOpCode(request: NextRequest, body: unknown) {
  const opCodeGuard = assertAdminOpCode(request, body)
  if (opCodeGuard.ok === false) return opCodeGuard.response

  const adminUserId = await getCurrentUserId(request)
  if (!adminUserId) {
    return NextResponse.json(
      { success: false, error: '未授權，請重新登入管理員帳號' },
      { status: 401, headers: corsHeaders() }
    )
  }
  return null
}

async function assertMasterAgent(clubId: string, masterAgentPlayerId: string) {
  const binding = await prisma.agentClubBinding.findUnique({
    where: {
      playerId_clubId: {
        playerId: masterAgentPlayerId,
        clubId,
      },
    },
    select: {
      playerId: true,
      agentLevel: true,
      player: {
        select: { id: true, userId: true, nickname: true },
      },
    },
  })

  return binding?.agentLevel === 'master' ? binding : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const club = await prisma.club.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const rows = await prisma.clubRoomCardBranchFee.findMany({
      where: { clubId: id },
      include: {
        masterAgent: {
          select: { id: true, userId: true, nickname: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(
      { success: true, data: rows.map(serializeBranch) },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('載入分支房卡設定失敗:', error)
    return NextResponse.json(
      { success: false, error: '載入分支房卡設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const guard = await requireAdminOpCode(request, body)
    if (guard) return guard

    const masterAgentPlayerId = String(body?.masterAgentPlayerId ?? '').trim()
    const branchRoomCardFee = Number(body?.branchRoomCardFee)

    if (!masterAgentPlayerId) {
      return NextResponse.json(
        { success: false, error: '請選擇綁定的大代理' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (!Number.isFinite(branchRoomCardFee) || branchRoomCardFee < 0) {
      return NextResponse.json(
        { success: false, error: '分支房卡費須為非負數' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const masterBinding = await assertMasterAgent(id, masterAgentPlayerId)
    if (!masterBinding) {
      return NextResponse.json(
        { success: false, error: '綁定對象必須是該俱樂部的大代理' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const row = await prisma.clubRoomCardBranchFee.upsert({
      where: {
        clubId_masterAgentPlayerId: {
          clubId: id,
          masterAgentPlayerId,
        },
      },
      create: {
        clubId: id,
        masterAgentPlayerId,
        branchRoomCardFee,
      },
      update: {
        branchRoomCardFee,
      },
      include: {
        masterAgent: {
          select: { id: true, userId: true, nickname: true },
        },
      },
    })

    return NextResponse.json(
      { success: true, data: serializeBranch(row), message: '分支房卡設定已儲存' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('儲存分支房卡設定失敗:', error)
    return NextResponse.json(
      { success: false, error: '儲存分支房卡設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export const PATCH = POST

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const guard = await requireAdminOpCode(request, body)
    if (guard) return guard

    const masterAgentPlayerId = String(body?.masterAgentPlayerId ?? '').trim()
    if (!masterAgentPlayerId) {
      return NextResponse.json(
        { success: false, error: '請提供要移除的大代理' },
        { status: 400, headers: corsHeaders() }
      )
    }

    await prisma.clubRoomCardBranchFee.deleteMany({
      where: { clubId: id, masterAgentPlayerId },
    })

    return NextResponse.json(
      { success: true, message: '分支房卡設定已移除' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('移除分支房卡設定失敗:', error)
    return NextResponse.json(
      { success: false, error: '移除分支房卡設定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
