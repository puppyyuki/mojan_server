const { intentFromLegacyClient } = require('../../packages/protocol/legacy');
const { toLegacyServerEmits } = require('../../packages/protocol/legacy');

function claimTypeToProtocol(legacyClaimType) {
  if (legacyClaimType === 'chi') return 'CHI';
  if (legacyClaimType === 'pong') return 'PON';
  if (legacyClaimType === 'kong') return 'KAN';
  if (legacyClaimType === 'hu') return 'HU';
  return 'PASS';
}

function createLegacySocketHandler({ io, registry, deps, socket }) {
  function handle(eventName, payload) {
    const parsed = intentFromLegacyClient(eventName, payload);
    if (!parsed) return;

    const { tableId, playerId, intent } = parsed;
    const engine = registry.getOrCreate(tableId, { deps });
    engine.enqueue(() => {
      const emitted = engine.applyIntent(playerId, intent);
      for (const legacyEmit of toLegacyServerEmits(emitted)) {
        if (legacyEmit.room === 'table') io.to(tableId).emit(legacyEmit.event, legacyEmit.payload);
        if (legacyEmit.room === 'socket') socket.emit(legacyEmit.event, legacyEmit.payload);
        if (legacyEmit.room === 'player' && legacyEmit.toPlayerId) {
          const sids = deps?.socketIdsByPlayerId?.(legacyEmit.toPlayerId);
          if (sids) for (const sid of sids) io.to(sid).emit(legacyEmit.event, legacyEmit.payload);
        }
      }

      const after = deps?.getTable?.(tableId);
      const cs = after?.claimingState;
      if (cs?.playerDecisions && Array.isArray(cs?.options) && typeof cs?.currentPriority === 'number') {
        const tierOptions = cs.options.filter((o) => o?.priority === cs.currentPriority);
        for (const pid of Object.keys(cs.playerDecisions)) {
          const myOptions = tierOptions.filter((o) => o?.playerId === pid);
          if (myOptions.length === 0) continue;

          const optionsForMe = myOptions.map((o) => ({
            claim: claimTypeToProtocol(o.claimType),
            tiles: Array.isArray(o.tiles) ? o.tiles : []
          }));
          const ev = engine.bump({
            type: 'CLAIM_WINDOW',
            optionsForMe,
            deadlinePolicy: 'SERVER_IDLE_RECYCLE',
            deadlineAtMs: typeof cs?.deadlineAtMs === 'number' ? cs.deadlineAtMs : undefined
          });
          const sids = deps?.socketIdsByPlayerId?.(pid);
          if (sids) {
            for (const sid of sids) {
              io.to(sid).emit('claimWindow', ev);
              io.to(sid).emit('serverEvent', ev);
            }
          }
        }
      }
    });
  }

  return { handle };
}

function createLegacySocketAdapter({ io, registry, deps }) {
  function attach() {
    io.on('connection', (socket) => {
      const h = createLegacySocketHandler({ io, registry, deps, socket });
      socket.onAny(h.handle);
    });
  }

  return { attach };
}

module.exports = { createLegacySocketAdapter, createLegacySocketHandler };

