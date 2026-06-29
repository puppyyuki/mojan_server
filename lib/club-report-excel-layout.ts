import type { ClubReportExportRow } from './export-club-report-excel'

export const EXCEL_HEADERS = [
  'ID',
  '暱稱',
  '代理層級',
  '餘額',
  '房卡消耗',
  '房卡費用',
  '會員總結',
  '代理銷帳',
  '代理線總結',
  '上層代理',
] as const

export const COL = {
  ID: 0,
  NICKNAME: 1,
  TITLE: 2,
  BALANCE: 3,
  ROOM_CARD: 4,
  ROOM_CARD_FEE: 5,
  MEMBER_SUMMARY: 6,
  AGENT_SETTLEMENT: 7,
  LINE_SUMMARY: 8,
  UPSTREAM: 9,
} as const

export interface MergeRange {
  s: { r: number; c: number }
  e: { r: number; c: number }
}

export interface LineBlock {
  type: 'super' | 'master' | 'plain'
  rows: ClubReportExportRow[]
}

export interface SheetLayout {
  rows: unknown[][]
  merges: MergeRange[]
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roomCardFeeAbs(row: ClubReportExportRow): number {
  return Math.abs(row.roomCardFeeAmount)
}

/** 總代理餘額不扣區間自摸抽，其餘成員使用 payment（戰績 − 自摸抽）。 */
export function balance(row: ClubReportExportRow): number {
  if (row.agentLevel === 'super') {
    return row.battleScore
  }
  return row.payment
}

export function memberSummary(row: ClubReportExportRow): number {
  return roundMoney(balance(row) + row.roomCardFeeAmount)
}

export function agentSettlement(row: ClubReportExportRow): number {
  return row.agentLevel != null ? roundMoney(row.rakeAmount + roomCardFeeAbs(row)) : 0
}

export function lineContribution(row: ClubReportExportRow): number {
  return roundMoney(memberSummary(row) + agentSettlement(row))
}

export function sumLineContribution(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + lineContribution(row), 0))
}

export function sumBalance(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + balance(row), 0))
}

export function sumMemberSummary(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + memberSummary(row), 0))
}

export function sumRoomCardConsumed(rows: ClubReportExportRow[]): number {
  return rows.reduce((sum, row) => sum + row.roomCardConsumed, 0)
}

export function anchorLineSummaryTotal(
  blockRows: ClubReportExportRow[],
  anchorLevel: 'super' | 'master'
): number {
  const anchorIndex = blockRows.findIndex((row) => row.agentLevel === anchorLevel)
  if (anchorIndex < 0) return 0
  const anchor = blockRows[anchorIndex]
  const directEnd = directPlayerSpanEnd(blockRows, anchorIndex)
  const directPlayers = blockRows.slice(anchorIndex + 1, directEnd + 1)
  const directPlayerSummary = directPlayers.reduce((sum, row) => sum + memberSummary(row), 0)
  return roundMoney(lineContribution(anchor) + directPlayerSummary)
}

export function sumAgentSettlement(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + agentSettlement(row), 0))
}

export function directPlayerSpanEnd(rows: ClubReportExportRow[], anchorIndex: number): number {
  let end = anchorIndex
  while (end + 1 < rows.length && rows[end + 1].agentLevel == null) {
    end += 1
  }
  return end
}

export function findMidSpans(
  rows: ClubReportExportRow[]
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].agentLevel !== 'mid') continue
    spans.push({ start: i, end: directPlayerSpanEnd(rows, i) })
  }
  return spans
}

export function smallSubtreeSpanEnd(rows: ClubReportExportRow[], smallIndex: number): number {
  let end = smallIndex
  for (let i = smallIndex + 1; i < rows.length; i += 1) {
    const level = rows[i].agentLevel
    if (level === 'master' || level === 'mid' || level === 'small' || level === 'super') break
    end = i
  }
  return end
}

export function findSmallSpans(
  rows: ClubReportExportRow[]
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].agentLevel !== 'small') continue
    spans.push({ start: i, end: smallSubtreeSpanEnd(rows, i) })
  }
  return spans
}

