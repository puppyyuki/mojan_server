import { AGENT_LEVEL_ORDER } from './agent-levels'

/** 後台／API 統一用的代理身分中文標籤（含舊值相容） */
export function agentLevelLabelZh(agentLevel: string): string {
  switch (agentLevel) {
    case 'super':
      return '總代理'
    case 'master':
      return '大代理'
    case 'mid':
      return '中代理'
    case 'small':
      return '小代理'
    case 'agent':
      return '代理'
    case 'dealer':
      return '經銷'
    case 'distributor':
      return '分銷'
    case 'promoter':
      return '推廣'
    // 舊值（唯讀顯示）
    case 'vip':
      return '公關代理'
    case 'normal':
      return '一般代理'
    default:
      return '代理'
  }
}

/** 列表 badge 用色階 class */
export function agentLevelBadgeClass(agentLevel: string): string {
  switch (agentLevel) {
    case 'super':
    case 'vip':
      return 'bg-purple-100 text-purple-800'
    case 'master':
      return 'bg-blue-100 text-blue-800'
    case 'mid':
      return 'bg-indigo-100 text-indigo-800'
    case 'small':
      return 'bg-teal-100 text-teal-800'
    case 'agent':
    case 'normal':
      return 'bg-gray-100 text-gray-800'
    case 'dealer':
      return 'bg-slate-100 text-slate-800'
    case 'distributor':
      return 'bg-stone-100 text-stone-800'
    case 'promoter':
      return 'bg-neutral-100 text-neutral-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export { AGENT_LEVEL_ORDER }
