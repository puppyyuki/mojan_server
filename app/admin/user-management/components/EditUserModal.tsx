'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Save, Plus, Pencil, Trash2 } from 'lucide-react'
import { apiDelete, apiGet, apiPatch } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import PlayerAvatarField, {
  resolveAvatarUrlForSave,
} from './PlayerAvatarField'
import AddPlayerClubUpstreamModal, {
  type PlayerClubUpstreamBindingRow,
} from './AddPlayerClubUpstreamModal'

interface Player {
  id: string
  userId: string
  nickname: string
  cardCount: number
  maxJoinClubCount?: number
  bio?: string | null
  avatarUrl?: string | null
  phoneE164?: string | null
  upstreamAgent?: {
    playerDbId: string
    userId: string
    nickname: string
  } | null
}

interface EditUserModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  player: Player | null
}

export default function EditUserModal({
  isOpen,
  onClose,
  onSuccess,
  player,
}: EditUserModalProps) {
  const [nickname, setNickname] = useState<string>('')
  const [cardCount, setCardCount] = useState<string>('0')
  const [maxJoinClubCount, setMaxJoinClubCount] = useState<string>('3')
  const [bio, setBio] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [bindings, setBindings] = useState<PlayerClubUpstreamBindingRow[]>([])
  const [legacyUpstreamAgent, setLegacyUpstreamAgent] = useState<{
    playerDbId: string
    userId: string
    nickname: string
  } | null>(null)
  const [bindingsLoading, setBindingsLoading] = useState(false)
  const [isApprovedAgent, setIsApprovedAgent] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingBinding, setEditingBinding] =
    useState<PlayerClubUpstreamBindingRow | null>(null)

  const loadBindings = useCallback(async () => {
    if (!player) return
    setBindingsLoading(true)
    try {
      const res = await apiGet(
        `/api/admin/players/club-upstream-bindings/${player.id}`
      )
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        setBindings(Array.isArray(json.data) ? json.data : [])
        setLegacyUpstreamAgent(json.legacyUpstreamAgent ?? null)
        setIsApprovedAgent(json.isApprovedAgent === true)
      }
    } catch (error) {
      console.error('load bindings failed', error)
    } finally {
      setBindingsLoading(false)
    }
  }, [player])

  useEffect(() => {
    if (isOpen && player) {
      setNickname(player.nickname)
      setCardCount(player.cardCount.toString())
      setMaxJoinClubCount(
        Math.max(Number(player.maxJoinClubCount ?? 3) || 3, 1).toString()
      )
      setBio(player.bio || '')
      setAvatarUrl(player.avatarUrl || '')
      setPendingAvatarFile(null)
      void loadBindings()
    }
  }, [isOpen, player, loadBindings])

  const needsUpstreamMigration =
    !isApprovedAgent &&
    Boolean(legacyUpstreamAgent || player?.upstreamAgent) &&
    bindings.length === 0

  const handleDeleteBinding = async (binding: PlayerClubUpstreamBindingRow) => {
    if (!player) return
    if (!confirm(`確定要刪除俱樂部「${binding.clubName}」的上層代理綁定嗎？`))
      return

    const opCode = await requestAdminOpCode('確定要刪除此上層代理綁定嗎？')
    if (!opCode) return

    try {
      const res = await apiDelete(
        `/api/admin/players/club-upstream-bindings/${player.id}/${binding.id}`,
        {
          headers: withAdminOpCodeHeader(opCode),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '刪除失敗')
        return
      }
      await loadBindings()
    } catch {
      alert('刪除失敗')
    }
  }

  const handleSave = async () => {
    if (loading || !player) return

    if (!nickname.trim()) {
      alert('請輸入暱稱')
      return
    }

    if (needsUpstreamMigration) {
      alert('請先完成至少一筆俱樂部與上層代理綁定')
      setAddModalOpen(true)
      return
    }

    const opCode = await requestAdminOpCode('確定要調整玩家資料與房卡嗎？')
    if (!opCode) return

    setLoading(true)
    try {
      const finalAvatarUrl = await resolveAvatarUrlForSave(
        avatarUrl,
        pendingAvatarFile
      )
      if (pendingAvatarFile && finalAvatarUrl === null) {
        alert('頭像上傳失敗，請重新嘗試')
        setLoading(false)
        return
      }

      const parsedMaxJoinClubCount = parseInt(maxJoinClubCount, 10)
      if (
        !Number.isFinite(parsedMaxJoinClubCount) ||
        parsedMaxJoinClubCount < 1
      ) {
        alert('可加入俱樂部上限必須為大於等於 1 的整數')
        setLoading(false)
        return
      }

      const response = await apiPatch(
        `/api/players/${player.id}`,
        {
          nickname: nickname.trim(),
          cardCount: parseInt(cardCount),
          maxJoinClubCount: parsedMaxJoinClubCount,
          bio: bio.trim() || null,
          avatarUrl: finalAvatarUrl,
        },
        { headers: withAdminOpCodeHeader(opCode) }
      )

      if (response.ok) {
        const result = await response.json()
        alert(result.message || '更新成功')
        onSuccess()
        onClose()
      } else {
        const result = await response.json().catch(() => ({ error: '未知錯誤' }))
        alert(result.error || '更新失敗')
      }
    } catch (error) {
      console.error('更新使用者失敗:', error)
      alert(`更新失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !player) return null

  const legacyNick =
    legacyUpstreamAgent?.nickname ?? player.upstreamAgent?.nickname
  const legacyUserId =
    legacyUpstreamAgent?.userId ?? player.upstreamAgent?.userId

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">編輯使用者</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                使用者ID：
                <span className="font-semibold text-gray-900">{player.userId}</span>
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">
                電話：
                <span className="font-semibold text-gray-900">
                  {player.phoneE164?.trim() ? player.phoneE164 : '未綁定'}
                </span>
              </p>
            </div>

            <PlayerAvatarField
              avatarUrl={avatarUrl}
              onAvatarUrlChange={setAvatarUrl}
              onPendingFileChange={setPendingAvatarFile}
              disabled={loading}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                玩家名稱 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="請輸入暱稱"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
              />
            </div>

            <div className="space-y-2">
              <p className="block text-sm font-medium text-gray-700">上層代理</p>
              <p className="text-xs text-gray-500">
                依俱樂部分別綁定上層代理；同一玩家可在某些俱樂部是代理，在其他俱樂部仍是玩家。
              </p>

              {isApprovedAgent && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  若要設定此玩家作為代理的俱樂部綁定、房卡費與代理%數，請至「代理管理」。此處僅設定他在其他俱樂部作為玩家時的上層代理。
                </div>
              )}

              {needsUpstreamMigration && legacyNick && legacyUserId && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  原玩家先前上層代理為：{legacyNick}（{legacyUserId}）。請綁定玩家的俱樂部與上層代理。
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setEditingBinding(null)
                  setAddModalOpen(true)
                }}
                disabled={loading || bindingsLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                添加上層代理
              </button>

              {bindingsLoading ? (
                <p className="text-xs text-gray-500">載入綁定中…</p>
              ) : bindings.length > 0 ? (
                <ul className="space-y-2">
                  {bindings.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700"
                    >
                      <p>
                        俱樂部：{b.clubName}（{b.clubId}）、上層代理：
                        {b.upstreamAgent.nickname}（{b.upstreamAgent.userId}）
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBinding(b)
                            setAddModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <Pencil className="w-3 h-3" />
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBinding(b)}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-3 h-3" />
                          刪除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">尚未設定上層代理綁定</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                當前房卡數量
              </label>
              <input
                type="number"
                value={cardCount}
                onChange={(e) => setCardCount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                可加入俱樂部上限 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={maxJoinClubCount}
                onChange={(e) => setMaxJoinClubCount(e.target.value)}
                placeholder="3"
                min="1"
                step="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                備註
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="請輸入備註..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400 resize-none"
              />
            </div>
          </div>

          <div className="flex border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-4 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
            >
              取消
            </button>
            <div className="w-px bg-gray-200" />
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-4 text-blue-600 hover:text-blue-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  處理中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <AddPlayerClubUpstreamModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false)
          setEditingBinding(null)
        }}
        onSuccess={() => void loadBindings()}
        playerDbId={player.id}
        editing={editingBinding}
        excludeClubDbIds={bindings.map((b) => b.clubDbId)}
      />
    </>
  )
}
