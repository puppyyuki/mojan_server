import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'
import { validateUpstreamAssignment } from '@/lib/upstream-agent-validation'

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
    const { nickname, cardCount, bio, maxJoinClubCount } = body
    const hasUpstreamKey =
      typeof body === 'object' && body !== null && 'upstreamAgentPlayerId' in body

    let normalizedUpstream: string | null | undefined = undefined
    if (hasUpstreamKey) {
      const raw = (body as Record<string, unknown>).upstreamAgentPlayerId
      if (raw === null || raw === '') {
        normalizedUpstream = null
      } else if (typeof raw === 'string' && raw.trim() !== '') {
        normalizedUpstream = raw.trim()
      } else {
        return NextResponse.json(
          { success: false, error: '上層代理 id 格式不正確' },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    if (cardCount !== undefined || hasUpstreamKey) {
      const opCodeGuard = assertAdminOpCode(request, body)
      if (opCodeGuard.ok === false) {
        return opCodeGuard.response
      }
      const adminUserId = await getCurrentUserId(request)
      if (!adminUserId) {
        return NextResponse.json(
          { success: false, error: '未授權，請重新登入管理員帳號' },
          { status: 401, headers: corsHeaders() }
        )
      }
    }

    // 獲取當前玩家資料（用於記錄補卡前的數量）
    const currentPlayer = await prisma.player.findUnique({
      where: { id },
    })

    if (!currentPlayer) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const updateData: any = {}
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim()
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount)
    }
    if (bio !== undefined) {
      updateData.bio = bio === null || bio === '' ? null : bio.trim()
    }
    if (maxJoinClubCount !== undefined) {
      const parsedMaxJoin = parseInt(String(maxJoinClubCount), 10)
      if (!Number.isFinite(parsedMaxJoin) || parsedMaxJoin < 1) {
        return NextResponse.json(
          { success: false, error: '可加入俱樂部上限必須為大於等於 1 的整數' },
          { status: 400, headers: corsHeaders() }
        )
      }
      updateData.maxJoinClubCount = parsedMaxJoin
    }

    if (normalizedUpstream !== undefined) {
      const vu = await validateUpstreamAssignment(prisma, {
        subjectPlayerDbId: id,
        upstreamPlayerDbId: normalizedUpstream,
      })
      if (vu.ok === false) {
        return NextResponse.json(
          { success: false, error: vu.error },
          { status: 400, headers: corsHeaders() }
        )
      }
      updateData.upstreamAgentPlayerId = normalizedUpstream
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
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    // 如果更新房卡數量，記錄補卡操作
    if (cardCount !== undefined) {
      const previousCount = currentPlayer.cardCount
      const newCount = parseInt(cardCount)
      const amount = newCount - previousCount

      // 如果有補卡（增加），記錄補卡歷史
      if (amount > 0) {
        // 獲取當前登入的管理員ID
        const adminUserId = await getCurrentUserId(request)
        
        if (adminUserId) {
          // 記錄補卡操作
          await prisma.cardRechargeRecord.create({
            data: {
              playerId: id,
              adminUserId: adminUserId,
              amount: amount,
              previousCount: previousCount,
              newCount: newCount,
            },
          })
        }
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
    const errorMessage = error instanceof Error ? error.message : '更新玩家失敗'
    return NextResponse.json(
      { success: false, error: errorMessage },
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
    const opCodeGuard = assertAdminOpCode(request)
    if (opCodeGuard.ok === false) {
      return opCodeGuard.response
    }
    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權，請重新登入管理員帳號' },
        { status: 401, headers: corsHeaders() }
      )
    }
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

