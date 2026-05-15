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

function initFromClub(gs: Record<string, unknown> | null) {
  const isForced = String(gs?.global_settings || '').toUpperCase() === 'FORCED'
  let gameType: 'NORTHERN' | 'SOUTHERN' = 'NORTHERN'
  if (gs?.game_type === 'SOUTHERN') gameType = 'SOUTHERN'
  else if (gs?.game_type === 'NORTHERN') gameType = 'NORTHERN'

  let basePoint = VALID_BASE_POINTS[0]
  let scoringUnit = VALID_SCORING_UNITS[0]
  if (isForced) {
    if (gs?.base_points != null) basePoint = Number(gs.base_points) || basePoint
    if (gs?.scoring_unit != null) scoringUnit = Number(gs.scoring_unit) || scoringUnit
  } else {
    const minB = Number(gs?.minimum_base_point)
    const maxB = Number(gs?.maximum_base_point)
    if (Number.isFinite(minB)) basePoint = Math.max(basePoint, minB)
    if (Number.isFinite(maxB)) basePoint = Math.min(basePoint, maxB)
    let minU = Number(gs?.minimum_scoring_unit)
    let maxU = Number(gs?.maximum_scoring_unit)
    if (Number.isFinite(minU)) {
      minU = Math.floor(minU)
      if (minU === 21) minU = 20
      if (minU === 22) minU = 30
      scoringUnit = Math.max(scoringUnit, minU)
    }
    if (Number.isFinite(maxU)) {
      maxU = Math.floor(maxU)
      if (maxU === 21) maxU = 20
      if (maxU === 22) maxU = 30
      scoringUnit = Math.min(scoringUnit, maxU)
    }
  }
  basePoint = nearestValid(basePoint, VALID_BASE_POINTS)
  scoringUnit = nearestValid(scoringUnit, VALID_SCORING_UNITS)

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

  let deductionIndex = 0
  const ded = gs?.deduction as Record<string, unknown> | undefined
  if (isForced && ded) {
    if (ded.host_deduction && !ded.aa_deduction) deductionIndex = 1
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

  const isForced = init.isForced
  const gs = clubGameSettings

  useEffect(() => {
    const next = initFromClub(clubGameSettings)
    setGameType(next.gameType)
    setBasePoint(next.basePoint)
    setScoringUnit(next.scoringUnit)
    setRoundIndex(next.selectedRoundIndex)
    setPointCapIndex(next.selectedPointCapIndex)
    setDeductionIndex(next.deductionIndex)
    setSpecialRules(new Set(next.selectedSpecial))
  }, [clubGameSettings])

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
    return {
      base_points: basePoint,
      scoring_unit: scoringUnit,
      rounds: ROUND_VALUES[roundIndex] ?? 1,
      game_type: gameType,
      special_rules,
      point_cap: POINT_CAPS[pointCapIndex] ?? 'UP_TO_8_POINTS',
      deduction: deductionIndex === 1 ? 'HOST_DEDUCTION' : 'AA_DEDUCTION',
      manual_start: init.isManualStart,
      ip_check: init.isIPCheck,
      gps_lock: init.isGPSLock,
    }
  }

  useEffect(() => {
    onChange(buildSettings())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameType, basePoint, scoringUnit, roundIndex, pointCapIndex, deductionIndex, specialRules])

  const isFieldDisabled = (field: string): boolean => {
    if (!gs) return false
    if (isForced) return true
    if (field === 'base_points' || field === 'scoring_unit') return false
    if (['manual_start', 'ip_check', 'gps_lock', 'location_check'].includes(field)) return true
    const v = gs[field]
    if (typeof v === 'boolean') return !v
    return false
  }

  const isRoundDisabled = (r: number) => {
    if (!gs || isForced) {
      if (isForced && gs?.rounds != null) return Number(gs.rounds) !== r
      return isForced
    }
    const rounds = gs.rounds
    if (Array.isArray(rounds)) return !rounds.includes(r)
    return false
  }

  const isPointCapDisabled = (idx: number) => {
    const val = POINT_CAPS[idx]
    if (!gs || isForced) {
      if (isForced && gs?.point_cap) return String(gs.point_cap) !== val
      return isForced
    }
    const caps = gs.point_cap
    if (Array.isArray(caps)) return !caps.includes(val)
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

  const sectionClass = 'border border-gray-200 rounded-lg p-4 space-y-3'
  const labelClass = 'text-sm font-medium text-gray-700'
  const chip = (active: boolean, disabled: boolean) =>
    `px-3 py-1.5 rounded text-sm border ${
      disabled
        ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-500'
        : active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
    }`

  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">底（分）</label>
            <select
              disabled={isFieldDisabled('base_points')}
              value={basePoint}
              onChange={(e) => setBasePoint(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
            >
              {VALID_BASE_POINTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">台</label>
            <select
              disabled={isFieldDisabled('scoring_unit')}
              value={scoringUnit}
              onChange={(e) => setScoringUnit(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
            >
              {VALID_SCORING_UNITS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>圈數</p>
        <div className="flex gap-2 flex-wrap">
          {ROUND_VALUES.map((r, idx) => (
            <button
              key={r}
              type="button"
              disabled={isRoundDisabled(r)}
              className={chip(roundIndex === idx, isRoundDisabled(r))}
              onClick={() => setRoundIndex(idx)}
            >
              {r}圈
            </button>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>特殊規則</p>
        <div className="flex flex-col gap-2">
          {gameType === 'NORTHERN' ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(0)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(0)}
                />
                立直
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(1)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(1)}
                />
                眼牌
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(2)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(2)}
                />
                強制胡牌
              </label>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(0)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(0)}
                />
                無台莊家
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(1)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(1)}
                />
                眼牌
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={specialRules.has(2)}
                  disabled={isForced}
                  onChange={() => toggleSpecial(2)}
                />
                強制胡牌
              </label>
            </>
          )}
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>台數上限</p>
        <div className="flex gap-2 flex-wrap">
          {['4台滿', '8台滿', '無限台'].map((lab, idx) => (
            <button
              key={lab}
              type="button"
              disabled={isPointCapDisabled(idx)}
              className={chip(pointCapIndex === idx, isPointCapDisabled(idx))}
              onClick={() => setPointCapIndex(idx)}
            >
              {lab}
            </button>
          ))}
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>扣除方式</p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={isForced}
            className={chip(deductionIndex === 0, isForced)}
            onClick={() => setDeductionIndex(0)}
          >
            AA扣除
          </button>
          <button
            type="button"
            disabled={isForced}
            className={chip(deductionIndex === 1, isForced)}
            onClick={() => setDeductionIndex(1)}
          >
            房主扣除
          </button>
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass}>房間選項（依俱樂部政策）</p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <span>手動開始：{init.isManualStart ? '是' : '否'}</span>
          <span>IP檢查：{init.isIPCheck ? '是' : '否'}</span>
          <span>GPS鎖定：{init.isGPSLock ? '是' : '否'}</span>
        </div>
      </div>

      {isForced && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          此俱樂部為強制模式，開房選項已依遊戲設定鎖定。
        </p>
      )}
    </div>
  )
}
