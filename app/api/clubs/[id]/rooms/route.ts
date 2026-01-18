import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueId } from '@/lib/utils'

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

// 獲取俱樂部的房間列表
// id 可以是內部ID或俱樂部ID（6位數字）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // 先嘗試通過內部ID查找
    let club = await prisma.club.findUnique({
      where: { id },
    })

    // 如果找不到，嘗試通過俱樂部ID查找
    if (!club) {
      club = await prisma.club.findUnique({
        where: { clubId: id },
      })
    }

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const rooms = await prisma.room.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          where: { leftAt: null },
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    })

    const data = rooms.map((room) => ({
      id: room.id,
      roomId: room.roomId,
      status: room.status,
      currentPlayers: room.currentPlayers,
      maxPlayers: room.maxPlayers,
      gameSettings: room.gameSettings,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players: (room.participants || []).map((p) => ({
        id: p.player?.id ?? p.playerId ?? null,
        userId: p.player?.userId ?? null,
        name: p.player?.nickname ?? '',
        avatarUrl: p.player?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
    }))

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取房間列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取房間列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 創建房間
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { maxPlayers, creatorId } = await request.json()

    // 先嘗試通過內部ID查找
    let club = await prisma.club.findUnique({
      where: { id },
    })

    // 如果找不到，嘗試通過俱樂部ID查找
    if (!club) {
      club = await prisma.club.findUnique({
        where: { clubId: id },
      })
    }

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 如果沒有提供 creatorId，使用俱樂部的創建者
    const roomCreatorId = creatorId || club.creatorId

    // 驗證創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: roomCreatorId },
    })

    if (!creator) {
      return NextResponse.json(
        { success: false, error: '創建者不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 生成唯一的6位數字ID
    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({
        where: { roomId: id },
      })
      return !exists
    })

    // 創建房間
    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: club.id,
        creatorId: roomCreatorId,
        currentPlayers: 0,
        maxPlayers: maxPlayers || 4,
        status: 'WAITING',
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: room,
        message: '房間創建成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('創建房間失敗:', error)
    return NextResponse.json(
      { success: false, error: '創建房間失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 刪除房間（通過 roomId）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('roomId')

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: '請提供房間ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 查找房間
    const room = await prisma.room.findUnique({
      where: { roomId: roomId },
    })

    if (!room) {
      return NextResponse.json(
        { success: false, error: '房間不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 刪除房間
    await prisma.room.delete({
      where: { roomId: roomId },
    })

    return NextResponse.json(
      {
        success: true,
        message: '房間刪除成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('刪除房間失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除房間失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
