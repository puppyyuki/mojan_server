export const TAIPEI_TIMEZONE = 'Asia/Taipei'

function buildTaipeiIso(
  year: string,
  month: string,
  day: string,
  timePart: string
): string {
  return `${year}-${month}-${day}T${timePart}+08:00`
}

function parseYmd(raw: string): { year: string; month: string; day: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null
  return { year: m[1], month: m[2], day: m[3] }
}

export function parseTaipeiDateStart(raw: string): Date | null {
  const ymd = parseYmd(raw)
  if (!ymd) return null
  const d = new Date(buildTaipeiIso(ymd.year, ymd.month, ymd.day, '00:00:00.000'))
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseTaipeiDateEnd(raw: string): Date | null {
  const ymd = parseYmd(raw)
  if (!ymd) return null
  const d = new Date(buildTaipeiIso(ymd.year, ymd.month, ymd.day, '23:59:59.999'))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTaipeiDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-TW', {
    timeZone: TAIPEI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
