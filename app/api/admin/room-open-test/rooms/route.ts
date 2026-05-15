import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueId } from '@/lib/utils'
import { applyClubGameSettingsPolicy, normalizeRoomGameSettings } from '@/lib/club-room-game-settings'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

function isAdminTestRoom(gameSettings: unknown): boolean {
  if (!gameSettings || typeof gameSettings !== 'object' || Array.isArray(gameSettings)) return false
  return (gameSettings as Record<string, unknown>).admin_open_test === true
}

/** 後台開房測試：已建立的測試房列表 */
export async function GET() {
  try {
    const rooms = await prisma.room.findMany({
      where: {
        status: { in: ['WAITING', 'PLAYING'] },
        clubId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        club: { select: { id: true, clubId: true, name: true } },
        creator: { select: { id: true, userId: true, nickname: true } },
        participants: {
          where: { leftAt: null },
          include: {
            player: { select: { id: true, userId: true, nickname: true } },
          },
        },
      },
    })

    const testRooms = rooms.filter((r) => isAdminTestRoom(r.gameSettings))

    const data = testRooms.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      status: r.status,
      currentPlayers: r.currentPlayers,
      maxPlayers: r.maxPlayers,
      gameSettings: r.gameSettings,
      createdAt: r.createdAt.toISOString(),
      club: r.club
        ? { id: r.club.id, clubId: r.club.clubId, name: r.club.name }
        : null,
      host: {
        id: r.creator.id,
        userId: r.creator.userId,
        nickname: r.creator.nickname,
      },
      players: r.participants.map((p) => ({
        id: p.player.id,
        userId: p.player.userId,
        nickname: p.player.nickname,
      })),
    }))

    return NextResponse.json({ success: true, data }, { headers: corsHeaders() })
  } catch (error) {
    console.error('[room-open-test/rooms GET]', error)
    return NextResponse.json(
      { success: false, error: '無法載入房間列表' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

/** 建立測試房並自動加入四名玩家 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const clubIdRaw = body?.clubId?.toString?.()?.trim()
    const hostPlayerId = body?.hostPlayerId?.toString?.()?.trim()
    const playerIdsRaw = body?.playerIds
    const requestedSettings = body?.gameSettings

    if (!clubIdRaw || !hostPlayerId) {
      return NextResponse.json(
        { success: false, error: '請選擇俱樂部與房主' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!Array.isArray(playerIdsRaw) || playerIdsRaw.length !== 3) {
      return NextResponse.json(
        { success: false, error: '請選擇三名玩家' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const playerIds = playerIdsRaw.map((id: unknown) => id?.toString?.()?.trim()).filter(Boolean) as string[]
    if (playerIds.length !== 3) {
      return NextResponse.json(
        { success: false, error: '請選擇三名玩家' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const allPlayerIds = [hostPlayerId, ...playerIds]
    if (new Set(allPlayerIds).size !== 4) {
      return NextResponse.json(
        { success: false, error: '房主與三名玩家不可重複' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findFirst({
      where: { OR: [{ id: clubIdRaw }, { clubId: clubIdRaw }] },
    })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id, playerId: { in: allPlayerIds } },
      select: { playerId: true },
    })
    if (members.length !== 4) {
      return NextResponse.json(
        { success: false, error: '房主與玩家皆須為該俱樂部成員' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const finalGameSettings = applyClubGameSettingsPolicy(
      club.gameSettings ?? null,
      { ...normalizeRoomGameSettings(requestedSettings), admin_open_test: true }
    )

    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({ where: { roomId: id } })
      return !exists
    })

    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: club.id,
        creatorId: hostPlayerId,
        currentPlayers: 0,
        maxPlayers: 4,
        status: 'WAITING',
        multiplayerVersion: 'V2',
        gameSettings: finalGameSettings as object,
      },
    })

    for (const pid of allPlayerIds) {
      await prisma.roomParticipant.upsert({
        where: {
          roomId_playerId: { roomId: room.id, playerId: pid },
        },
        update: { leftAt: null },
        create: { roomId: room.id, playerId: pid, leftAt: null },
      })
    }

    const activeCount = await prisma.roomParticipant.count({
      where: { roomId: room.id, leftAt: null },
    })
    await prisma.room.update({
      where: { id: room.id },
      data: { currentPlayers: activeCount },
    })

    const full = await prisma.room.findUnique({
      where: { id: room.id },
      include: {
        club: { select: { id: true, clubId: true, name: true } },
        creator: { select: { id: true, userId: true, nickname: true } },
        participants: {
          where: { leftAt: null },
          include: { player: { select: { id: true, userId: true, nickname: true } } },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: full?.id,
          roomId: full?.roomId,
          status: full?.status,
          currentPlayers: full?.currentPlayers,
          gameSettings: full?.gameSettings,
          club: full?.club,
          host: full?.creator,
          players: full?.participants.map((p) => p.player) ?? [],
        },
        message: '房間建立成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[room-open-test/rooms POST]', error)
    return NextResponse.json(
      { success: false, error: '建立房間失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
