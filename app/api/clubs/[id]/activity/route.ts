import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 40
    const skipRaw = Number(url.searchParams.get('skip'))
    const skip =
      Number.isFinite(skipRaw) && skipRaw >= 0 ? Math.floor(skipRaw) : 0

    let club = await prisma.club.findUnique({ where: { id } })
    if (!club) {
      club = await prisma.club.findUnique({ where: { clubId: id } })
    }
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const fetchedRows = await prisma.clubActivity.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit + 1,
    })
    const hasMore = fetchedRows.length > limit
    const rows = hasMore ? fetchedRows.slice(0, limit) : fetchedRows

    const kickedTargetIds = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r?.type === 'MEMBER_KICKED' &&
              isNonEmptyString(r?.targetPlayerId)
          )
          .map((r) => r.targetPlayerId as string)
      ),
    ]

    let normalizedRows = rows
    if (kickedTargetIds.length > 0) {
      const currentMembers = await prisma.clubMember.findMany({
        where: {
          clubId: club.id,
          playerId: { in: kickedTargetIds },
        },
        select: {
          playerId: true,
          isBanned: true,
        },
      })
      const bannedMap = new Map(
        currentMembers.map((m) => [m.playerId, m.isBanned === true])
      )

      const unbannedRows = await prisma.clubActivity.findMany({
        where: {
          clubId: club.id,
          type: 'MEMBER_UNBANNED',
          targetPlayerId: { in: kickedTargetIds },
        },
        select: { targetPlayerId: true, createdAt: true },
      })
      const unbannedAtMap = new Map<string, Date>()
      for (const row of unbannedRows) {
        if (!isNonEmptyString(row?.targetPlayerId)) continue
        const prev = unbannedAtMap.get(row.targetPlayerId)
        if (!prev || row.createdAt > prev) {
          unbannedAtMap.set(row.targetPlayerId, row.createdAt)
        }
      }

      normalizedRows = rows.map((r) => {
        if (r?.type !== 'MEMBER_KICKED' || !isNonEmptyString(r?.targetPlayerId)) {
          return r
        }
        const currentlyBanned = bannedMap.get(r.targetPlayerId) === true
        const latestUnbannedAt = unbannedAtMap.get(r.targetPlayerId)
        const wasLegacyBanThenUnbanned =
          latestUnbannedAt instanceof Date && r.createdAt < latestUnbannedAt
        if (currentlyBanned || wasLegacyBanThenUnbanned) {
          return { ...r, type: 'MEMBER_BANNED' }
        }
        return r
      })
    }

    const playerIds = [
      ...new Set(
        normalizedRows
          .flatMap((r) => [r?.actorPlayerId, r?.targetPlayerId])
          .filter((pid): pid is string => isNonEmptyString(pid))
      ),
    ]
    const idRows =
      playerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: playerIds } },
            select: { id: true, userId: true },
          })
        : []
    const userIdMap = new Map(idRows.map((p) => [p.id, p.userId]))
    const enrichedRows = normalizedRows.map((r) => ({
      ...r,
      actorUserId: isNonEmptyString(r?.actorPlayerId)
        ? userIdMap.get(r.actorPlayerId) ?? null
        : null,
      targetUserId: isNonEmptyString(r?.targetPlayerId)
        ? userIdMap.get(r.targetPlayerId) ?? null
        : null,
    }))

    return NextResponse.json(
      {
        success: true,
        data: {
          items: enrichedRows,
          skip,
          limit,
          hasMore,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取俱樂部動態失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取俱樂部動態失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
