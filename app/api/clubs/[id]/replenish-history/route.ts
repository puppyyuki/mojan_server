import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 俱樂部頂部條成員補卡紀錄
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

    const records = await prisma.clubCardReplenishRecord.findMany({
      where: { clubId: id },
      include: {
        actor: {
          select: {
            userId: true,
            nickname: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          records: records.map((record) => ({
            id: record.id,
            date: record.createdAt.toISOString().split('T')[0],
            time: record.createdAt.toISOString().split('T')[1].split('.')[0],
            actorNickname: record.actor.nickname,
            actorUserId: record.actor.userId,
            amount: record.amount,
            playerPreviousCount: record.playerPreviousCount,
            playerNewCount: record.playerNewCount,
            clubPreviousCount: record.clubPreviousCount,
            clubNewCount: record.clubNewCount,
            createdAt: record.createdAt.toISOString(),
          })),
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取俱樂部補卡紀錄失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取俱樂部補卡紀錄失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
