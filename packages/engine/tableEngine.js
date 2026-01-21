const { ServerEventSchema } = require('../protocol/messages');

function phaseFromLegacy(legacyPhase) {
  if (legacyPhase === 'waiting') return 'LOBBY';
  if (legacyPhase === 'dealing') return 'DEALING';
  if (legacyPhase === 'flower_replacement') return 'DEALING';
  if (legacyPhase === 'playing') return 'PLAYING_TURN';
  if (legacyPhase === 'claiming') return 'CLAIMING';
  if (legacyPhase === 'ended') return 'ENDED';
  return 'LOBBY';
}

function buildPublicState(table) {
  const handCounts = {};
  if (table?.players && table?.hiddenHands) {
    for (const p of table.players) {
      const raw = table.hiddenHands[p.id];
      const len = Array.isArray(raw) ? raw.length : 0;
      const isPlaying = table?.gamePhase === 'playing';
      const isCurrentSeat = typeof table?.turn === 'number' && table.turn === p.seat;
      const visibleCount = (isPlaying && isCurrentSeat && len > 0) ? (len - 1) : len;
      handCounts[p.id] = visibleCount;
    }
  }

  const melds = {};
  if (table?.players && table?.melds) {
    for (const p of table.players) {
      const seatKey = String(p.seat);
      const raw = table.melds[p.id];
      if (Array.isArray(raw)) {
        melds[seatKey] = raw
          .map((m) => {
            if (Array.isArray(m)) return m.filter((t) => typeof t === 'string');
            if (m && typeof m === 'object' && Array.isArray(m.tiles)) {
              return m.tiles.filter((t) => typeof t === 'string');
            }
            return [];
          })
          .filter((m) => m.length > 0);
      } else {
        melds[seatKey] = [];
      }
    }
  }

  const discards = [];
  if (table?.players && table?.discards) {
    for (const p of table.players) {
      const raw = table.discards[p.id];
      if (!Array.isArray(raw)) continue;
      for (const t of raw) {
        if (typeof t === 'string') discards.push({ seat: p.seat, tile: t });
      }
    }
  }

  return {
    phase: phaseFromLegacy(table?.gamePhase),
    dealerSeat: typeof table?.dealerIndex === 'number' ? table.dealerIndex : undefined,
    currentSeat: typeof table?.turn === 'number' ? table.turn : undefined,
    wallRemaining: Array.isArray(table?.deck) ? table.deck.length : 0,
    windStart: typeof table?.windStart === 'number' ? table.windStart : undefined,
    round: typeof table?.round === 'number' ? table.round : undefined,
    maxRounds: typeof table?.maxRounds === 'number' ? table.maxRounds : undefined,
    gameSettings: table?.gameSettings ?? undefined,
    dice: Array.isArray(table?.dice) ? table.dice : undefined,
    discards,
    melds,
    handCounts
  };
}

function buildPlayers(table) {
  if (!table?.players || !Array.isArray(table.players)) return [];
  return table.players.map((p) => ({
    id: p.id,
    name: p.name,
    userId: p.userId ?? null,
    avatarUrl: p.avatarUrl ?? null,
    seat: p.seat,
    isDealer: p.isDealer ?? false,
    score: p.score ?? 0,
    isReady: p.isReady ?? false,
    voiceSelection: typeof p.voiceSelection === 'number' ? p.voiceSelection : 0,
    voiceLanguageSelection: typeof p.voiceLanguageSelection === 'number' ? p.voiceLanguageSelection : 0
  }));
}

function buildPrivateState(table, playerId) {
  const hand = (table?.hiddenHands && Array.isArray(table.hiddenHands[playerId])) ? table.hiddenHands[playerId] : [];
  const flowers = (table?.flowers && Array.isArray(table.flowers[playerId])) ? table.flowers[playerId] : [];
  return { myHand: hand, myFlowers: flowers };
}

function legacyClaimFromProtocol(claim) {
  if (claim === 'CHI') return 'chi';
  if (claim === 'PON') return 'pong';
  if (claim === 'KAN') return 'kong';
  if (claim === 'HU') return 'hu';
  return 'pass';
}

class TableEngine {
  constructor(tableId, ctx) {
    this.tableId = tableId;
    this.ctx = ctx;
    this.serverSeq = 0;
    this._queue = Promise.resolve();
    this._lastByPlayerId = new Map();
  }

  enqueue(work) {
    this._queue = this._queue
      .then(() => Promise.resolve().then(work))
      .catch((err) => {
        console.error('[TableEngine] queue error', err);
      });
    return this._queue;
  }

