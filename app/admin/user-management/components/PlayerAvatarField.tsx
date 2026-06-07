'use client'

import { useState } from 'react'
import RemoteAvatar from '@/app/admin/components/RemoteAvatar'
import { uploadPlayerAvatarImage } from '@/lib/upload-server-base'

interface PlayerAvatarFieldProps {
  avatarUrl: string
  onAvatarUrlChange: (url: string) => void
  disabled?: boolean
  onPendingFileChange?: (file: File | null) => void
}

export default function PlayerAvatarField({
  avatarUrl,
  onAvatarUrlChange,
  disabled = false,
  onPendingFileChange,
}: PlayerAvatarFieldProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const displayUrl = previewUrl || avatarUrl

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file)
    onPendingFileChange?.(file)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    if (file) {
      setPreviewUrl(URL.createObjectURL(file))
    } else {
      setPreviewUrl(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || disabled || uploading) return
    setUploading(true)
    try {
      const url = await uploadPlayerAvatarImage(selectedFile)
      if (url) {
        onAvatarUrlChange(url)
        handleFileChange(null)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    onAvatarUrlChange('')
    handleFileChange(null)
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        玩家頭像 <span className="text-gray-400 font-normal">（選填）</span>
      </label>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border-2 border-gray-200 overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
          <RemoteAvatar
            src={displayUrl || null}
            alt="頭像預覽"
            size={64}
            className="border-0"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={disabled || uploading}
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white file:mr-3 file:px-3 file:py-1 file:border-0 file:bg-blue-50 file:text-blue-700 file:rounded disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || disabled || uploading}
              className="px-3 py-2 text-sm rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {uploading ? '上傳中...' : '上傳'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            支援 JPG/PNG/WEBP/GIF，最大 5MB。儲存時若已選檔尚未上傳會自動上傳。
          </p>
          {(avatarUrl || previewUrl) && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              移除頭像
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export async function resolveAvatarUrlForSave(
  avatarUrl: string,
  pendingFile: File | null
): Promise<string | null> {
  if (pendingFile) {
    const uploaded = await uploadPlayerAvatarImage(pendingFile, { silent: true })
    if (!uploaded) return null
    return uploaded
  }
  const trimmed = avatarUrl.trim()
  return trimmed || null
}
