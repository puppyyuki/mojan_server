import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 設定/撤銷副會長
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { playerId, role, actorPlayerId } = await request.json() // role: 'CO_LEADER' | 'MEMBER'
    if (!playerId || !role) {
      return NextResponse.json(
        { success: false, error: '請提供玩家ID與角色' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }
    // 不能更改 Owner 的角色
    const club = await prisma.club.findUnique({ where: { id } })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    if (club.creatorId !== actorPlayerId) {
      return NextResponse.json(
        { success: false, error: '沒有權限' },
        { status: 403, headers: corsHeaders() }
      )
    }
    if (club.creatorId === playerId) {
      return NextResponse.json(
        { success: false, error: '不可更改擁有者角色' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const normalizedRole = String(role).toUpperCase()
    const data: Record<string, unknown> = { role: normalizedRole }

    if (normalizedRole === 'CO_LEADER') {
      data.coLeaderPermissions = {
        modifyClubRules: true,
        approveJoinRequests: true,
        kickMembers: true,
        banMembers: true,
        banSameTable: true,
        setScoreLimit: true,
        manageRoomCards: false,
      }
    } else {
      data.coLeaderPermissions = null
    }

    const member = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: id, playerId } },
      data,
    })
    return NextResponse.json({ success: true, data: member }, { headers: corsHeaders() })
  } catch (error) {
    console.error('更新成員角色失敗:', error)
    return NextResponse.json(
      { success: false, error: '更新成員角色失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
