/**
 * 判斷 V2 單局是否已正常結束（胡牌、自摸或流局），供俱樂部總局數／後台報表場次等統計共用。
 * @param {unknown} roundEndPayload
 * @returns {boolean}
 */
function isV2RoundCompletedForStatistics(roundEndPayload) {
  if (
    !roundEndPayload ||
    typeof roundEndPayload !== 'object' ||
    Array.isArray(roundEndPayload)
  ) {
    return false;
  }
  const payload = /** @type {Record<string, unknown>} */ (roundEndPayload);
  if (payload.isExhaustiveDraw === true) return true;
  const ws = Number(payload.winnerSeat);
  return Number.isFinite(ws) && ws >= 0 && ws <= 3;
}

module.exports = { isV2RoundCompletedForStatistics };
