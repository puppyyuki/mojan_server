/**
 * 俱樂部成員「當週淨分」與分數上限（scoreLimit）判定。
 * 週區間：台北時間週一 00:00 起算。
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function toTaipeiPseudoUtc(date) {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS);
}

function fromTaipeiPseudoUtc(date) {
  return new Date(date.getTime() - TAIPEI_OFFSET_MS);
}

function startOfTaipeiDay(date = new Date()) {
  const x = toTaipeiPseudoUtc(date);
  x.setUTCHours(0, 0, 0, 0);
  return fromTaipeiPseudoUtc(x);
}

function startOfTaipeiWeek(date = new Date()) {
  const dayStart = startOfTaipeiDay(date);
  const x = toTaipeiPseudoUtc(dayStart);
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return fromTaipeiPseudoUtc(x);
}

/** 以週一日期 YYYY-MM-DD（台北）作為週識別 */
function getTaipeiWeekKey(date = new Date()) {
  const weekStart = startOfTaipeiWeek(date);
  const x = toTaipeiPseudoUtc(weekStart);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const d = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 將 member 的週分數正規化到當週（跨週則視為 0）。
 * @returns {{ weeklyNetScore: number, weeklyScoreWeekKey: string }}
 */
function normalizeMemberWeeklyScore(member, now = new Date()) {
  const currentKey = getTaipeiWeekKey(now);
  const storedKey = member?.weeklyScoreWeekKey?.toString?.() ?? null;
  let weeklyNetScore = Number(member?.weeklyNetScore) || 0;
  if (storedKey !== currentKey) {
    weeklyNetScore = 0;
  }
  return { weeklyNetScore, weeklyScoreWeekKey: currentKey };
}

/**
 * 結算後寫入用的週分數更新 payload。
 */
function applyWeeklyScoreDelta(member, delta, now = new Date()) {
  const normalized = normalizeMemberWeeklyScore(member, now);
  return {
    weeklyNetScore: normalized.weeklyNetScore + (Number(delta) || 0),
    weeklyScoreWeekKey: normalized.weeklyScoreWeekKey,
  };
}

/**
 * scoreLimit 有設定且當週淨分 <= -scoreLimit 時禁止遊玩。
 */
function isMemberOverWeeklyScoreLimit(member, now = new Date()) {
  const rawLimit = member?.scoreLimit;
  if (rawLimit === null || rawLimit === undefined) return false;
  const limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const { weeklyNetScore } = normalizeMemberWeeklyScore(member, now);
  return weeklyNetScore <= -limit;
}

function weeklyScoreLimitMessage(scoreLimit) {
  const limit = Number(scoreLimit);
  const display = Number.isFinite(limit) ? limit : scoreLimit;
  return `本週累積負分已達上限（${display}），請聯繫管理員調整`;
}

module.exports = {
  getTaipeiWeekKey,
  startOfTaipeiWeek,
  normalizeMemberWeeklyScore,
  applyWeeklyScoreDelta,
  isMemberOverWeeklyScoreLimit,
  weeklyScoreLimitMessage,
};
