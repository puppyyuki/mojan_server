'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch } from '@/lib/api-client'

type AppReleaseData = {
  policyVersion: string
  forceUpdate: boolean
  updatedAt?: string
}

export default function AdminDashboardPage() {
  const [policyVersion, setPolicyVersion] = useState('')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet('/api/admin/app-release')
      const payload = await res.json()
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? '載入失敗')
      }
      const d = payload.data as AppReleaseData
      setPolicyVersion(d.policyVersion ?? '')
      setForceUpdate(Boolean(d.forceUpdate))
      setUpdatedAt(d.updatedAt ?? null)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiPatch('/api/admin/app-release', {
        policyVersion,
        forceUpdate,
      })
      const payload = await res.json()
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? '儲存失敗')
      }
      const d = payload.data as AppReleaseData
      setPolicyVersion(d.policyVersion ?? '')
      setForceUpdate(Boolean(d.forceUpdate))
      setUpdatedAt(d.updatedAt ?? null)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">伍參麻將管理後台</h2>
        <p className="text-gray-600 text-sm mb-6">
          請於此設定 App 的版本門檻。當玩家裝上的版本號低於此門檻時將收到更新提示。版本欄留白表示不進行檢查。
        </p>

        <div className="max-w-lg space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              版本號門檻
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              placeholder="例如 1.0.11（對應 app 的 version；可含或不含 v 前綴）"
              value={policyVersion}
              onChange={(e) => setPolicyVersion(e.target.value)}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              留白 = 停用版本檢查。請與發佈的 App 商店版本對齊（語意版本：主版.次版.修訂）。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={forceUpdate}
              disabled={loading}
              onClick={() => setForceUpdate((x) => !x)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                forceUpdate ? 'bg-emerald-600' : 'bg-gray-200'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  forceUpdate ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-800">
              強制更新
            </span>
            <span className="text-xs text-gray-500">
              （關閉 = 提示後可繼續遊玩）
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={loading || saving}
              className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? '儲存中…' : '儲存設定'}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading || saving}
              className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              重新載入
            </button>
          </div>

          {updatedAt && (
            <p className="text-xs text-gray-500">最後更新：{updatedAt}</p>
          )}

          {loading && (
            <p className="text-sm text-gray-500">載入設定中…</p>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
