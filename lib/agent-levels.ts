/** 新五級代理層級 DB 值 */
export const AGENT_LEVELS = ['super', 'master', 'mid', 'small', 'agent'] as const
export type AgentLevel = (typeof AGENT_LEVELS)[number]

/** 舊三級（唯讀相容） */
export const LEGACY_AGENT_LEVELS = ['normal', 'master', 'vip'] as const

/** 合併後所有可辨識的層級值 */
export const ALL_KNOWN_AGENT_LEVELS = [
  ...AGENT_LEVELS,
  'normal',
  'vip',
] as const

/** 層級排序（數字越大越上層）；舊值保留以支援轉卡邏輯 */
export const AGENT_LEVEL_ORDER: Record<string, number> = {
  agent: 1,
  normal: 1,
  small: 2,
  mid: 3,
  master: 4,
  super: 5,
  vip: 5,
}

export function isValidAgentLevel(level: string): level is AgentLevel {
  return (AGENT_LEVELS as readonly string[]).includes(level)
}

export function normalizeAgentLevel(level: string | null | undefined): AgentLevel {
  const raw = String(level ?? '').trim().toLowerCase()
  if (isValidAgentLevel(raw)) return raw
  return 'agent'
}

export function isSuperAgentLevel(level: string): boolean {
  return level === 'super'
}
