'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'
import SearchableSelect, { type SearchableOption } from '@/app/admin/components/SearchableSelect'
import RoomCreateSettingsForm from './RoomCreateSettingsForm'

type ClubRow = {
  id: string
  clubId: string
  name: string
  displayLabel: string
}

type MemberRow = {
  id: string
  userId: string
  nickname: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddRoomModal({ isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clubsLoading, setClubsLoading] = useState(false)
  const [clubsError, setClubsError] = useState<string | null>(null)
  const [clubs, setClubs] = useState<ClubRow[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

  const [settingsLoading, setSettingsLoading] = useState(false)
  const [clubGameSettings, setClubGameSettings] = useState<Record<string, unknown> | null>(null)
  const [gameSettingsDraft, setGameSettingsDraft] = useState<Record<string, unknown>>({})

  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [hostId, setHostId] = useState<string | null>(null)
  const [player1Id, setPlayer1Id] = useState<string | null>(null)
  const [player2Id, setPlayer2Id] = useState<string | null>(null)
  const [player3Id, setPlayer3Id] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStep(1)
    setError(null)
    setSelectedClubId(null)
    setClubGameSettings(null)
    setGameSettingsDraft({})
    setHostId(null)
    setPlayer1Id(null)
    setPlayer2Id(null)
    setPlayer3Id(null)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    reset()
  }, [isOpen, reset])

  const loadClubs = useCallback(async () => {
    setClubsLoading(true)
    setClubsError(null)
    try {
      const res = await apiGet('/api/admin/room-open-test/clubs')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setClubs([])
        setClubsError(typeof json?.error === 'string' ? json.error : '載入失敗')
        return
      }
      setClubs(Array.isArray(json.data) ? json.data : [])
    } catch {
      setClubs([])
      setClubsError('載入失敗')
    } finally {
      setClubsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) void loadClubs()
  }, [isOpen, loadClubs])

  const clubOptions: SearchableOption[] = useMemo(
    () =>
      clubs.map((c) => ({
        value: c.id,
        label: c.displayLabel || `${c.name}（${c.clubId}）`,
        hint: c.id,
      })),
    [clubs]
  )

  const loadGameSettings = async (clubId: string) => {
    setSettingsLoading(true)
    setClubGameSettings(null)
    try {
      const res = await apiGet(
        `/api/admin/room-open-test/clubs/${encodeURIComponent(clubId)}/game-settings`
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : '無法載入遊戲設定')
        return false
      }
      const gs = json.data?.gameSettings ?? null
      setClubGameSettings(gs && typeof gs === 'object' ? (gs as Record<string, unknown>) : null)
      return true
    } catch {
      setError('無法載入遊戲設定')
      return false
    } finally {
      setSettingsLoading(false)
    }
  }

  const loadMembers = async (clubId: string) => {
    setMembersLoading(true)
    setMembersError(null)
    try {
      const res = await apiGet(
        `/api/admin/room-open-test/clubs/${encodeURIComponent(clubId)}/members`
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMembers([])
        setMembersError(typeof json?.error === 'string' ? json.error : '載入失敗')
        return
      }
      setMembers(Array.isArray(json.data) ? json.data : [])
    } catch {
      setMembers([])
      setMembersError('載入失敗')
    } finally {
      setMembersLoading(false)
    }
  }

  const memberOptions = (exclude: string[]): SearchableOption[] =>
    members
      .filter((m) => !exclude.includes(m.id))
      .map((m) => ({
        value: m.id,
        label: `${m.nickname}（${m.userId}）`,
        hint: m.id,
      }))

  const handleNextFromClub = async () => {
    if (!selectedClubId) {
      setError('請選擇俱樂部')
      return
    }
    setError(null)
    const ok = await loadGameSettings(selectedClubId)
    if (ok) setStep(2)
  }

  const handleNextFromSettings = () => {
    setError(null)
    if (!selectedClubId) {
      setError('請選擇俱樂部')
      return
    }
    void loadMembers(selectedClubId)
    setStep(3)
  }

  const handleSubmit = async () => {
    if (!selectedClubId || !hostId || !player1Id || !player2Id || !player3Id) {
      setError('請選擇房主與三名玩家')
      return
    }
    const ids = [hostId, player1Id, player2Id, player3Id]
    if (new Set(ids).size !== 4) {
      setError('房主與玩家不可重複')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await apiPost('/api/admin/room-open-test/rooms', {
        clubId: selectedClubId,
        hostPlayerId: hostId,
        playerIds: [player1Id, player2Id, player3Id],
        gameSettings: gameSettingsDraft,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : '建立失敗')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('建立失敗')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const stepTitle =
    step === 1 ? '選擇俱樂部' : step === 2 ? '開房設定' : '選擇玩家'

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-2xl mx-auto shadow-xl relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">添加房間</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              步驟 {step}／3 · {stepTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {step === 1 && (
            <SearchableSelect
              label="俱樂部"
              placeholder="輸入俱樂部名稱或編號篩選…"
              value={selectedClubId}
              onChange={(v) => {
                setSelectedClubId(v)
                setError(null)
              }}
              options={clubOptions}
              loading={clubsLoading}
              loadError={clubsError}
              helperText="僅列出系統內俱樂部；選定後下一步將載入該俱樂部遊戲設定。"
            />
          )}

          {step === 2 &&
            (settingsLoading ? (
              <p className="text-sm text-gray-500 py-8 text-center">載入遊戲設定中…</p>
            ) : (
              <RoomCreateSettingsForm
                clubGameSettings={clubGameSettings}
                onChange={setGameSettingsDraft}
              />
            ))}

          {step === 3 && (
            <div className="space-y-4">
              <SearchableSelect
                label="房主"
                value={hostId}
                onChange={(v) => setHostId(v)}
                options={memberOptions(
                  [player1Id, player2Id, player3Id].filter(Boolean) as string[]
                )}
                loading={membersLoading}
                loadError={membersError}
              />
              <SearchableSelect
                label="玩家 1"
                value={player1Id}
                onChange={(v) => setPlayer1Id(v)}
                options={memberOptions(
                  [hostId, player2Id, player3Id].filter(Boolean) as string[]
                )}
                loading={membersLoading}
                loadError={membersError}
              />
              <SearchableSelect
                label="玩家 2"
                value={player2Id}
                onChange={(v) => setPlayer2Id(v)}
                options={memberOptions(
                  [hostId, player1Id, player3Id].filter(Boolean) as string[]
                )}
                loading={membersLoading}
                loadError={membersError}
              />
              <SearchableSelect
                label="玩家 3"
                value={player3Id}
                onChange={(v) => setPlayer3Id(v)}
                options={memberOptions(
                  [hostId, player1Id, player2Id].filter(Boolean) as string[]
                )}
                loading={membersLoading}
                loadError={membersError}
              />
              <p className="text-xs text-gray-500">
                僅列出該俱樂部未禁開房的成員；四名玩家不可重複。
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (step === 1) onClose()
              else setStep((s) => s - 1)
            }}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={submitting}
          >
            {step === 1 ? '取消' : '上一步'}
          </button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1) void handleNextFromClub()
                  else handleNextFromSettings()
                }}
                disabled={submitting || (step === 2 && settingsLoading)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? '建立中…' : '完成'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
