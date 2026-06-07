import type { PrismaClient } from '@prisma/client'
import {
  AGENT_LEVELS,
  isSuperAgentLevel,
  isValidAgentLevel,
} from './agent-levels'
import { agentLevelLabelZh } from './agent-level-display'
import { validateUpstreamAssignment, type PrismaLike } from './upstream-agent-validation'

export { AGENT_LEVELS, isValidAgentLevel, isSuperAgentLevel }

export function parseNonNegativeFloat(raw: unknown, fallback = 2): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export async function buildAgentLegacyContext(
  db: PrismaLike,
  playerDbId: string
) {
  const player = await db.player.findUnique({
    where: { id: playerDbId },
    select: {
      upstreamAgentPlayerId: true,
      upstreamAgent: {
        select: { id: true, userId: true, nickname: true },
      },
      createdClubs: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          id: true,
          clubId: true,
          name: true,
          creator: {
            select: { id: true, userId: true, nickname: true },
          },
          members: {
            where: { role: { in: ['OWNER', 'CO_LEADER'] } },
            select: {
              role: true,
              player: {
                select: { id: true, userId: true, nickname: true },
              },
            },
          },
        },
      },
      clubMembers: {
        where: { role: 'OWNER' },
        orderBy: { joinedAt: 'asc' },
        take: 1,
        select: {
          club: {
            select: {
              id: true,
              clubId: true,
              name: true,
              creator: {
                select: { id: true, userId: true, nickname: true },
              },
              members: {
                where: { role: { in: ['OWNER', 'CO_LEADER'] } },
                select: {
                  role: true,
                  player: {
                    select: { id: true, userId: true, nickname: true },
                  },
                },
              },
            },
          },
        },
      },
      agentApplications: {
        where: { status: 'approved' },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { agentLevel: true },
      },
    },
  })

  if (!player) return null

  const previousClub =
    player.createdClubs[0] ?? player.clubMembers[0]?.club ?? null

  const legacyAgentLevel =
    player.agentApplications[0]?.agentLevel ?? 'normal'

  const owners: Array<{ userId: string; nickname: string }> = []
  const coLeaders: Array<{ userId: string; nickname: string }> = []

  if (previousClub) {
    for (const m of previousClub.members) {
      const entry = {
        userId: m.player.userId,
        nickname: m.player.nickname,
      }
      if (m.role === 'OWNER') {
        owners.push(entry)
      } else if (m.role === 'CO_LEADER') {
        coLeaders.push(entry)
      }
    }
    if (owners.length === 0 && previousClub.creator) {
      owners.push({
        userId: previousClub.creator.userId,
        nickname: previousClub.creator.nickname,
      })
    }
  }

  return {
    previousClub: previousClub
      ? {
          clubDbId: previousClub.id,
          clubId: previousClub.clubId,
          name: previousClub.name,
        }
      : null,
    owners,
    coLeaders,
    legacyUpstreamAgent: player.upstreamAgent
      ? {
          playerDbId: player.upstreamAgent.id,
          userId: player.upstreamAgent.userId,
          nickname: player.upstreamAgent.nickname,
        }
      : null,
    legacyAgentLevel,
    legacyAgentLevelLabel: agentLevelLabelZh(legacyAgentLevel),
  }
}

export async function validateAgentClubBindingInput(
  db: PrismaLike,
  opts: {
    subjectPlayerDbId: string
    clubId: string
    agentLevel: string
    upstreamAgentPlayerId: string | null
    agentRoomCardFee: number
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subjectPlayerDbId, clubId, agentLevel, upstreamAgentPlayerId, agentRoomCardFee } =
    opts

  if (!isValidAgentLevel(agentLevel)) {
    return { ok: false, error: '無效的代理層級' }
  }

  if (agentRoomCardFee < 0 || !Number.isFinite(agentRoomCardFee)) {
    return { ok: false, error: '代理房卡費須為非負數' }
  }

  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { id: true },
  })
  if (!club) {
    return { ok: false, error: '俱樂部不存在' }
  }

  if (isSuperAgentLevel(agentLevel)) {
    if (upstreamAgentPlayerId !== null) {
      return { ok: false, error: '總代理不可設定上層代理' }
    }
  } else {
    if (!upstreamAgentPlayerId) {
      return { ok: false, error: '請選擇上層代理' }
    }
    const vu = await validateUpstreamAssignment(db, {
      subjectPlayerDbId,
      upstreamPlayerDbId: upstreamAgentPlayerId,
    })
    if (vu.ok === false) return vu
  }

  return { ok: true }
}

export function serializeAgentClubBinding(row: {
  id: string
  clubId: string
  upstreamAgentPlayerId: string | null
  agentLevel: string
  agentRoomCardFee: number
  club: { id: string; clubId: string; name: string }
  upstreamAgent: { id: string; userId: string; nickname: string } | null
}) {
  return {
    id: row.id,
    clubDbId: row.club.id,
    clubId: row.club.clubId,
    clubName: row.club.name,
    agentLevel: row.agentLevel,
    agentLevelLabel: agentLevelLabelZh(row.agentLevel),
    agentRoomCardFee: row.agentRoomCardFee,
    upstreamAgent: row.upstreamAgent
      ? {
          playerDbId: row.upstreamAgent.id,
          userId: row.upstreamAgent.userId,
          nickname: row.upstreamAgent.nickname,
        }
      : null,
  }
}

export function serializePlayerClubUpstreamBinding(row: {
  id: string
  club: { id: string; clubId: string; name: string }
  upstreamAgent: { id: string; userId: string; nickname: string }
}) {
  return {
    id: row.id,
    clubDbId: row.club.id,
    clubId: row.club.clubId,
    clubName: row.club.name,
    upstreamAgent: {
      playerDbId: row.upstreamAgent.id,
      userId: row.upstreamAgent.userId,
      nickname: row.upstreamAgent.nickname,
    },
  }
}

export type PrismaFull = PrismaClient
