export interface ClubReportExportRow {
  id: string
  nickname: string
  title: string
  agentLevel: string | null
  payment: number
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
  const headers = ['ID', '暱稱', '代理層級', '餘額', '房卡消耗', '代理銷帳', '上層代理']
  const sheetData = [
    headers,
    ...sortedRows.map((r) => [
      r.id,
      r.nickname,
      r.title,
      r.payment,
      r.roomCardConsumed,
      r.agentLevel != null ? r.rakeAmount : '',
      r.upstreamAgent ?? '',
    ]),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
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
