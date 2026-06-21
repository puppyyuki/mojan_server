import type ExcelJS from 'exceljs'
import { buildClubReportSheetLayout, COL, EXCEL_HEADERS, type MergeRange } from './club-report-excel-layout'
import {
  CELL_BORDER,
  COLUMN_WIDTHS,
  bodyFont,
  headerFill,
  headerFont,
  isNegativeNumber,
  isNumericColumn,
  numberFormat,
  textDisplayWidth,
  totalFill,
} from './club-report-excel-styles'

export interface ClubReportExportRow {
  id: string
  nickname: string
  title: string
  agentLevel: string | null
  payment: number
  battleScore: number
  roomCardConsumed: number
  rakeAmount: number
  upstreamAgent?: string
  csvSortOrder?: number
}

export interface ClubReportExportData {
  rows: ClubReportExportRow[]
  filter: { startDate: string; endDate: string; clubId: string }
}

export function getSortedReportRows<T extends { csvSortOrder?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.csvSortOrder ?? 0) - (b.csvSortOrder ?? 0))
}

function toExcelMerge(range: MergeRange): string {
  const top = range.s.r + 1
  const left = range.s.c + 1
  const bottom = range.e.r + 1
  const right = range.e.c + 1
  if (top === bottom && left === right) {
    return `${columnLetter(left)}${top}`
  }
  return `${columnLetter(left)}${top}:${columnLetter(right)}${bottom}`
}

function columnLetter(columnNumber: number): string {
  let value = columnNumber
  let letters = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

function applyHeaderStyle(worksheet: ExcelJS.Worksheet): void {
  const headerRow = worksheet.getRow(1)
  headerRow.height = 24
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = headerFill()
    cell.font = headerFont()
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = CELL_BORDER
  })
}

function applyBodyCellStyle(
  cell: ExcelJS.Cell,
  columnIndex: number,
  isTotalRow: boolean
): void {
  const value = cell.value
  const negative = isNumericColumn(columnIndex) && isNegativeNumber(value)
  if (isTotalRow) {
    cell.fill = totalFill()
  }
  cell.font = bodyFont(isTotalRow, negative)
  cell.border = CELL_BORDER

  if (isNumericColumn(columnIndex)) {
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    if (typeof value === 'number' && Number.isFinite(value)) {
      cell.numFmt = numberFormat(value)
    }
    return
  }

  cell.alignment = {
    vertical: 'middle',
    horizontal: columnIndex === 1 ? 'left' : 'center',
    wrapText: true,
  }
}

function applyWorksheetStyles(worksheet: ExcelJS.Worksheet, sheetData: unknown[][]): void {
  applyHeaderStyle(worksheet)

  for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex += 1) {
    const rowValues = sheetData[rowIndex]
    const isTotalRow = Array.isArray(rowValues) && rowValues[0] === '總計'

    const excelRow = worksheet.getRow(rowIndex + 1)
    excelRow.height = isTotalRow ? 22 : 20
    excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      applyBodyCellStyle(cell, columnNumber - 1, isTotalRow)
    })
  }
}

function computeColumnWidth(sheetData: unknown[][], columnIndex: number): number {
  let maxWidth = textDisplayWidth(EXCEL_HEADERS[columnIndex] ?? '')
  for (let rowIndex = 1; rowIndex < sheetData.length; rowIndex += 1) {
    const rowValues = sheetData[rowIndex]
    if (!Array.isArray(rowValues)) continue
    const text = String(rowValues[columnIndex] ?? '')
    maxWidth = Math.max(maxWidth, textDisplayWidth(text))
  }
  return Math.min(Math.max(maxWidth + 2, 10), 60)
}

function applyColumnWidths(worksheet: ExcelJS.Worksheet, sheetData: unknown[][]): void {
  COLUMN_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width
  })
  worksheet.getColumn(COL.NICKNAME + 1).width = computeColumnWidth(sheetData, COL.NICKNAME)
  worksheet.getColumn(COL.UPSTREAM + 1).width = computeColumnWidth(sheetData, COL.UPSTREAM)
}

function applyMerges(worksheet: ExcelJS.Worksheet, merges: MergeRange[]): void {
  for (const merge of merges) {
    worksheet.mergeCells(toExcelMerge(merge))
  }
}

export async function exportClubReportExcel(data: ClubReportExportData): Promise<void> {
  const { default: ExcelJSImport } = await import('exceljs')
  const sortedRows = getSortedReportRows(data.rows)
  const { rows: sheetData, merges } = buildClubReportSheetLayout(sortedRows)

  const workbook = new ExcelJSImport.Workbook()
  workbook.creator = 'Mojan Admin'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('俱樂部報表', {
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
  })

  worksheet.addRows(sheetData)
  applyMerges(worksheet, merges)
  applyWorksheetStyles(worksheet, sheetData)
  applyColumnWidths(worksheet, sheetData)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `club-player-report-${data.filter.startDate}-${data.filter.endDate}-${data.filter.clubId}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}
