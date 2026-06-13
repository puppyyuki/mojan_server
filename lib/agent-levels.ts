import shared from './agent-levels.shared.js'

/** 八級代理層級 DB 值（由高到低含 super） */
export const AGENT_LEVELS = shared.AGENT_LEVELS as readonly [
  'super',
  'master',
  'mid',
  'small',
  'agent',
  'dealer',
  'distributor',
  'promoter',
]

export type AgentLevel = (typeof AGENT_LEVELS)[number]

/** 舊三級（唯讀相容） */
export const LEGACY_AGENT_LEVELS = shared.LEGACY_AGENT_LEVELS as readonly [
  'normal',
  'master',
  'vip',
]

/** 合併後所有可辨識的層級值 */
export const ALL_KNOWN_AGENT_LEVELS = shared.ALL_KNOWN_AGENT_LEVELS as readonly string[]

/** 層級排序（數字越大越上層）；舊值保留以支援轉卡邏輯 */
export const AGENT_LEVEL_ORDER: Record<string, number> = shared.AGENT_LEVEL_ORDER

export const PROMOTABLE_LEVELS = shared.PROMOTABLE_LEVELS as readonly string[]

export function isValidAgentLevel(level: string): level is AgentLevel {
  return shared.isValidAgentLevel(level)
}

export function normalizeAgentLevel(level: string | null | undefined): AgentLevel {
  return shared.normalizeAgentLevel(level) as AgentLevel
}

export function isSuperAgentLevel(level: string): boolean {
  return shared.isSuperAgentLevel(level)
}

export function levelOrder(level: string | null | undefined): number {
  return shared.levelOrder(level)
}

export function isValidPromotableLevel(level: string): boolean {
  return shared.isValidPromotableLevel(level)
}

export function getAssignableAgentLevels(
  upstreamLevel: string | null | undefined
): string[] {
  return shared.getAssignableAgentLevels(upstreamLevel)
}
