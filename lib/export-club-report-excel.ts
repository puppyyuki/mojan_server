import { buildClubReportSheetLayout } from './club-report-excel-layout'

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

export async function exportClubReportExcel(data: ClubReportExportData): Promise<void> {
  const XLSX = await import('xlsx')
  const sortedRows = getSortedReportRows(data.rows)
  const { rows: sheetData, merges } = buildClubReportSheetLayout(sortedRows)
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
  if (merges.length > 0) {
    worksheet['!merges'] = merges
  }
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '俱樂部報表')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
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
