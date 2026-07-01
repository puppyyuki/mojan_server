const {
  computeDownlineRoomCardFeeForAgent,
  computeViewerRoomCardFeeForRow,
} = require('../utils/clubBranchRoomCardFee')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const bindings = [
  {
    playerId: 'super',
    upstreamAgentPlayerId: null,
    agentLevel: 'super',
    agentRoomCardFee: 0,
    branchAgentRoomCardFee: 0,
  },
  {
    playerId: 'master',
    upstreamAgentPlayerId: 'super',
    agentLevel: 'master',
    agentRoomCardFee: 2,
    branchAgentRoomCardFee: 3,
  },
  {
    playerId: 'mid',
    upstreamAgentPlayerId: 'master',
    agentLevel: 'mid',
    agentRoomCardFee: 1,
    branchAgentRoomCardFee: 2,
  },
]

const upstreamBindings = [
  { playerId: 'player', upstreamAgentPlayerId: 'master' },
  { playerId: 'player2', upstreamAgentPlayerId: 'mid' },
]

const roomCardConsumedByPlayer = new Map([
  ['super', 10],
  ['master', 5],
  ['mid', 7],
  ['player', 4],
  ['player2', 3],
])

const baseArgs = {
  bindings,
  upstreamBindings,
  roomCardConsumedByPlayer,
  clubRoomCardFee: 6,
  branchFees: [{ masterAgentPlayerId: 'master', branchRoomCardFee: 8 }],
}

assert(
  computeViewerRoomCardFeeForRow({
    ...baseArgs,
    targetPlayerId: 'master',
    branchRoomCardEnabled: false,
  }) === -30,
  'normal agent row should use own consumed cards times club room card fee'
)

assert(
  computeViewerRoomCardFeeForRow({
    ...baseArgs,
    targetPlayerId: 'master',
    branchRoomCardEnabled: true,
  }) === -40,
  'branch agent row should use own consumed cards times effective branch room card fee'
)

assert(
  computeViewerRoomCardFeeForRow({
    ...baseArgs,
    targetPlayerId: 'super',
    branchRoomCardEnabled: false,
  }) === -60,
  'normal super row should use club room card fee like players'
)

assert(
  computeViewerRoomCardFeeForRow({
    ...baseArgs,
    targetPlayerId: 'player',
    branchRoomCardEnabled: true,
  }) === -32,
  'player row should still use effective branch room card fee'
)

assert(
  computeDownlineRoomCardFeeForAgent({
    ...baseArgs,
    targetPlayerId: 'master',
    branchRoomCardEnabled: false,
  }) === 10,
  'normal downline room card fee should use direct child agent fee only'
)

assert(
  computeDownlineRoomCardFeeForAgent({
    ...baseArgs,
    targetPlayerId: 'master',
    branchRoomCardEnabled: true,
  }) === 20,
  'branch downline room card fee should use direct child agent fee only'
)

assert(
  computeDownlineRoomCardFeeForAgent({
    ...baseArgs,
    targetPlayerId: 'super',
    branchRoomCardEnabled: true,
  }) === 57,
  'upstream agent should receive the direct child agent full subtree at that child fee'
)

assert(
  computeDownlineRoomCardFeeForAgent({
    ...baseArgs,
    targetPlayerId: 'mid',
    branchRoomCardEnabled: true,
  }) === 0,
  'agent direct players should not create room card settlement for that same agent'
)

console.log('club_branch_room_card_fee_unit_test passed')
