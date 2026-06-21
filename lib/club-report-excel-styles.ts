import type { Border, Fill, Font } from 'exceljs'
import { COL, EXCEL_HEADERS } from './club-report-excel-layout'

export const REPORT_COLORS = {
  headerBg: 'FF4A7C59',
  headerFont: 'FFFFFFFF',
  zebraOdd: 'FFF5F5F5',
  zebraEven: 'FFFFFFFF',
  totalBg: 'FFE2EFDA',
  border: 'FFD0D0D0',
  font: 'FF000000',
  negative: 'FFFF0000',
} as const

const THIN_BORDER: Partial<Border> = {
  style: 'thin',
  color: { argb: REPORT_COLORS.border },
}

export const CELL_BORDER = {
  top: THIN_BORDER,
  left: THIN_BORDER,
  bottom: THIN_BORDER,
  right: THIN_BORDER,
} as const

export const NUMERIC_COLUMNS = [
  COL.BALANCE,
  COL.ROOM_CARD,
  COL.MEMBER_SUMMARY,
  COL.AGENT_SETTLEMENT,
  COL.LINE_SUMMARY,
] as const

export const COLUMN_WIDTHS: number[] = EXCEL_HEADERS.map((_, index) => {
  switch (index) {
    case COL.ID:
      return 10
    case COL.NICKNAME:
      return 14
    case COL.TITLE:
      return 12
    case COL.BALANCE:
    case COL.MEMBER_SUMMARY:
    case COL.AGENT_SETTLEMENT:
    case COL.LINE_SUMMARY:
      return 13
    case COL.ROOM_CARD:
      return 11
    case COL.UPSTREAM:
      return 14
    default:
      return 12
  }
})

function solidFill(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

export function headerFont(): Partial<Font> {
  return {
    bold: true,
    color: { argb: REPORT_COLORS.headerFont },
    size: 11,
    name: 'Microsoft JhengHei',
  }
}

export function bodyFont(bold = false, negative = false): Partial<Font> {
  return {
    bold,
    color: { argb: negative ? REPORT_COLORS.negative : REPORT_COLORS.font },
    size: 11,
    name: 'Microsoft JhengHei',
  }
}

export function headerFill(): Fill {
  return solidFill(REPORT_COLORS.headerBg)
}

export function zebraFill(dataRowIndex: number): Fill {
  return solidFill(dataRowIndex % 2 === 0 ? REPORT_COLORS.zebraEven : REPORT_COLORS.zebraOdd)
}

export function totalFill(): Fill {
  return solidFill(REPORT_COLORS.totalBg)
}

export function isNumericColumn(columnIndex: number): boolean {
  return NUMERIC_COLUMNS.includes(columnIndex as (typeof NUMERIC_COLUMNS)[number])
}

export function isNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value < 0
}
