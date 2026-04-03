/**
 * v2 重播 11 碼分享碼：同場 session 共用前 9 碼（0–9 不重複）+ 2 碼局序。
 */

/** 前 9 碼：0–9 各數字至多出現一次（隨機洗牌取前 9 個） */
function buildNineNonRepeatingDigits() {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, 9).join('');
}

/** 後 2 碼：局序，01–99 */
function roundIndexSuffix(roundIndex) {
  const n = Number(roundIndex);
  const clamped = Number.isFinite(n)
    ? Math.min(99, Math.max(1, Math.floor(n)))
    : 1;
  return String(clamped).padStart(2, '0');
}

function buildShareCodeWithPrefix(prefix, roundIndex) {
  return `${prefix}${roundIndexSuffix(roundIndex)}`;
}

/** 同場 session 已存在的分享碼前 9 碼（依局序取第一個有碼者，供新局沿用） */
function getSessionSharePrefixFromRounds(sessionRounds) {
  const sorted = [...sessionRounds].sort(
    (a, b) => Number(a.roundIndex) - Number(b.roundIndex)
  );
  for (const r of sorted) {
    const sc = r.shareCode ? String(r.shareCode) : '';
    if (sc.length >= 9) {
      return sc.slice(0, 9);
    }
  }
  return null;
}

function normalizeShareCodeInput(raw) {
  const s = String(raw || '').replace(/\D/g, '');
  return s.length === 11 ? s : null;
}

/**
 * 在 transaction 內為該局寫入 shareCode（若已有則直接回傳）。
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} roundId
 * @param {string | null | undefined} allocatedByPlayerId 寫入本局 shareCodeAllocatedByPlayerId（可為 null）
 */
async function allocateShareCodeInTx(tx, roundId, allocatedByPlayerId) {
  let current = await tx.v2MatchRound.findUnique({
    where: { id: roundId },
    include: {
      session: {
        include: { rounds: { orderBy: { roundIndex: 'asc' } } },
      },
    },
  });
  if (!current) {
    throw new Error('局資料不存在');
  }
  if (current.shareCode) {
    return current.shareCode;
  }

  const sessionRounds = current.session.rounds;
  const allocator =
    allocatedByPlayerId && String(allocatedByPlayerId).trim()
      ? String(allocatedByPlayerId).trim()
      : null;

  const roundsNeedingCodes = () => {
    const currentRoundIndex = Number(current.roundIndex);
    return sessionRounds.filter((r) => {
      if (r.id === roundId) return true;
      const ri = Number(r.roundIndex);
      if (!Number.isFinite(ri) || ri < 1) return false;
      if (!Number.isFinite(currentRoundIndex) || currentRoundIndex < 1) {
        return true;
      }
      // 補齊至當前局：避免早期局因偶發失敗缺碼，導致範圍從 02 起跳。
      return ri <= currentRoundIndex;
    });
  };

  const remapAllWithPrefix = async (prefix) => {
    const toTouch = roundsNeedingCodes();
    for (const r of toTouch) {
      const newCode = buildShareCodeWithPrefix(prefix, r.roundIndex);
      const data = { shareCode: newCode };
      if (r.id === roundId && allocator) {
        data.shareCodeAllocatedByPlayerId = allocator;
      }
      await tx.v2MatchRound.update({ where: { id: r.id }, data });
    }
    const fin = await tx.v2MatchRound.findUnique({ where: { id: roundId } });
    return fin?.shareCode ?? null;
  };

  const siblingPrefix = getSessionSharePrefixFromRounds(sessionRounds);
  if (siblingPrefix) {
    try {
      const code = await remapAllWithPrefix(siblingPrefix);
      if (code) return code;
    } catch (e) {
      if (e.code !== 'P2002') {
        throw e;
      }
    }
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const prefix = buildNineNonRepeatingDigits();
    try {
      const code = await remapAllWithPrefix(prefix);
      if (code) {
        return code;
      }
    } catch (e) {
      if (e.code === 'P2002') {
        continue;
      }
      throw e;
    }
  }
  throw new Error('無法產生唯一重播碼，請稍後再試');
}

module.exports = {
  buildNineNonRepeatingDigits,
  roundIndexSuffix,
  buildShareCodeWithPrefix,
  getSessionSharePrefixFromRounds,
  normalizeShareCodeInput,
  allocateShareCodeInTx,
};