export function splitIntoLineBlocks(sortedRows: ClubReportExportRow[]): LineBlock[] {
  const blocks: LineBlock[] = []
  let i = 0

  while (i < sortedRows.length) {
    const row = sortedRows[i]
    if (row.agentLevel === 'super') {
      const start = i
      i += 1
      while (i < sortedRows.length && sortedRows[i].agentLevel !== 'master') {
        i += 1
      }
      blocks.push({ type: 'super', rows: sortedRows.slice(start, i) })
      continue
    }
    if (row.agentLevel === 'master') {
      const start = i
      i += 1
      while (i < sortedRows.length && sortedRows[i].agentLevel !== 'master') {
        i += 1
      }
      blocks.push({ type: 'master', rows: sortedRows.slice(start, i) })
      continue
    }
    const start = i
    i += 1
    while (
      i < sortedRows.length &&
      sortedRows[i].agentLevel !== 'super' &&
      sortedRows[i].agentLevel !== 'master'
    ) {
      i += 1
    }
    blocks.push({ type: 'plain', rows: sortedRows.slice(start, i) })
  }

  return blocks
}

function rowToCells(row: ClubReportExportRow): unknown[] {
  const rowBalance = balance(row)
  return [
    row.id,
    row.nickname,
    row.title,
    rowBalance,
    row.roomCardConsumed,
    row.roomCardFeeAmount,
    memberSummary(row),
    row.agentLevel != null ? agentSettlement(row) : '',
    '',
    row.upstreamAgent ?? '',
  ]
}

function appendTotalRow(
  sheetRows: unknown[][],
  merges: MergeRange[],
  blockRows: ClubReportExportRow[]
): void {
  const totals = {
    balance: sumBalance(blockRows),
    roomCard: sumRoomCardConsumed(blockRows),
    roomCardFee: roundMoney(blockRows.reduce((sum, row) => sum + row.roomCardFeeAmount, 0)),
    memberSummary: sumMemberSummary(blockRows),
    agentSettlement: sumAgentSettlement(blockRows),
    lineContribution: sumLineContribution(blockRows),
  }
  sheetRows.push([
    '總計',
    '',
    '',
    totals.balance,
    totals.roomCard,
    totals.roomCardFee,
    totals.memberSummary,
    totals.agentSettlement,
    totals.lineContribution,
    '',
  ])
  merges.push({
    s: { r: sheetRows.length - 1, c: COL.ID },
    e: { r: sheetRows.length - 1, c: COL.TITLE },
  })
}

function pushVerticalMerge(
  merges: MergeRange[],
  sheetStartRow: number,
  sheetEndRow: number,
  column: number
): void {
  if (sheetEndRow <= sheetStartRow) return
  merges.push({
    s: { r: sheetStartRow, c: column },
    e: { r: sheetEndRow, c: column },
  })
}

function applyAnchorLineSummaryMerge(
  sheetRows: unknown[][],
  merges: MergeRange[],
  blockRows: ClubReportExportRow[],
  anchorLevel: 'super' | 'master',
  dataSheetRowByBlockIndex: Map<number, number>
): void {
  const anchorIndex = blockRows.findIndex((row) => row.agentLevel === anchorLevel)
  if (anchorIndex < 0) return

  const directEnd = directPlayerSpanEnd(blockRows, anchorIndex)
  const anchorTotal = anchorLineSummaryTotal(blockRows, anchorLevel)
  const sheetAnchorRow = dataSheetRowByBlockIndex.get(anchorIndex)
  const sheetDirectEndRow = dataSheetRowByBlockIndex.get(directEnd)
  if (sheetAnchorRow == null || sheetDirectEndRow == null) return

  const anchorRow = sheetRows[sheetAnchorRow]
  if (Array.isArray(anchorRow)) {
    anchorRow[COL.LINE_SUMMARY] = anchorTotal
  }
  pushVerticalMerge(merges, sheetAnchorRow, sheetDirectEndRow, COL.LINE_SUMMARY)
}

function applyMidLineSummaryMerges(
  sheetRows: unknown[][],
  merges: MergeRange[],
  blockRows: ClubReportExportRow[],
  dataSheetRowByBlockIndex: Map<number, number>
): void {
  for (const { start, end } of findMidSpans(blockRows)) {
    const spanTotal = sumLineContribution(blockRows.slice(start, end + 1))
    const sheetStartRow = dataSheetRowByBlockIndex.get(start)
    const sheetEndRow = dataSheetRowByBlockIndex.get(end)
    if (sheetStartRow == null || sheetEndRow == null) continue
    const startRow = sheetRows[sheetStartRow]
    if (Array.isArray(startRow)) {
      startRow[COL.LINE_SUMMARY] = spanTotal
    }
    pushVerticalMerge(merges, sheetStartRow, sheetEndRow, COL.LINE_SUMMARY)
  }
}

