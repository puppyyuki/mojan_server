import type { PrismaClient } from '@prisma/client'

/** 管理 transaction 或非 transaction 共用 */
export type PrismaLike = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export async function validateUpstreamAssignment(
  db: PrismaLike,
  opts: {
    subjectPlayerDbId: string
    upstreamPlayerDbId: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { subjectPlayerDbId, upstreamPlayerDbId } = opts

  if (upstreamPlayerDbId === null) {
    return { ok: true }
  }

  if (upstreamPlayerDbId === subjectPlayerDbId) {
    return { ok: false, error: '上層代理不可為本人' }
  }

  const upstreamApproved = await db.agentApplication.findFirst({
    where: { playerId: upstreamPlayerDbId, status: 'approved' },
    select: { id: true },
  })

  if (!upstreamApproved) {
    return { ok: false, error: '上層必須為已核准代理' }
  }

  const upstreamExists = await db.player.findUnique({
    where: { id: upstreamPlayerDbId },
    select: { id: true },
  })

  if (!upstreamExists) {
    return { ok: false, error: '指定的上層玩家不存在' }
  }

  return { ok: true }
}
