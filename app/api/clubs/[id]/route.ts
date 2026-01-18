import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取單個俱樂部
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const club = await prisma.club.findUnique({
      where: { id },
      select: {
        id: true,
        clubId: true,
        name: true,
        description: true,
        logoUrl: true,
        cardCount: true, // 包含俱樂部房卡數量
        avatarUrl: true, // 包含俱樂部頭像 URL
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true, // 包含創建者頭像 URL
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
              },
            },
          },
        },
        rooms: true,
      },
    })

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: club,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 更新俱樂部
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, cardCount, avatarUrl, description, logoUrl } = body

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = name.trim()
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount)
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl ? avatarUrl.trim() : null
    }
    if (description !== undefined) {
      updateData.description = description ? description.trim() : null
    }
    if (logoUrl !== undefined) {
      updateData.logoUrl = logoUrl ? logoUrl.trim() : null
    }

    const club = await prisma.club.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true, // 包含創建者頭像 URL
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: club,
        message: '俱樂部更新成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('更新俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '更新俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 更新俱樂部（PUT 等同於 PATCH）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null as any)
    const name = body?.name
    const cardCount = body?.cardCount
    const avatarUrl = body?.avatarUrl
    const description = body?.description
    const logoUrl = body?.logoUrl
    const actorPlayerId: unknown = body?.actorPlayerId

    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const clubRow = await prisma.club.findUnique({
      where: { id },
      select: { creatorId: true },
    })

    if (!clubRow) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const isOwner = clubRow.creatorId === actorPlayerId
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      })

      const perms = actorMember?.coLeaderPermissions as Record<string, unknown> | null

      const needsModifyRules =
        name !== undefined ||
        avatarUrl !== undefined ||
        description !== undefined ||
        logoUrl !== undefined
      const needsManageCards = cardCount !== undefined

      if (needsModifyRules) {
        const canModify =
          actorMember?.role === 'CO_LEADER' && perms?.modifyClubRules === true
        if (!canModify) {
          return NextResponse.json(
            { success: false, error: '沒有權限' },
            { status: 403, headers: corsHeaders() }
          )
        }
      }
      if (needsManageCards) {
        const canManage =
          actorMember?.role === 'CO_LEADER' && perms?.manageRoomCards === true
        if (!canManage) {
          return NextResponse.json(
            { success: false, error: '沒有權限' },
            { status: 403, headers: corsHeaders() }
          )
        }
      }
    }

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = String(name).trim()
    }
    if (cardCount !== undefined) {
      const parsed = Number(cardCount)
      if (!Number.isFinite(parsed)) {
        return NextResponse.json(
          { success: false, error: '房卡數必須為數字' },
          { status: 400, headers: corsHeaders() }
        )
      }
      updateData.cardCount = Math.trunc(parsed)
    }
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null
    }
    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null
    }
    if (logoUrl !== undefined) {
      updateData.logoUrl = logoUrl ? String(logoUrl).trim() : null
    }

    const club = await prisma.club.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: club,
        message: '俱樂部更新成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('更新俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '更新俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 刪除俱樂部
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const actorPlayerId = url.searchParams.get('actorPlayerId')
    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const clubRow = await prisma.club.findUnique({
      where: { id },
      select: { creatorId: true },
    })
    if (!clubRow) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    if (clubRow.creatorId !== actorPlayerId) {
      return NextResponse.json(
        { success: false, error: '沒有權限' },
        { status: 403, headers: corsHeaders() }
      )
    }
    await prisma.club.delete({
      where: { id },
    })

    return NextResponse.json(
      {
        success: true,
        message: '俱樂部刪除成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('刪除俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
