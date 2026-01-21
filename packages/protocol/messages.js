const { z } = require('zod');

const TileCode = z.string();

const JoinTableIntent = z.object({
  type: z.literal('JOIN_TABLE'),
  tableId: z.string(),
  token: z.string().optional(),
  clientVersion: z.string().optional()
});

const ReadyIntent = z.object({
  type: z.literal('READY')
});

const DiscardIntent = z.object({
  type: z.literal('DISCARD_INTENT'),
  tile: TileCode,
  clientSeq: z.number().int().nonnegative()
});

const ClaimType = z.enum(['CHI', 'PON', 'KAN', 'HU', 'PASS']);
const ClaimIntent = z.object({
  type: z.literal('CLAIM_INTENT'),
  claim: ClaimType,
  tiles: z.array(TileCode).default([]),
  clientSeq: z.number().int().nonnegative()
});

const DissolveRequest = z.object({
  type: z.literal('DISSOLVE_REQUEST'),
  reason: z.string().optional()
});

const Ping = z.object({
  type: z.literal('PING'),
  t: z.number().int().nonnegative()
});

const ClientIntentSchema = z.union([
  JoinTableIntent,
  ReadyIntent,
  DiscardIntent,
  ClaimIntent,
  DissolveRequest,
  Ping
]);

const WelcomeEvent = z.object({
  type: z.literal('WELCOME'),
  tableId: z.string(),
  seat: z.number().int().min(0).max(3),
  serverTime: z.number().int().nonnegative(),
  reconnectToken: z.string().optional()
});

const PublicState = z.object({
  phase: z.enum(['LOBBY', 'DEALING', 'PLAYING_TURN', 'CLAIMING', 'SCORING', 'ENDED']),
  dealerSeat: z.number().int().min(0).max(3).optional(),
  currentSeat: z.number().int().min(0).max(3).optional(),
  wallRemaining: z.number().int().nonnegative().optional(),
  discards: z.array(z.object({ seat: z.number().int().min(0).max(3), tile: TileCode })).default([]),
  melds: z.record(z.string(), z.array(z.array(TileCode))).default({}),
  handCounts: z.record(z.string(), z.number().int().nonnegative()).default({})
});

const PrivateState = z.object({
  myHand: z.array(TileCode).default([]),
  myFlowers: z.array(TileCode).default([])
});

const TableSnapshot = z.object({
  type: z.literal('TABLE_SNAPSHOT'),
  serverSeq: z.number().int().nonnegative(),
  publicState: PublicState,
  myPrivate: PrivateState
});

const TurnStart = z.object({
  type: z.literal('TURN_START'),
  serverSeq: z.number().int().nonnegative(),
  currentSeat: z.number().int().min(0).max(3),
  legalDiscards: z.array(TileCode).default([]),
  legalClaims: z.array(ClaimType).default([])
});

const Discarded = z.object({
  type: z.literal('DISCARDED'),
  serverSeq: z.number().int().nonnegative(),
  seat: z.number().int().min(0).max(3),
  tile: TileCode
});

const ClaimWindow = z.object({
  type: z.literal('CLAIM_WINDOW'),
  serverSeq: z.number().int().nonnegative(),
  optionsForMe: z.array(z.object({ claim: ClaimType, tiles: z.array(TileCode).default([]) })).default([]),
  deadlinePolicy: z.enum(['NONE', 'SERVER_IDLE_RECYCLE']).default('NONE')
});

const ClaimResolved = z.object({
  type: z.literal('CLAIM_RESOLVED'),
  serverSeq: z.number().int().nonnegative(),
  resolution: z.object({
    winnerSeat: z.number().int().min(0).max(3).optional(),
    claim: ClaimType,
    tiles: z.array(TileCode).default([])
  })
});

const HandSync = z.object({
  type: z.literal('HAND_SYNC'),
  serverSeq: z.number().int().nonnegative(),
  myHand: z.array(TileCode).default([]),
  myFlowers: z.array(TileCode).default([])
});

const ScoreSettled = z.object({
  type: z.literal('SCORE_SETTLED'),
  serverSeq: z.number().int().nonnegative(),
  breakdown: z.any()
});

const TableDissolved = z.object({
  type: z.literal('TABLE_DISSOLVED'),
  serverSeq: z.number().int().nonnegative(),
  reason: z.string()
});

const Rejected = z.object({
  type: z.literal('REJECTED'),
  serverSeq: z.number().int().nonnegative(),
  clientSeq: z.number().int().nonnegative().optional(),
  code: z.string(),
  message: z.string()
});

const Pong = z.object({
  type: z.literal('PONG'),
  t: z.number().int().nonnegative()
});

const ServerEventSchema = z.union([
  WelcomeEvent,
  TableSnapshot,
  TurnStart,
  Discarded,
  ClaimWindow,
  ClaimResolved,
  HandSync,
  ScoreSettled,
  TableDissolved,
  Rejected,
  Pong
]);

module.exports = {
  TileCode,
  ClaimType,
  ClientIntentSchema,
  ServerEventSchema
};

