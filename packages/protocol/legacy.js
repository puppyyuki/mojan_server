const { ClientIntentSchema } = require('./messages');

function intentFromLegacyClient(eventName, payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (eventName === 'clientIntent') {
    const { tableId, playerId, ...rest } = payload;
    const intent = ClientIntentSchema.parse(rest);
    return { tableId, playerId, intent };
  }

  if (eventName === 'discardTile') {
    const { tableId, playerId, tile, clientSeq } = payload;
    const intent = ClientIntentSchema.parse({ type: 'DISCARD_INTENT', tile, clientSeq: clientSeq ?? 0 });
    return { tableId, playerId, intent };
  }

  if (eventName === 'executeClaim') {
    const { tableId, playerId, claimType, tiles, clientSeq } = payload;
    const claim = claimType === 'pong' ? 'PON'
      : claimType === 'chi' ? 'CHI'
        : claimType === 'kong' ? 'KAN'
          : claimType === 'hu' ? 'HU'
            : 'PASS';
    const intent = ClientIntentSchema.parse({ type: 'CLAIM_INTENT', claim, tiles: tiles ?? [], clientSeq: clientSeq ?? 0 });
    return { tableId, playerId, intent };
  }

  return null;
}

function toLegacyServerEmits(engineEvents) {
  const out = [];
  for (const e of engineEvents) {
    if (e && typeof e === 'object') {
      if (e.type) out.push({ room: 'socket', event: 'serverEvent', payload: e });
    }
    if (e.type === 'REJECTED') {
      out.push({ room: 'socket', event: 'rejected', payload: e });
    }
    if (e.type === 'DISCARDED') {
      out.push({ room: 'table', event: 'discarded', payload: e });
      out.push({ room: 'table', event: 'serverEvent', payload: e });
    }
    if (e.type === 'TURN_START') {
      out.push({ room: 'table', event: 'turnStart', payload: e });
      out.push({ room: 'table', event: 'serverEvent', payload: e });
    }
    if (e.type === 'TABLE_SNAPSHOT') {
      out.push({ room: 'socket', event: 'tableSnapshot', payload: e });
      out.push({ room: 'socket', event: 'serverEvent', payload: e });
    }
    if (e.type === 'HAND_SYNC') {
      out.push({ room: 'socket', event: 'handSync', payload: e });
      out.push({ room: 'socket', event: 'serverEvent', payload: e });
    }
    if (e.type === 'CLAIM_WINDOW') {
      out.push({ room: 'socket', event: 'claimWindow', payload: e });
      out.push({ room: 'socket', event: 'serverEvent', payload: e });
    }
    if (e.type === 'CLAIM_RESOLVED') {
      out.push({ room: 'table', event: 'claimResolved', payload: e });
      out.push({ room: 'table', event: 'serverEvent', payload: e });
    }
  }
  return out;
}

module.exports = {
  intentFromLegacyClient,
  toLegacyServerEmits
};

