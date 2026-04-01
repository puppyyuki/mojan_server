import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatTaipeiDate, formatTaipeiTime } from '@/lib/taipei-time'

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

    const memberTransferRecords = await prisma.clubCardReplenishRecord.findMany({
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
    const adminRechargeRecords = await prisma.clubAdminCardRechargeRecord.findMany({
      where: { clubId: id },
      include: {
        adminUser: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const records = [
      ...memberTransferRecords.map((record) => ({
        id: record.id,
        sourceType: 'MEMBER_TRANSFER',
        date: formatTaipeiDate(record.createdAt),
        time: formatTaipeiTime(record.createdAt),
        actorNickname: record.actor.nickname,
        actorUserId: record.actor.userId,
        amount: record.amount,
        playerPreviousCount: record.playerPreviousCount,
        playerNewCount: record.playerNewCount,
        clubPreviousCount: record.clubPreviousCount,
        clubNewCount: record.clubNewCount,
        note: '',
        createdAt: record.createdAt,
      })),
      ...adminRechargeRecords.map((record) => ({
        id: record.id,
        sourceType: 'ADMIN_RECHARGE',
        date: formatTaipeiDate(record.createdAt),
        time: formatTaipeiTime(record.createdAt),
        actorNickname: record.adminUser.username,
        actorUserId: record.adminUserId,
        amount: record.amount,
        playerPreviousCount: null as number | null,
        playerNewCount: null as number | null,
        clubPreviousCount: record.previousCount,
        clubNewCount: record.newCount,
        note: record.note ?? '',
        createdAt: record.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return NextResponse.json(
      {
        success: true,
        data: {
          records,
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
