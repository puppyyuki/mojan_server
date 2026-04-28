/** 後台／API 統一用的代理身分中文標籤 */
export function agentLevelLabelZh(agentLevel: string): string {
  if (agentLevel === 'vip') return '公關代理'
  if (agentLevel === 'master') return '大代理'
  return '一般代理'
}
