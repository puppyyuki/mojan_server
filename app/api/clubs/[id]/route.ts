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
        cardCount: true, // 包含俱樂部房卡數量
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
    const { name, cardCount } = body

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = name.trim()
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount)
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

// 刪除俱樂部
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

