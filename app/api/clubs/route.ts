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

// 獲取所有俱樂部
export async function GET(request: NextRequest) {
  try {
    const clubs = await prisma.club.findMany({
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      {
        success: true,
        data: clubs,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取俱樂部列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取俱樂部列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 創建俱樂部
export async function POST(request: NextRequest) {
  try {
    const { name, creatorId } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入俱樂部名稱' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!creatorId) {
      return NextResponse.json(
        { success: false, error: '請提供創建者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 檢查創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: creatorId },
    })

    if (!creator) {
      return NextResponse.json(
        { success: false, error: '創建者不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 生成唯一的6位數字ID
    const clubId = await generateUniqueId(async (id) => {
      const exists = await prisma.club.findUnique({
        where: { clubId: id },
      })
      return !exists
    })

    // 創建俱樂部
    const club = await prisma.club.create({
      data: {
        clubId,
        name: name.trim(),
        creatorId,
        cardCount: 0,
      },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
      },
    })

    // 將創建者添加為成員
    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        playerId: creatorId,
      },
    })

    // 重新獲取包含成員的俱樂部
    const clubWithMembers = await prisma.club.findUnique({
      where: { id: club.id },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
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
        data: clubWithMembers,
        message: '俱樂部創建成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('創建俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '創建俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

