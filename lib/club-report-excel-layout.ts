import type { ClubReportExportRow } from './export-club-report-excel'

export const EXCEL_HEADERS = [
  'ID',
  '暱稱',
  '代理層級',
  '餘額',
  '房卡消耗',
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
  MEMBER_SUMMARY: 5,
  AGENT_SETTLEMENT: 6,
  LINE_SUMMARY: 7,
  UPSTREAM: 8,
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

/** 總代理餘額不扣區間自摸抽，其餘成員使用 payment（戰績 − 自摸抽）。 */
export function balance(row: ClubReportExportRow): number {
  if (row.agentLevel === 'super') {
    return row.battleScore
  }
  return row.payment
}

export function memberSummary(row: ClubReportExportRow): number {
  return balance(row)
}

export function agentSettlement(row: ClubReportExportRow): number {
  return row.agentLevel != null ? row.rakeAmount : 0
}

export function lineContribution(row: ClubReportExportRow): number {
  return memberSummary(row) + agentSettlement(row)
}

export function sumLineContribution(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + lineContribution(row), 0))
}

export function sumBalance(rows: ClubReportExportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + balance(row), 0))
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
  const directPlayerSummary = directPlayers.reduce((sum, row) => sum + balance(row), 0)
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
    let end = i
    for (let j = i + 1; j < rows.length; j += 1) {
      if (rows[j].agentLevel === 'mid') break
      end = j
    }
    spans.push({ start: i, end })
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
    rowBalance,
    row.agentLevel != null ? row.rakeAmount : '',
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
    memberSummary: sumBalance(blockRows),
    agentSettlement: sumAgentSettlement(blockRows),
    lineContribution: sumLineContribution(blockRows),
  }
  sheetRows.push([
    '總計',
    '',
    '',
    totals.balance,
    totals.roomCard,
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
  sheetRowStart: number,
  blockRows: ClubReportExportRow[],
  anchorLevel: 'super' | 'master'
): void {
  const anchorIndex = blockRows.findIndex((row) => row.agentLevel === anchorLevel)
  if (anchorIndex < 0) return

  const directEnd = directPlayerSpanEnd(blockRows, anchorIndex)
  const anchorTotal = anchorLineSummaryTotal(blockRows, anchorLevel)
  const sheetAnchorRow = sheetRowStart + anchorIndex
  const sheetDirectEndRow = sheetRowStart + directEnd

  const anchorRow = sheetRows[sheetAnchorRow]
  if (Array.isArray(anchorRow)) {
    anchorRow[COL.LINE_SUMMARY] = anchorTotal
  }
  pushVerticalMerge(merges, sheetAnchorRow, sheetDirectEndRow, COL.LINE_SUMMARY)
}

function applyMidLineSummaryMerges(
  sheetRows: unknown[][],
  merges: MergeRange[],
  sheetRowStart: number,
  blockRows: ClubReportExportRow[]
): void {
  for (const { start, end } of findMidSpans(blockRows)) {
    const spanTotal = sumLineContribution(blockRows.slice(start, end + 1))
    const sheetStartRow = sheetRowStart + start
    const sheetEndRow = sheetRowStart + end
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
  sheetRowStart: number,
  block: LineBlock
): void {
  if (block.type === 'super') {
    applyAnchorLineSummaryMerge(sheetRows, merges, sheetRowStart, block.rows, 'super')
  } else if (block.type === 'master') {
    applyAnchorLineSummaryMerge(sheetRows, merges, sheetRowStart, block.rows, 'master')
  } else {
    return
  }
  applyMidLineSummaryMerges(sheetRows, merges, sheetRowStart, block.rows)
}

export function buildSheetLayout(blocks: LineBlock[]): SheetLayout {
  const sheetRows: unknown[][] = [[...EXCEL_HEADERS]]
  const merges: MergeRange[] = []

  for (const block of blocks) {
    const sheetRowStart = sheetRows.length
    for (const row of block.rows) {
      sheetRows.push(rowToCells(row))
    }

    applyLineSummaryMerges(sheetRows, merges, sheetRowStart, block)

    if (block.type === 'super' || block.type === 'master') {
      appendTotalRow(sheetRows, merges, block.rows)
    }
  }

  return { rows: sheetRows, merges }
}

export function buildClubReportSheetLayout(sortedRows: ClubReportExportRow[]): SheetLayout {
  return buildSheetLayout(splitIntoLineBlocks(sortedRows))
}