  snapshotFor(playerId) {
    const deps = this.ctx?.deps;
    const table = deps?.getTable?.(this.tableId);
    if (!table) {
      return this.bump({ type: 'REJECTED', code: 'TABLE_NOT_FOUND', message: 'Table not found' });
    }
    return this.bump({
      type: 'TABLE_SNAPSHOT',
      players: buildPlayers(table),
      publicState: buildPublicState(table),
      myPrivate: buildPrivateState(table, playerId)
    });
  }

  applyIntent(playerId, intent) {
    const type = intent?.type;
    const clientSeq = intent?.clientSeq;
    if (typeof clientSeq === 'number') {
      const last = this._lastByPlayerId.get(playerId);
      if (last && clientSeq === last.clientSeq) return last.events;
      if (last && clientSeq < last.clientSeq) {
        return [this.bump({ type: 'REJECTED', clientSeq, code: 'DUPLICATE', message: 'Duplicate intent' })];
      }
    }

    const deps = this.ctx?.deps;
    const table = deps?.getTable?.(this.tableId);
    const seat = table?.players?.find?.((p) => p.id === playerId)?.seat;

    if (!table || typeof seat !== 'number') {
      const events = [this.bump({ type: 'REJECTED', clientSeq, code: 'NOT_IN_TABLE', message: 'Player not in table' })];
      if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
      return events;
    }

    if (type === 'DISCARD_INTENT') {
      const tile = intent.tile;
      const hand = table.hiddenHands?.[playerId] || [];
      if (table.gamePhase !== 'playing') {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'NOT_PLAYING_TURN', message: 'Not in playing turn' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }
      if (table.turn !== seat) {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'NOT_YOUR_TURN', message: 'Not your turn' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }
      if (table.turnHasDiscarded === true) {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'ALREADY_DISCARDED', message: 'Already discarded this turn' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }
      if (!Array.isArray(hand) || !hand.includes(tile)) {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'TILE_NOT_IN_HAND', message: 'Tile not in hand' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }

      deps?.legacyActions?.discardTile?.(this.tableId, playerId, tile);

      const after = deps?.getTable?.(this.tableId);
      const priv = buildPrivateState(after, playerId);
      const events = [
        this.bump({ type: 'DISCARDED', seat, tile }),
        this.bump({ type: 'HAND_SYNC', myHand: priv.myHand, myFlowers: priv.myFlowers }),
        this.bump({ type: 'TABLE_SNAPSHOT', players: buildPlayers(after), publicState: buildPublicState(after), myPrivate: priv })
      ];
      if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
      return events;
    }

    if (type === 'CLAIM_INTENT') {
      if (table.gamePhase !== 'claiming' || !table.claimingState) {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'NOT_CLAIMING', message: 'Not in claiming phase' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }
      if (table.claimingState?.resolved === true) {
        const events = [
          this.bump({ type: 'REJECTED', clientSeq, code: 'CLAIM_ALREADY_RESOLVED', message: 'Claim already resolved' }),
          this.snapshotFor(playerId)
        ];
        if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
        return events;
      }
      const legacyClaim = legacyClaimFromProtocol(intent.claim);
      if (legacyClaim === 'pass') {
        deps?.legacyActions?.passClaim?.(this.tableId, playerId);
      } else {
        deps?.legacyActions?.handleClaimRequest?.(this.tableId, playerId, legacyClaim, intent.tiles ?? []);
      }

      const after = deps?.getTable?.(this.tableId);
      const priv = buildPrivateState(after, playerId);
      const events = [
        this.bump({ type: 'HAND_SYNC', myHand: priv.myHand, myFlowers: priv.myFlowers }),
        this.bump({ type: 'TABLE_SNAPSHOT', players: buildPlayers(after), publicState: buildPublicState(after), myPrivate: priv })
      ];
      if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
      return events;
    }

    const events = [
      this.bump({ type: 'REJECTED', clientSeq, code: 'UNSUPPORTED_INTENT', message: `Unsupported intent ${type}` }),
      this.snapshotFor(playerId)
    ];
    if (typeof clientSeq === 'number') this._lastByPlayerId.set(playerId, { clientSeq, events });
    return events;
  }

  bump(e) {
    this.serverSeq += 1;
    const next = { ...e, serverSeq: this.serverSeq };
    ServerEventSchema.parse(next);
    return next;
  }
}

module.exports = { TableEngine };

