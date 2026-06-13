/**
 * 代理層級中文標籤（Express 與 TS 共用）。
 */

const AGENT_LEVEL_LABEL_ZH = Object.freeze({
  super: '總代理',
  master: '大代理',
  mid: '中代理',
  small: '小代理',
  agent: '代理',
  dealer: '經銷',
  distributor: '分銷',
  promoter: '推廣',
  vip: '公關代理',
  normal: '一般代理',
});

function agentLevelLabelZh(agentLevel) {
  const raw = String(agentLevel ?? '').trim().toLowerCase();
  return AGENT_LEVEL_LABEL_ZH[raw] ?? '代理';
}

module.exports = {
  AGENT_LEVEL_LABEL_ZH,
  agentLevelLabelZh,
};