function applySmallLineSummaryMerges(
  sheetRows: unknown[][],
  merges: MergeRange[],
  blockRows: ClubReportExportRow[],
  dataSheetRowByBlockIndex: Map<number, number>
): void {
  for (const { start, end } of findSmallSpans(blockRows)) {
    const spanTotal = sumLineContribution(blockRows.slice(start, end + 1))
    const sheetStartRow = dataSheetRowByBlockIndex.get(start)
    const sheetEndRow = dataSheetRowByBlockIndex.get(end)
    if (sheetStartRow == null || sheetEndRow == null) continue
    const startRow = sheetRows[sheetStartRow]
    if (Array.isArray(startRow)) {
      startRow[COL.LINE_SUMMARY] = spanTotal
    }
    pushVerticalMerge(merges, sheetStartRow, sheetEndRow, COL.LINE_SUMMARY)
  }
}

function applyLineSummaryMerges(
  sheetRows: unknown[][],
  merges: MergeRange[],
  block: LineBlock,
  dataSheetRowByBlockIndex: Map<number, number>
): void {
  if (block.type === 'super') {
    applyAnchorLineSummaryMerge(sheetRows, merges, block.rows, 'super', dataSheetRowByBlockIndex)
  } else if (block.type === 'master') {
    applyAnchorLineSummaryMerge(sheetRows, merges, block.rows, 'master', dataSheetRowByBlockIndex)
    applyMidLineSummaryMerges(sheetRows, merges, block.rows, dataSheetRowByBlockIndex)
    applySmallLineSummaryMerges(sheetRows, merges, block.rows, dataSheetRowByBlockIndex)
  } else {
    applyMidLineSummaryMerges(sheetRows, merges, block.rows, dataSheetRowByBlockIndex)
    applySmallLineSummaryMerges(sheetRows, merges, block.rows, dataSheetRowByBlockIndex)
  }
}

function totalSpansForBlock(block: LineBlock): Array<{ end: number; rows: ClubReportExportRow[] }> {
  if (block.type === 'super') {
    return [{ end: block.rows.length - 1, rows: block.rows }]
  }

  const spans: Array<{ end: number; rows: ClubReportExportRow[] }> = []
  const masterIndex = block.rows.findIndex((row) => row.agentLevel === 'master')
  if (masterIndex >= 0) {
    const end = directPlayerSpanEnd(block.rows, masterIndex)
    spans.push({ end, rows: block.rows.slice(masterIndex, end + 1) })
  }
  for (const { start, end } of findMidSpans(block.rows)) {
    spans.push({ end, rows: block.rows.slice(start, end + 1) })
  }
  for (const { start, end } of findSmallSpans(block.rows)) {
    spans.push({ end, rows: block.rows.slice(start, end + 1) })
  }
  return spans
}

export function buildSheetLayout(blocks: LineBlock[]): SheetLayout {
  const sheetRows: unknown[][] = [[...EXCEL_HEADERS]]
  const merges: MergeRange[] = []

  for (const block of blocks) {
    const dataSheetRowByBlockIndex = new Map<number, number>()
    const spansByEnd = new Map<number, ClubReportExportRow[][]>()
    for (const span of totalSpansForBlock(block)) {
      const spans = spansByEnd.get(span.end) ?? []
      spans.push(span.rows)
      spansByEnd.set(span.end, spans)
    }

    for (let i = 0; i < block.rows.length; i += 1) {
      dataSheetRowByBlockIndex.set(i, sheetRows.length)
      sheetRows.push(rowToCells(block.rows[i]))
      for (const totalRows of spansByEnd.get(i) ?? []) {
        appendTotalRow(sheetRows, merges, totalRows)
      }
    }

    applyLineSummaryMerges(sheetRows, merges, block, dataSheetRowByBlockIndex)
  }

  return { rows: sheetRows, merges }
}

export function buildClubReportSheetLayout(sortedRows: ClubReportExportRow[]): SheetLayout {
  return buildSheetLayout(splitIntoLineBlocks(sortedRows))
}
