import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取單個玩家
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        createdClubs: true,
        clubMembers: {
          include: {
            club: true,
          },
        },
      },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json({
      success: true,
      data: player,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 更新玩家
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nickname, cardCount, notes } = body

    const updateData: any = {}
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim()
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount)
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null
    }

    // 如果更新暱稱，檢查是否重複
    if (updateData.nickname) {
      const existingPlayer = await prisma.player.findFirst({
        where: {
          nickname: updateData.nickname,
          NOT: { id },
        },
      })

      if (existingPlayer) {
        return NextResponse.json(
          { success: false, error: '暱稱已存在' },
          { status: 400 }
        )
      }
    }

    const player = await prisma.player.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: player,
      message: '玩家更新成功',
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('更新玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '更新玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 刪除玩家
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.player.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '玩家刪除成功',
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('刪除玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

