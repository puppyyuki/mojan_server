const { register } = require('tsx/cjs/api')
register()

const {
  splitIntoLineBlocks,
  buildSheetLayout,
  directPlayerSpanEnd,
  findMidSpans,
  findSmallSpans,
  balance,
  memberSummary,
  agentSettlement,
  anchorLineSummaryTotal,
  sumLineContribution,
  sumBalance,
  sumMemberSummary,
  COL,
} = require('../lib/club-report-excel-layout.ts')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function row(overrides) {
  const payment = overrides.payment ?? 0
  const battleScore = overrides.battleScore ?? payment
  return {
    id: '000001',
    nickname: '測試',
    title: '玩家',
    agentLevel: null,
    payment,
    battleScore,
    roomCardConsumed: 0,
    roomCardFeeAmount: 0,
    rakeAmount: 0,
    upstreamAgent: '',
    ...overrides,
  }
}

const sortedRows = [
  row({
    id: '100001',
    agentLevel: 'super',
    title: '總代理',
    payment: 8,
    battleScore: 10,
    rakeAmount: 2,
    roomCardFeeAmount: -1,
  }),
  row({ id: '100002', payment: 20, battleScore: 20, roomCardFeeAmount: -2 }),
  row({ id: '200001', agentLevel: 'master', title: '大代理', payment: 50, rakeAmount: 8, roomCardFeeAmount: -4 }),
  row({ id: '200002', payment: 60, roomCardFeeAmount: -3 }),
  row({ id: '200003', agentLevel: 'mid', title: '中代理', payment: 70, rakeAmount: 9, roomCardFeeAmount: -5 }),
  row({ id: '200004', payment: 80, roomCardFeeAmount: -6 }),
  row({ id: '200005', agentLevel: 'small', title: '小代理', payment: 90, rakeAmount: 10, roomCardFeeAmount: -7 }),
  row({ id: '200006', payment: 100, roomCardFeeAmount: -8 }),
  row({ id: '200007', agentLevel: 'agent', title: '代理', payment: 110, rakeAmount: 11, roomCardFeeAmount: -9 }),
  row({ id: '200008', payment: 120, roomCardFeeAmount: -10 }),
  row({ id: '200009', agentLevel: 'small', title: '小代理', payment: 130, rakeAmount: 12, roomCardFeeAmount: -11 }),
  row({ id: '300001', agentLevel: 'master', title: '大代理', payment: 90, rakeAmount: 10 }),
]

const blocks = splitIntoLineBlocks(sortedRows)
assert(blocks.length === 3, 'should split into super, master, master blocks')
assert(blocks[0].type === 'super', 'first block should be super')
assert(blocks[1].type === 'master', 'second block should be master')

assert(balance(blocks[0].rows[0]) === 10, 'super balance should use battleScore without rake deduction')
assert(balance(blocks[1].rows[0]) === 50, 'master balance should use payment')
assert(memberSummary(blocks[1].rows[0]) === 46, 'member summary should subtract absolute room card fee')
assert(agentSettlement(blocks[1].rows[0]) === 12, 'agent settlement should add absolute room card fee')
assert(findMidSpans(blocks[1].rows)[0].end === 3, 'mid line summary span should include direct players only')
assert(findSmallSpans(blocks[1].rows)[0].end === 7, 'small line summary span should include lower subtree')

const layout = buildSheetLayout(blocks)
assert(layout.rows[0].length === 10, 'header should have 10 columns')

const superTotalRow = layout.rows[3]
assert(superTotalRow[0] === '總計', 'super block should end with total row')
assert(superTotalRow[3] === sumBalance(blocks[0].rows), 'super total should sum super segment vertically')
assert(superTotalRow[6] === sumMemberSummary(blocks[0].rows), 'super total should sum member summary with room card fee')

const firstMasterRow = layout.rows[4]
assert(firstMasterRow[0] === '200001', 'first master should appear after super total row')
assert(firstMasterRow[COL.MEMBER_SUMMARY] === 46, 'master member summary cell should subtract room card fee')
assert(firstMasterRow[COL.AGENT_SETTLEMENT] === 12, 'master settlement cell should add room card fee abs')
assert(
  firstMasterRow[COL.LINE_SUMMARY] === sumLineContribution(blocks[1].rows.slice(0, 2)),
  'master line summary should include master and direct players only'
)

const midRow = layout.rows[6]
assert(
  midRow[COL.LINE_SUMMARY] === sumLineContribution(blocks[1].rows.slice(2, 4)),
  'mid line summary should include mid and direct players only'
)

const firstSmallRow = layout.rows[8]
assert(
  firstSmallRow[COL.LINE_SUMMARY] === sumLineContribution(blocks[1].rows.slice(4, 8)),
  'small line summary should include full lower subtree'
)

const firstMasterTotalRow = layout.rows[13]
assert(firstMasterTotalRow[0] === '總計', 'first master block should end with total row')
assert(firstMasterTotalRow[3] === sumBalance(blocks[1].rows), 'master total should sum full block')
assert(firstMasterTotalRow[6] === sumMemberSummary(blocks[1].rows), 'master total should sum full member summary')
assert(firstMasterTotalRow[8] === sumLineContribution(blocks[1].rows), 'master total should sum full line contribution')

const secondMasterRow = layout.rows[14]
assert(secondMasterRow[0] === '300001', 'second master should appear after first master total row')

const superLineSummaryRow = layout.rows[1]
assert(
  superLineSummaryRow[COL.LINE_SUMMARY] === anchorLineSummaryTotal(blocks[0].rows, 'super'),
  'super line summary should equal anchor self + settlement + direct players'
)
assert(
  superLineSummaryRow[COL.LINE_SUMMARY] === sumLineContribution(blocks[0].rows),
  'super anchor line summary should include its independent direct segment'
)

const totalBeforeFirstMaster = layout.rows.findIndex((sheetRow, index) => index > 0 && sheetRow[0] === '總計')
assert(totalBeforeFirstMaster === 3, 'total row should appear after super segment and before first master')

const masterTotalBeforeSecond = layout.rows.findIndex(
  (sheetRow, index) => index > totalBeforeFirstMaster && sheetRow[0] === '總計'
)
assert(masterTotalBeforeSecond === 13, 'master total should appear after full master block')

const hasTotalAboveSuper = layout.rows[1]?.[0] === '總計'
assert(!hasTotalAboveSuper, 'super block should not have total row at top')

console.log('club_report_excel_layout_unit_test passed')
