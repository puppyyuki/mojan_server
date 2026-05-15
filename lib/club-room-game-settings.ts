/** 與 routes/client/clubs.js 開房政策一致，供後台開房測試與 API 共用 */

export type RoomGameSettings = {
  base_points: number
  scoring_unit: number
  rounds: number
  game_type: 'NORTHERN' | 'SOUTHERN'
  special_rules: {
    li_gu: boolean
    eye_tile_feature: boolean
    forced_win: boolean
    no_points_dealer: boolean
  }
  point_cap: string
  deduction: string
  manual_start: boolean
  ip_check: boolean
  gps_lock: boolean
  admin_open_test?: boolean
}

export function normalizeRoomGameSettings(raw: unknown): RoomGameSettings {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const special =
    input.special_rules && typeof input.special_rules === 'object' && !Array.isArray(input.special_rules)
      ? (input.special_rules as Record<string, unknown>)
      : {}
  const deductionRaw = String(input.deduction || 'AA_DEDUCTION').toUpperCase()
  const deduction = ['AA_DEDUCTION', 'HOST_DEDUCTION', 'CLUB_DEDUCTION'].includes(deductionRaw)
    ? deductionRaw
    : 'AA_DEDUCTION'
  const roundsNum = Number(input.rounds)
  const rounds = [1, 2, 4].includes(roundsNum) ? roundsNum : 1
  const gameTypeRaw = String(input.game_type || 'NORTHERN').toUpperCase()
  const game_type = gameTypeRaw === 'SOUTHERN' ? 'SOUTHERN' : 'NORTHERN'
  const pointCapRaw = String(input.point_cap || 'UP_TO_8_POINTS').toUpperCase()
  const point_cap = ['UP_TO_4_POINTS', 'UP_TO_8_POINTS', 'NO_LIMIT'].includes(pointCapRaw)
    ? pointCapRaw
    : 'UP_TO_8_POINTS'
  const basePointsNum = Number(input.base_points)
  let scoringUnitNum = Number(input.scoring_unit)
  if (Number.isFinite(scoringUnitNum)) {
    scoringUnitNum = Math.max(0, Math.floor(scoringUnitNum))
    if (scoringUnitNum === 21) scoringUnitNum = 20
    if (scoringUnitNum === 22) scoringUnitNum = 30
  }
  return {
    base_points: Number.isFinite(basePointsNum) ? Math.max(0, Math.floor(basePointsNum)) : 100,
    scoring_unit: Number.isFinite(scoringUnitNum) ? scoringUnitNum : 20,
    rounds,
    game_type,
    special_rules: {
      li_gu: special.li_gu === true,
      eye_tile_feature: special.eye_tile_feature === true,
      forced_win: special.forced_win === true,
      no_points_dealer: special.no_points_dealer === true,
    },
    point_cap,
    deduction,
    manual_start: input.manual_start === true,
    ip_check: input.ip_check === true,
    gps_lock: input.gps_lock === true || input.location_check === true,
    ...(input.admin_open_test === true ? { admin_open_test: true } : {}),
  }
}

