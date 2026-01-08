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

// 大廳建立房間（不關聯任何俱樂部）
export async function POST(request: NextRequest) {
  try {
    const { maxPlayers, creatorId, gameSettings } = await request.json()

    if (!creatorId) {
      return NextResponse.json(
        { success: false, error: '請提供創建者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

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
    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({ where: { roomId: id } })
      return !exists
    })

    // 處理遊戲設定
    let finalGameSettings = gameSettings || {}
    if (gameSettings) {
      finalGameSettings = {
        base_points: gameSettings.base_points || 100,
        scoring_unit: gameSettings.scoring_unit || 20,
        rounds: gameSettings.rounds || 4,
        game_type: gameSettings.game_type || 'NORTHERN',
        special_rules:
          gameSettings.special_rules || {
            li_gu: false,
            eye_tile_feature: false,
            forced_win: false,
            no_points_dealer: false,
          },
        point_cap: gameSettings.point_cap || 'UP_TO_8_POINTS',
        deduction: gameSettings.deduction || 'AA_DEDUCTION',
        manual_start: gameSettings.manual_start || false,
        ip_check: gameSettings.ip_check || false,
        gps_lock: gameSettings.gps_lock || false,
      }
    }

    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: null, // 大廳房間沒有俱樂部ID
        creatorId,
        currentPlayers: 0,
        maxPlayers: maxPlayers || 4,
        status: 'WAITING',
        gameSettings: finalGameSettings,
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
    console.error('[Rooms API] 大廳建立房間失敗:', error)
    return NextResponse.json(
      { success: false, error: '建立房間失敗: ' + (error as Error).message },
      { status: 500, headers: corsHeaders() }
    )
  }
}
