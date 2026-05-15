'use client'

import { useEffect, useMemo, useState } from 'react'

const VALID_SCORING_UNITS = [3, 5, 6, 10, 20, 30, 50, 60, 100, 200, 300, 500, 600, 1000]
const VALID_BASE_POINTS = [3, 5, 6, 10, 30, 50, 60, 100, 200, 300, 500, 600, 1000]
const ROUND_VALUES = [1, 2, 4] as const
const POINT_CAPS = ['UP_TO_4_POINTS', 'UP_TO_8_POINTS', 'NO_LIMIT'] as const

type Props = {
  clubGameSettings: Record<string, unknown> | null
  onChange: (settings: Record<string, unknown>) => void
}

function readBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase()
    return n === 'true' || n === '1' || n === 'yes'
  }
  return false
}

function snapLegacyScoringUnit(value: number): number {
  if (value === 21) return 20
  if (value === 22) return 30
  return value
}

function nearestValid(value: number, allowed: number[]): number {
  if (allowed.includes(value)) return value
  let best = allowed[0]
  let bestDist = Math.abs(value - best)
  for (const v of allowed) {
    const d = Math.abs(value - v)
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  return best
}

function filterInRange(allowed: number[], min: number, max: number): number[] {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const list = allowed.filter((v) => v >= lo && v <= hi)
  return list.length > 0 ? list : allowed
}

/** 與 App RoomCreateViewModel：缺上下限時用離散選項首尾 */
function getEffectiveBaseBounds(gs: Record<string, unknown> | null) {
  if (!gs) {
    return {
      lo: VALID_BASE_POINTS[0],
      hi: VALID_BASE_POINTS[VALID_BASE_POINTS.length - 1],
    }
  }
  const rawMin = Number(gs.minimum_base_point)
  const rawMax = Number(gs.maximum_base_point)
  let lo = Number.isFinite(rawMin) ? rawMin : VALID_BASE_POINTS[0]
  let hi = Number.isFinite(rawMax) ? rawMax : VALID_BASE_POINTS[VALID_BASE_POINTS.length - 1]
  if (lo > hi) [lo, hi] = [hi, lo]
  return { lo, hi }
}

function getEffectiveScoringBounds(gs: Record<string, unknown> | null) {
  if (!gs) {
    return {
      lo: VALID_SCORING_UNITS[0],
      hi: VALID_SCORING_UNITS[VALID_SCORING_UNITS.length - 1],
    }
  }
  const rawMin = Number(gs.minimum_scoring_unit)
  const rawMax = Number(gs.maximum_scoring_unit)
  let lo = Number.isFinite(rawMin) ? snapLegacyScoringUnit(Math.floor(rawMin)) : VALID_SCORING_UNITS[0]
  let hi = Number.isFinite(rawMax)
    ? snapLegacyScoringUnit(Math.floor(rawMax))
    : VALID_SCORING_UNITS[VALID_SCORING_UNITS.length - 1]
  if (lo > hi) [lo, hi] = [hi, lo]
  return { lo, hi }
}

function isForcedMode(gs: Record<string, unknown> | null): boolean {
  return String(gs?.global_settings || '').toUpperCase() === 'FORCED'
}

function getDeductionPolicy(gs: Record<string, unknown> | null) {
  const ded = gs?.deduction
  if (!ded || typeof ded !== 'object' || Array.isArray(ded)) {
    return { allowAA: true, allowHost: true, clubOnly: false }
  }
  const d = ded as Record<string, unknown>
  const allowAA = d.aa_deduction === true
  const allowHost = d.host_deduction === true
  return { allowAA, allowHost, clubOnly: !allowAA && !allowHost }
}

function initFromClub(gs: Record<string, unknown> | null) {
  const isForced = isForcedMode(gs)
  let gameType: 'NORTHERN' | 'SOUTHERN' = 'NORTHERN'
  if (gs?.game_type === 'SOUTHERN') gameType = 'SOUTHERN'
  else if (gs?.game_type === 'NORTHERN') gameType = 'NORTHERN'

  const { lo: minBase, hi: maxBase } = getEffectiveBaseBounds(gs)
  const { lo: minUnit, hi: maxUnit } = getEffectiveScoringBounds(gs)

  let basePoint = VALID_BASE_POINTS[0]
  let scoringUnit = VALID_SCORING_UNITS[0]
  if (isForced) {
    if (gs?.base_points != null) basePoint = Number(gs.base_points) || basePoint
    if (gs?.scoring_unit != null) scoringUnit = Number(gs.scoring_unit) || scoringUnit
  } else {
    basePoint = Math.max(minBase, Math.min(maxBase, basePoint))
    scoringUnit = Math.max(minUnit, Math.min(maxUnit, scoringUnit))
    basePoint = nearestValid(basePoint, filterInRange(VALID_BASE_POINTS, minBase, maxBase))
    scoringUnit = nearestValid(scoringUnit, filterInRange(VALID_SCORING_UNITS, minUnit, maxUnit))
  }
  if (isForced) {
    basePoint = nearestValid(basePoint, VALID_BASE_POINTS)
    scoringUnit = nearestValid(scoringUnit, VALID_SCORING_UNITS)
  }

  let rounds = 1
  if (isForced && gs?.rounds != null) rounds = Number(gs.rounds) || 1
  else if (Array.isArray(gs?.rounds) && gs.rounds.length) rounds = Number(gs.rounds[0]) || 1
  const roundIndex = ROUND_VALUES.indexOf(rounds as 1 | 2 | 4)
  const selectedRoundIndex = roundIndex >= 0 ? roundIndex : 0

  let pointCap = 'UP_TO_8_POINTS'
  if (isForced && gs?.point_cap) pointCap = String(gs.point_cap)
  else if (Array.isArray(gs?.point_cap) && gs.point_cap.length) pointCap = String(gs.point_cap[0])
  const pointCapIndex = POINT_CAPS.indexOf(pointCap as (typeof POINT_CAPS)[number])
  const selectedPointCapIndex = pointCapIndex >= 0 ? pointCapIndex : 1

  const { allowAA, allowHost, clubOnly } = getDeductionPolicy(gs)
  let deductionIndex = 0
  if (clubOnly) {
    deductionIndex = 1
  } else if (isForced) {
    if (allowHost && !allowAA) deductionIndex = 1
  } else if (!allowAA && allowHost) {
    deductionIndex = 1
  }

  const sr = (gs?.special_rules as Record<string, unknown>) || {}
  const selectedSpecial = new Set<number>()
  if (gameType === 'NORTHERN') {
    if (sr.li_gu === true) selectedSpecial.add(0)
    if (sr.eye_tile_feature === true) selectedSpecial.add(1)
    if (sr.forced_win === true) selectedSpecial.add(2)
  } else {
    if (sr.no_points_dealer === true) selectedSpecial.add(0)
    if (sr.eye_tile_feature === true) selectedSpecial.add(1)
    if (sr.forced_win === true) selectedSpecial.add(2)
  }

  if (!isForced && gs) {
    if (sr.eye_tile_feature === false) selectedSpecial.delete(1)
    if (sr.forced_win === false) selectedSpecial.add(2)
  }

  return {
    isForced,
    isGameTypeRestricted: Boolean(gs?.game_type),
    gameType,
    basePoint,
    scoringUnit,
    selectedRoundIndex,
    selectedPointCapIndex,
    deductionIndex,
    selectedSpecial,
    isManualStart: readBool(gs?.manual_start),
    isIPCheck: readBool(gs?.ip_check),
    isGPSLock: readBool(gs?.gps_lock) || readBool(gs?.location_check),
    deductionClubOnly: clubOnly,
  }
}

export default function RoomCreateSettingsForm({ clubGameSettings, onChange }: Props) {
  const init = useMemo(() => initFromClub(clubGameSettings), [clubGameSettings])
  const [gameType, setGameType] = useState<'NORTHERN' | 'SOUTHERN'>(init.gameType)
  const [basePoint, setBasePoint] = useState(init.basePoint)
  const [scoringUnit, setScoringUnit] = useState(init.scoringUnit)
  const [roundIndex, setRoundIndex] = useState(init.selectedRoundIndex)
  const [pointCapIndex, setPointCapIndex] = useState(init.selectedPointCapIndex)
  const [deductionIndex, setDeductionIndex] = useState(init.deductionIndex)
  const [specialRules, setSpecialRules] = useState<Set<number>>(init.selectedSpecial)
  const [manualStart, setManualStart] = useState(init.isManualStart)
  const [ipCheck, setIpCheck] = useState(init.isIPCheck)
  const [gpsLock, setGpsLock] = useState(init.isGPSLock)

  const isForced = init.isForced
  const gs = clubGameSettings
  const deductionPolicy = getDeductionPolicy(gs)

  const baseBounds = useMemo(() => getEffectiveBaseBounds(gs), [gs])
  const scoringBounds = useMemo(() => getEffectiveScoringBounds(gs), [gs])

  useEffect(() => {
    const next = initFromClub(clubGameSettings)
    setGameType(next.gameType)
    setBasePoint(next.basePoint)
    setScoringUnit(next.scoringUnit)
    setRoundIndex(next.selectedRoundIndex)
    setPointCapIndex(next.selectedPointCapIndex)
    setDeductionIndex(next.deductionIndex)
    setSpecialRules(new Set(next.selectedSpecial))
    setManualStart(next.isManualStart)
    setIpCheck(next.isIPCheck)
    setGpsLock(next.isGPSLock)
  }, [clubGameSettings])

  const basePointOptions = useMemo(
    () => filterInRange(VALID_BASE_POINTS, baseBounds.lo, baseBounds.hi),
    [baseBounds.lo, baseBounds.hi]
  )
  const scoringUnitOptions = useMemo(
    () => filterInRange(VALID_SCORING_UNITS, scoringBounds.lo, scoringBounds.hi),
    [scoringBounds.lo, scoringBounds.hi]
  )

  useEffect(() => {
    if (isForced) return
    if (basePointOptions.length && !basePointOptions.includes(basePoint)) {
      setBasePoint(basePointOptions[0])
    }
  }, [isForced, basePoint, basePointOptions])

  useEffect(() => {
    if (isForced) return
    if (scoringUnitOptions.length && !scoringUnitOptions.includes(scoringUnit)) {
      setScoringUnit(scoringUnitOptions[0])
    }
  }, [isForced, scoringUnit, scoringUnitOptions])

  const buildSettings = (): Record<string, unknown> => {
    const isNorthern = gameType === 'NORTHERN'
    const special_rules = isNorthern
      ? {
          li_gu: specialRules.has(0),
          eye_tile_feature: specialRules.has(1),
          forced_win: specialRules.has(2),
          no_points_dealer: false,
        }
      : {
          li_gu: false,
          eye_tile_feature: specialRules.has(1),
          forced_win: specialRules.has(2),
          no_points_dealer: specialRules.has(0),
        }

    let deduction = 'AA_DEDUCTION'
    if (deductionPolicy.clubOnly) {
      deduction = 'CLUB_DEDUCTION'
    } else if (deductionIndex === 1) {
      deduction = 'HOST_DEDUCTION'
    }

    return {
      base_points: basePoint,
      scoring_unit: scoringUnit,
      rounds: ROUND_VALUES[roundIndex] ?? 1,
      game_type: gameType,
      special_rules,
      point_cap: POINT_CAPS[pointCapIndex] ?? 'UP_TO_8_POINTS',
      deduction,
      manual_start: manualStart,
      ip_check: ipCheck,
      gps_lock: gpsLock,
    }
  }

  useEffect(() => {
    onChange(buildSettings())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameType,
    basePoint,
    scoringUnit,
    roundIndex,
    pointCapIndex,
    deductionIndex,
    specialRules,
    manualStart,
    ipCheck,
    gpsLock,
  ])

  /** 與 App：強制模式可改；自由模式依俱樂部是否開放（未開放則鎖定） */
  const isRoomOptionDisabled = (key: 'manual_start' | 'ip_check' | 'gps_lock'): boolean => {
    if (!gs) return false
    if (isForced) return false
    if (key === 'manual_start') return gs.manual_start === false
    if (key === 'ip_check') return gs.ip_check === false
    return gs.gps_lock === false || gs.location_check === false
  }

  const isFieldDisabled = (fieldName: string): boolean => {
    if (!gs) return false
    if (isForced) return true
    if (fieldName === 'base_points' || fieldName === 'scoring_unit') return false
    if (['manual_start', 'ip_check', 'gps_lock', 'location_check'].includes(fieldName)) return true
    const value = gs[fieldName]
    if (typeof value === 'boolean') return !value
    return false
  }

  const isFieldHidden = (fieldName: string): boolean => {
    if (!gs || isForced) return false
    return gs[fieldName] == null
  }

  const isRoundDisabled = (r: number) => {
    if (!gs) return false
    if (isForced) {
      const rounds = gs.rounds
      if (rounds != null && !Array.isArray(rounds)) return Number(rounds) !== r
      if (Array.isArray(rounds) && rounds.length) return !rounds.includes(r)
      return true
    }
    const rounds = gs.rounds
    if (Array.isArray(rounds)) return !rounds.includes(r)
    return false
  }

  const isPointCapDisabled = (idx: number) => {
    const val = POINT_CAPS[idx]
    if (!gs) return false
    if (isForced) {
      const caps = gs.point_cap
      if (caps != null && !Array.isArray(caps)) return String(caps) !== val
      if (Array.isArray(caps) && caps.length) return !caps.includes(val)
      return true
    }
    const caps = gs.point_cap
    if (Array.isArray(caps)) return !caps.includes(val)
    return false
  }

  const isDeductionOptionDisabled = (idx: number) => {
    if (deductionPolicy.clubOnly) return true
    if (idx === 0) return !deductionPolicy.allowAA
    if (idx === 1) return !deductionPolicy.allowHost
    return true
  }

  const isSpecialRuleHidden = (ruleName: string): boolean => {
    if (!gs || isForced) return false
    const sr = gs.special_rules
    if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
      return (sr as Record<string, unknown>)[ruleName] == null
    }
    return false
  }

  const isSpecialRuleDisabled = (ruleName: string): boolean => {
    if (!gs) return false
    if (isForced) return true
    const sr = gs.special_rules
    if (sr && typeof sr === 'object' && !Array.isArray(sr)) {
      const map = sr as Record<string, unknown>
      if (ruleName === 'eye_tile_feature') return map.eye_tile_feature === false
      if (ruleName === 'forced_win') return map.forced_win === false
      const value = map[ruleName]
      if (typeof value === 'boolean') return !value
    }
    return false
  }

  const toggleSpecial = (idx: number) => {
    if (isForced) return
    setSpecialRules((prev) => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx)
      else n.add(idx)
      return n
    })
  }

  const sectionClass =
    'border border-gray-200 rounded-lg p-4 space-y-3 bg-white text-gray-900'
  const labelClass = 'text-sm font-medium text-gray-800'
  const subLabelClass = 'text-xs text-gray-600'
  const selectClass =
    'mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900 bg-white'
  const checkLabelClass = 'flex items-center gap-2 text-sm text-gray-900'
  const chip = (active: boolean, disabled: boolean) =>
    `px-3 py-1.5 rounded text-sm border ${
      disabled
        ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500 border-gray-200'
        : active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
    }`

  const northernRules = [
    { idx: 0, key: 'li_gu', label: '哩咕哩咕' },
    { idx: 1, key: 'eye_tile_feature', label: '眼牌功能' },
    { idx: 2, key: 'forced_win', label: '強制胡牌' },
  ] as const

  const southernRules = [
    { idx: 0, key: 'no_points_dealer', label: '莊家無台' },
    { idx: 1, key: 'eye_tile_feature', label: '眼牌功能' },
    { idx: 2, key: 'forced_win', label: '強制胡牌' },
  ] as const

  const ruleItems = gameType === 'NORTHERN' ? northernRules : southernRules

  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 text-gray-900">
      <div className={sectionClass}>
        <p className={labelClass}>玩法</p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={init.isGameTypeRestricted && gameType !== 'NORTHERN'}
            className={chip(gameType === 'NORTHERN', init.isGameTypeRestricted && gameType !== 'NORTHERN')}
            onClick={() => setGameType('NORTHERN')}
          >
            北部麻將
          </button>
          <button
            type="button"
            disabled={init.isGameTypeRestricted && gameType !== 'SOUTHERN'}
            className={chip(gameType === 'SOUTHERN', init.isGameTypeRestricted && gameType !== 'SOUTHERN')}
            onClick={() => setGameType('SOUTHERN')}
          >
            南部麻將
          </button>
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>底台設定</p>
        {!isForced && gs && (
          <p className="text-xs text-gray-600">
            俱樂部允許範圍：底 {baseBounds.lo}～{baseBounds.hi}（分）、台 {scoringBounds.lo}～
            {scoringBounds.hi}（與 App 開房相同之離散選項）
          </p>
        )}
        {isForced ? (
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-800">
            <div>
              <span className={subLabelClass}>底（分）</span>
              <p className="mt-1 font-medium tabular-nums">{basePoint}</p>
            </div>
            <div>
              <span className={subLabelClass}>台</span>
              <p className="mt-1 font-medium tabular-nums">{scoringUnit}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={subLabelClass}>底（分）</label>
              <select
                disabled={isFieldDisabled('base_points')}
                value={basePoint}
                onChange={(e) => setBasePoint(Number(e.target.value))}
                className={selectClass}
              >
                {basePointOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={subLabelClass}>台</label>
              <select
                disabled={isFieldDisabled('scoring_unit')}
                value={scoringUnit}
                onChange={(e) => setScoringUnit(Number(e.target.value))}
                className={selectClass}
              >
                {scoringUnitOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {!isFieldHidden('rounds') && (
        <div className={sectionClass}>
          <p className={labelClass}>圈數</p>
          <div className="flex gap-2 flex-wrap">
            {ROUND_VALUES.map((r, idx) => (
              <button
                key={r}
                type="button"
                disabled={isRoundDisabled(r) || isFieldDisabled('rounds')}
                className={chip(roundIndex === idx, isRoundDisabled(r) || isFieldDisabled('rounds'))}
                onClick={() => setRoundIndex(idx)}
              >
                {r}圈
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={sectionClass}>
        <p className={labelClass}>特殊規則</p>
        <div className="flex flex-col gap-2">
          {ruleItems.map(({ idx, key, label }) => {
            if (isSpecialRuleHidden(key)) return null
            return (
              <label key={key} className={checkLabelClass}>
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600"
                  checked={specialRules.has(idx)}
                  disabled={isSpecialRuleDisabled(key)}
                  onChange={() => toggleSpecial(idx)}
                />
                {label}
              </label>
            )
          })}
        </div>
      </div>

      {!isFieldHidden('point_cap') && (
        <div className={sectionClass}>
          <p className={labelClass}>封頂</p>
          <div className="flex gap-2 flex-wrap">
            {['4台滿', '8台滿', '無限台'].map((lab, idx) => (
              <button
                key={lab}
                type="button"
                disabled={isPointCapDisabled(idx) || isFieldDisabled('point_cap')}
                className={chip(
                  pointCapIndex === idx,
                  isPointCapDisabled(idx) || isFieldDisabled('point_cap')
                )}
                onClick={() => setPointCapIndex(idx)}
              >
                {lab}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isFieldHidden('deduction') && (
        <div className={sectionClass}>
          <p className={labelClass}>扣除</p>
          {deductionPolicy.clubOnly ? (
            <p className="text-sm text-gray-700">俱樂部扣除（依俱樂部設定固定）</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                disabled={isDeductionOptionDisabled(0) || isFieldDisabled('deduction')}
                className={chip(
                  deductionIndex === 0,
                  isDeductionOptionDisabled(0) || isFieldDisabled('deduction')
                )}
                onClick={() => setDeductionIndex(0)}
              >
                AA扣除
              </button>
              <button
                type="button"
                disabled={isDeductionOptionDisabled(1) || isFieldDisabled('deduction')}
                className={chip(
                  deductionIndex === 1,
                  isDeductionOptionDisabled(1) || isFieldDisabled('deduction')
                )}
                onClick={() => setDeductionIndex(1)}
              >
                俱樂部扣除
              </button>
            </div>
          )}
        </div>
      )}

      <div className={sectionClass}>
        <p className={labelClass}>房間選項</p>
        <p className="text-xs text-gray-600">
          {isForced
            ? '強制模式：玩法／底台等已鎖定，手動開始／IP／GPS 可於開房時勾選（預設為俱樂部遊戲設定）。'
            : '自由模式：若俱樂部未開放該選項則無法勾選（與 App 一致）。'}
        </p>
        <div className="flex flex-col gap-2">
          <label className={checkLabelClass}>
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600"
              checked={manualStart}
              disabled={isRoomOptionDisabled('manual_start')}
              onChange={(e) => setManualStart(e.target.checked)}
            />
            手動開始
          </label>
          <label className={checkLabelClass}>
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600"
              checked={ipCheck}
              disabled={isRoomOptionDisabled('ip_check')}
              onChange={(e) => setIpCheck(e.target.checked)}
            />
            IP檢查
          </label>
          <label className={checkLabelClass}>
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600"
              checked={gpsLock}
              disabled={isRoomOptionDisabled('gps_lock')}
              onChange={(e) => setGpsLock(e.target.checked)}
            />
            GPS鎖定
          </label>
        </div>
      </div>

      {isForced && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          此俱樂部為強制模式：除手動開始／IP／GPS 外，其餘開房選項已依遊戲設定鎖定。
        </p>
      )}
    </div>
  )
}