export function applyClubGameSettingsPolicy(
  clubSettingsRaw: unknown,
  requestedRaw: unknown
): RoomGameSettings {
  const requested = normalizeRoomGameSettings(requestedRaw)
  const clubSettings =
    clubSettingsRaw && typeof clubSettingsRaw === 'object' && !Array.isArray(clubSettingsRaw)
      ? (clubSettingsRaw as Record<string, unknown>)
      : null
  if (!clubSettings) return requested

  const mode = String(clubSettings.global_settings || '').toUpperCase()
  const isForced = mode === 'FORCED'
  const specialRulePolicy =
    clubSettings.special_rules && typeof clubSettings.special_rules === 'object'
      ? (clubSettings.special_rules as Record<string, unknown>)
      : {}

  const out: RoomGameSettings = { ...requested, special_rules: { ...requested.special_rules } }

  const lockOrValidateEnum = (key: keyof RoomGameSettings, value: unknown, allowed: unknown[]) => {
    if (isForced) {
      if (value != null) (out as Record<string, unknown>)[key] = value
      return
    }
    if (!Array.isArray(allowed) || allowed.length === 0) return
    if (!allowed.includes((out as Record<string, unknown>)[key])) {
      (out as Record<string, unknown>)[key] = allowed[0]
    }
  }

  if (clubSettings.game_type) {
    out.game_type =
      String(clubSettings.game_type).toUpperCase() === 'SOUTHERN' ? 'SOUTHERN' : 'NORTHERN'
  }

  if (isForced) {
    if (clubSettings.base_points != null)
      out.base_points = Number(clubSettings.base_points) || out.base_points
    if (clubSettings.scoring_unit != null)
      out.scoring_unit = Number(clubSettings.scoring_unit) || out.scoring_unit
    if (clubSettings.rounds != null) out.rounds = Number(clubSettings.rounds) || out.rounds
    if (clubSettings.point_cap != null) out.point_cap = String(clubSettings.point_cap)
  } else {
    const minBase = Number(clubSettings.minimum_base_point)
    const maxBase = Number(clubSettings.maximum_base_point)
    if (Number.isFinite(minBase)) out.base_points = Math.max(out.base_points, minBase)
    if (Number.isFinite(maxBase)) out.base_points = Math.min(out.base_points, maxBase)
    let minUnit = Number(clubSettings.minimum_scoring_unit)
    let maxUnit = Number(clubSettings.maximum_scoring_unit)
    if (Number.isFinite(minUnit)) {
      minUnit = Math.floor(minUnit)
      if (minUnit === 21) minUnit = 20
      if (minUnit === 22) minUnit = 30
      out.scoring_unit = Math.max(out.scoring_unit, minUnit)
    }
    if (Number.isFinite(maxUnit)) {
      maxUnit = Math.floor(maxUnit)
      if (maxUnit === 21) maxUnit = 20
      if (maxUnit === 22) maxUnit = 30
      out.scoring_unit = Math.min(out.scoring_unit, maxUnit)
    }
    lockOrValidateEnum('rounds', out.rounds, clubSettings.rounds as unknown[])
    lockOrValidateEnum('point_cap', out.point_cap, clubSettings.point_cap as unknown[])
  }

  const deductionPolicy =
    clubSettings.deduction && typeof clubSettings.deduction === 'object'
      ? (clubSettings.deduction as Record<string, unknown>)
      : null
  if (deductionPolicy) {
    const allowAA = deductionPolicy.aa_deduction === true
    const allowHost = deductionPolicy.host_deduction === true
    if (isForced) {
      if (allowHost && !allowAA) out.deduction = 'HOST_DEDUCTION'
      else if (allowAA && !allowHost) out.deduction = 'AA_DEDUCTION'
      else if (!allowAA && !allowHost) out.deduction = 'CLUB_DEDUCTION'
    } else {
      if (out.deduction === 'AA_DEDUCTION' && !allowAA) {
        out.deduction = allowHost ? 'HOST_DEDUCTION' : 'CLUB_DEDUCTION'
      } else if (out.deduction === 'HOST_DEDUCTION' && !allowHost) {
        out.deduction = allowAA ? 'AA_DEDUCTION' : 'CLUB_DEDUCTION'
      }
    }
  }

  if (isForced) {
    for (const key of ['li_gu', 'eye_tile_feature', 'forced_win', 'no_points_dealer'] as const) {
      const policy = specialRulePolicy[key]
      if (policy != null) out.special_rules[key] = policy === true
    }
  } else {
    for (const key of ['li_gu', 'no_points_dealer'] as const) {
      const policy = specialRulePolicy[key]
      if (policy === false) out.special_rules[key] = false
    }
    if (specialRulePolicy.eye_tile_feature === false) out.special_rules.eye_tile_feature = false
    if (specialRulePolicy.forced_win === false) out.special_rules.forced_win = true
  }

  for (const key of ['manual_start', 'ip_check', 'gps_lock'] as const) {
    const policy = clubSettings[key]
    if (isForced) {
      if (typeof policy === 'boolean') out[key] = policy
    } else if (policy === false) {
      out[key] = false
    }
  }

  return normalizeRoomGameSettings(out)
}
