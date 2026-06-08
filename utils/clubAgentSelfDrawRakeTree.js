/**
 * 俱樂部成員列表「自摸抽」顯示值。
 *
 * - 一般玩家：自摸贏分加總 × (100% - 俱樂部自摸抽%)（玩家保留）
 * - 代理分配池 A = 自摸贏分加總 × 俱樂部自摸抽%，依代理設置 % 在樹上分配
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

  const retainRate = Math.max(0, 1 - clampPercent(clubRakePercent) / 100);
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
    if (isAgent(playerId)) continue;

    const playerRetain = roundMoney(win * retainRate);
    displayMap.set(playerId, roundMoney((displayMap.get(playerId) || 0) + playerRetain));

    const a = pool > 0 ? pool : roundMoney(win * (clampPercent(clubRakePercent) / 100));
    if (a <= 0) continue;

    const path = buildAgentPathFromPlayer(
      playerId,
      bindingByPlayer,
      upstreamBindingsByPlayer
    );
    if (path.length === 0) continue;

    let parentKeepSumRate = 0;
    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      const pct = clampPercent(binding?.agentPercentage);
      const rate = pct / 100;
      parentKeepSumRate += rate;

      const parentId = binding?.upstreamAgentPlayerId;
      if (parentId) {
        const add = roundMoney(a * rate);
        displayMap.set(parentId, roundMoney((displayMap.get(parentId) || 0) + add));
      }
    }

    const leafAgentId = path[0];
    const leafRate = Math.max(0, 1 - parentKeepSumRate);
    const leafAdd = roundMoney(a * leafRate);
    displayMap.set(
      leafAgentId,
      roundMoney((displayMap.get(leafAgentId) || 0) + leafAdd)
    );
  }

  for (const playerId of allPlayerIds) {
    if (!displayMap.has(playerId)) {
      if (isAgent(playerId)) {
        displayMap.set(playerId, 0);
      } else {
        const win = Number(winByPlayer.get(playerId)) || 0;
        displayMap.set(playerId, win > 0 ? roundMoney(win * retainRate) : 0);
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
  buildAgentPathFromPlayer,
  computeDisplaySelfDrawRakeByPlayer,
  buildSelfDrawDisplayMap,
};
