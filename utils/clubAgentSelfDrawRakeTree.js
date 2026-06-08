/**
 * 俱樂部成員列表「自摸抽」顯示值。
 *
 * - 一般玩家：時間區間內上交金額 A = 自摸贏分加總 × 俱樂部 selfDrawRakePercent
 * - 代理：從下線分上來的金額 + 自身自摸時需往上繳的金額
 * - 代理%數輸入值代表原始贏分百分點：
 *   一般玩家上繳池 A 會先換算成池內比例分配；代理自身自摸則直接用原始贏分計算上繳。
 */

const { aggregateSelfDrawStatsByPlayerId } = require('./clubSelfDrawRakeMoney');

function roundMoney(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function clampPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function agentPercentageRate(agentPercentage, clubRakePercent) {
  const rakePercent = clampPercent(clubRakePercent);
  if (rakePercent <= 0) return 0;

  const effectivePercentOfPool =
    (clampPercent(agentPercentage) * 100) / rakePercent;
  return clampPercent(effectivePercentOfPool) / 100;
}

function resolveFirstUpstream(playerId, bindingByPlayer, upstreamBindingsByPlayer) {
  const fromPlayerBinding = upstreamBindingsByPlayer.get(playerId);
  if (fromPlayerBinding) return fromPlayerBinding;

  const selfBinding = bindingByPlayer.get(playerId);
  return selfBinding?.upstreamAgentPlayerId ?? null;
}

function buildAgentPathFromPlayer(playerId, bindingByPlayer, upstreamBindingsByPlayer) {
  const path = [];
  const visited = new Set();
  let current = resolveFirstUpstream(playerId, bindingByPlayer, upstreamBindingsByPlayer);

  while (current && !visited.has(current)) {
    visited.add(current);
    if (bindingByPlayer.has(current)) {
      path.push(current);
    }
    const b = bindingByPlayer.get(current);
    current = b?.upstreamAgentPlayerId ?? null;
  }

  return path;
}

function buildAgentPathFromSelf(agentId, bindingByPlayer) {
  const path = [];
  const visited = new Set();
  let current = agentId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const b = bindingByPlayer.get(current);
    if (!b) break;
    path.push(current);
    current = b.upstreamAgentPlayerId ?? null;
  }

  return path;
}

function addDisplayAmount(displayMap, playerId, amount) {
  if (!playerId) return;
  displayMap.set(
    playerId,
    roundMoney((displayMap.get(playerId) || 0) + amount)
  );
}

function resolveWinBase(win, pool, rakeRate) {
  if (win > 0) return win;
  if (pool > 0 && rakeRate > 0) return pool / rakeRate;
  return 0;
}

/**
 * @param {Map<string, number>} winByPlayer - 自摸正分加總
 * @param {Map<string, number>} poolByPlayer - 分配池 A
 * @param {number} clubRakePercent - 俱樂部自摸抽%（後台設定）
 */
function computeDisplaySelfDrawRakeByPlayer(
  winByPlayer,
  poolByPlayer,
  bindings,
  upstreamBindings = [],
  clubRakePercent = 8
) {
  const bindingByPlayer = new Map(bindings.map((b) => [b.playerId, b]));
  const upstreamBindingsByPlayer = new Map(
    upstreamBindings.map((u) => [u.playerId, u.upstreamAgentPlayerId])
  );

  const rakeRate = clampPercent(clubRakePercent) / 100;
  const displayMap = new Map();
  for (const b of bindings) {
    displayMap.set(b.playerId, 0);
  }

  const isAgent = (pid) => bindingByPlayer.has(pid);

  const allPlayerIds = new Set([
    ...winByPlayer.keys(),
    ...poolByPlayer.keys(),
  ]);

  for (const playerId of allPlayerIds) {
    const win = Number(winByPlayer.get(playerId)) || 0;
    const pool = Number(poolByPlayer.get(playerId)) || 0;
    if (win <= 0 && pool <= 0) continue;

    const playerSubmit = pool > 0 ? roundMoney(pool) : roundMoney(win * rakeRate);
    const a = pool > 0 ? pool : roundMoney(win * rakeRate);
    if (a <= 0) continue;

    if (isAgent(playerId)) {
      let ownSubmit = 0;
      const selfWinBase = resolveWinBase(win, pool, rakeRate);
      if (selfWinBase <= 0) continue;

      const path = buildAgentPathFromSelf(playerId, bindingByPlayer);
      for (const agentId of path) {
        const binding = bindingByPlayer.get(agentId);
        const parentId = binding?.upstreamAgentPlayerId;
        if (!parentId) continue;

        const add = roundMoney(
          selfWinBase * agentPercentageRate(binding?.agentPercentage, clubRakePercent)
        );
        if (add <= 0) continue;
        ownSubmit = roundMoney(ownSubmit + add);
        addDisplayAmount(displayMap, parentId, add);
      }
      addDisplayAmount(displayMap, playerId, ownSubmit);
      continue;
    }

    addDisplayAmount(displayMap, playerId, playerSubmit);

    const path = buildAgentPathFromPlayer(
      playerId,
      bindingByPlayer,
      upstreamBindingsByPlayer
    );
    if (path.length === 0) continue;

    let parentKeepSumRate = 0;
    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      const rate = agentPercentageRate(binding?.agentPercentage, clubRakePercent);
      parentKeepSumRate += rate;

      const parentId = binding?.upstreamAgentPlayerId;
      if (parentId) {
        const add = roundMoney(a * rate);
        addDisplayAmount(displayMap, parentId, add);
      }
    }

    const leafAgentId = path[0];
    const leafRate = Math.max(0, 1 - parentKeepSumRate);
    const leafAdd = roundMoney(a * leafRate);
    addDisplayAmount(displayMap, leafAgentId, leafAdd);
  }

  for (const playerId of allPlayerIds) {
    if (!displayMap.has(playerId)) {
      if (isAgent(playerId)) {
        displayMap.set(playerId, 0);
      } else {
        const win = Number(winByPlayer.get(playerId)) || 0;
        const pool = Number(poolByPlayer.get(playerId)) || 0;
        displayMap.set(
          playerId,
          pool > 0 ? roundMoney(pool) : (win > 0 ? roundMoney(win * rakeRate) : 0)
        );
      }
    }
  }

  return displayMap;
}

async function buildSelfDrawDisplayMap(
  prisma,
  club,
  range,
  bindings,
  upstreamBindings = []
) {
  const { winByPlayer, poolByPlayer, rakePercent } =
    await aggregateSelfDrawStatsByPlayerId(prisma, club, range);

  return computeDisplaySelfDrawRakeByPlayer(
    winByPlayer,
    poolByPlayer,
    bindings,
    upstreamBindings,
    rakePercent
  );
}

module.exports = {
  roundMoney,
  clampPercent,
  agentPercentageRate,
  buildAgentPathFromPlayer,
  buildAgentPathFromSelf,
  resolveWinBase,
  computeDisplaySelfDrawRakeByPlayer,
  buildSelfDrawDisplayMap,
};
