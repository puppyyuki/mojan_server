'use client'

import { AGENT_LEVELS } from '@/lib/agent-levels'
import { agentLevelLabelZh } from '@/lib/agent-level-display'

export type AgentLevelValue = (typeof AGENT_LEVELS)[number]

type AgentLevelSelectProps = {
  value: AgentLevelValue
  onChange: (level: AgentLevelValue) => void
  disabled?: boolean
}

export default function AgentLevelSelect({
  value,
  onChange,
  disabled = false,
}: AgentLevelSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        代理層級 <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AgentLevelValue)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white disabled:opacity-60"
      >
        {AGENT_LEVELS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {agentLevelLabelZh(lvl)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        階層：總代理 {'>'} 大代理 {'>'} 中代理 {'>'} 小代理 {'>'} 代理；總代理無上層代理
      </p>
    </div>
  )
}

export function isSuperAgentLevel(level: string): boolean {
  return level === 'super'
}
