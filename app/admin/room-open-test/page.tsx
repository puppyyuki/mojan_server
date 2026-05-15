'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { apiDelete, apiGet } from '@/lib/api-client'
import AddRoomModal from './components/AddRoomModal'

type TestRoomRow = {
  id: string
  roomId: string
  status: string
  currentPlayers: number
  maxPlayers: number
  gameSettings: Record<string, unknown> | null
  createdAt: string
  club: { id: string; clubId: string; name: string } | null
  host: { id: string; userId: string; nickname: string }
  players: Array<{ id: string; userId: string; nickname: string }>
}

function gameTypeLabel(gs: Record<string, unknown> | null): string {
  if (!gs) return '—'
  const t = String(gs.game_type || '').toUpperCase()
  if (t === 'SOUTHERN') return '南部'
  if (t === 'NORTHERN') return '北部'
  return t || '—'
}

function rulesBrief(gs: Record<string, unknown> | null): string {
  if (!gs) return '—'
  const base = gs.base_points ?? '—'
  const unit = gs.scoring_unit ?? '—'
  const rounds = gs.rounds ?? '—'
  return `底${base} / ${unit}台 / ${rounds}圈`
}

export default function RoomOpenTestPage() {
  const [loading, setLoading] = useState(false)
  const [rooms, setRooms] = useState<TestRoomRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

  const fetchRooms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/api/admin/room-open-test/rooms')
      const json = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(json.data)) {
        setRooms(json.data)
      } else {
        setRooms([])
        console.error(json.error || '載入房間列表失敗')
      }
    } catch (e) {
      console.error(e)
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRooms()
  }, [fetchRooms])

  const handleClose = async (room: TestRoomRow) => {
    if (!confirm(`確定要關閉房間 ${room.roomId} 嗎？`)) return
    setClosingId(room.id)
    try {
      const res = await apiDelete(
        `/api/admin/room-open-test/rooms/${encodeURIComponent(room.roomId)}`
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(typeof json?.error === 'string' ? json.error : '關閉失敗')
        return
      }
      await fetchRooms()
    } catch {
      alert('關閉失敗')
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            添加房間
          </button>
          <button
            type="button"
            onClick={() => void fetchRooms()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  房間號
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  俱樂部
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  玩法
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  設定
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  房主
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  玩家
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  人數
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  狀態
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  建立時間
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && rooms.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                    載入中…
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                    尚無測試房間，請點擊「添加房間」建立
                  </td>
                </tr>
              ) : (
                rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center text-sm font-mono text-gray-900">
                      {room.roomId}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {room.club ? `${room.club.name}（${room.club.clubId}）` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {gameTypeLabel(room.gameSettings)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {rulesBrief(room.gameSettings)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {room.host.nickname}（{room.host.userId}）
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600 max-w-xs">
                      {room.players
                        .map((p) => `${p.nickname}（${p.userId}）`)
                        .join('、')}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">
                      {room.currentPlayers}/{room.maxPlayers}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          room.status === 'PLAYING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {room.status === 'PLAYING' ? '進行中' : '等待中'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500 whitespace-nowrap">
                      {new Date(room.createdAt).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        disabled={closingId === room.id}
                        onClick={() => void handleClose(room)}
                        className="px-3 py-1 text-sm text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        {closingId === room.id ? '關閉中…' : '關閉'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddRoomModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => void fetchRooms()}
      />
    </div>
  )
}
