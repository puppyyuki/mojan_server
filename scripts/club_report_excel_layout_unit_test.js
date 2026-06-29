const { register } = require('tsx/cjs/api')
register()

const {
  splitIntoLineBlocks,
  buildSheetLayout,
  directPlayerSpanEnd,
  findMidSpans,
  balance,
  anchorLineSummaryTotal,
  sumLineContribution,
  sumBalance,
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
  }),
  row({ id: '100002', payment: 20, battleScore: 20 }),
  row({ id: '100003', agentLevel: 'mid', title: '中代理', payment: 30, rakeAmount: 5 }),
  row({ id: '100004', payment: 40 }),
  row({ id: '200001', agentLevel: 'master', title: '大代理', payment: 50, rakeAmount: 8 }),
  row({ id: '200002', payment: 60 }),
  row({ id: '200003', agentLevel: 'mid', title: '中代理', payment: 70, rakeAmount: 9 }),
  row({ id: '200004', payment: 80 }),
  row({ id: '300001', agentLevel: 'master', title: '大代理', payment: 90, rakeAmount: 10 }),
]

const blocks = splitIntoLineBlocks(sortedRows)
assert(blocks.length === 3, 'should split into super, master, master blocks')
assert(blocks[0].type === 'super', 'first block should be super')
assert(blocks[1].type === 'master', 'second block should be master')

assert(balance(blocks[0].rows[0]) === 10, 'super balance should use battleScore without rake deduction')
assert(balance(blocks[1].rows[0]) === 50, 'master balance should use payment')

const layout = buildSheetLayout(blocks)
assert(layout.rows[0].length === 10, 'header should have 10 columns')

const superTotalRow = layout.rows[5]
assert(superTotalRow[0] === '總計', 'super block should end with total row')
assert(superTotalRow[3] === sumBalance(blocks[0].rows), 'super total should sum super segment vertically')

const firstMasterRow = layout.rows[6]
assert(firstMasterRow[0] === '200001', 'first master should appear after super total row')

const firstMasterTotalRow = layout.rows[10]
assert(firstMasterTotalRow[0] === '總計', 'first master block should end with total row')
assert(firstMasterTotalRow[3] === sumBalance(blocks[1].rows), 'first master total should sum its block')

const secondMasterRow = layout.rows[11]
assert(secondMasterRow[0] === '300001', 'second master should appear after first master total row')

const superLineSummaryRow = layout.rows[1]
assert(
  superLineSummaryRow[COL.LINE_SUMMARY] === anchorLineSummaryTotal(blocks[0].rows, 'super'),
  'super line summary should equal anchor self + settlement + direct players'
)
assert(
  superLineSummaryRow[COL.LINE_SUMMARY] !== sumLineContribution(blocks[0].rows),
  'super anchor line summary should not include mid subtree when mids exist'
)

const totalBeforeFirstMaster = layout.rows.findIndex((sheetRow, index) => index > 0 && sheetRow[0] === '總計')
assert(totalBeforeFirstMaster === 5, 'total row should appear after super segment and before first master')

const masterTotalBeforeSecond = layout.rows.findIndex(
  (sheetRow, index) => index > totalBeforeFirstMaster && sheetRow[0] === '總計'
)
assert(masterTotalBeforeSecond === 10, 'master total should appear after first master block and before second master')

const hasTotalAboveSuper = layout.rows[1]?.[0] === '總計'
assert(!hasTotalAboveSuper, 'super block should not have total row at top')

console.log('club_report_excel_layout_unit_test passed')
