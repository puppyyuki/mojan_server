'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, Save } from 'lucide-react'
import { apiPatch } from '@/lib/api-client'

interface Announcement {
  id: string
  announcementId: string
  title: string
  content: string
  imageUrl?: string | null
  type: string
  isVisible: boolean
}

interface EditAnnouncementModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  announcement: Announcement | null
}

export default function EditAnnouncementModal({
  isOpen,
  onClose,
  onSuccess,
  announcement,
}: EditAnnouncementModalProps) {
  const [title, setTitle] = useState<string>('')
  const [content, setContent] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string>('')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [type, setType] = useState<string>('活動')
  const [isVisible, setIsVisible] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [uploadingImage, setUploadingImage] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && announcement) {
      setTitle(announcement.title)
      setContent(announcement.content)
      setImageUrl(announcement.imageUrl || '')
      setSelectedImageFile(null)
      setType(announcement.type)
      setIsVisible(announcement.isVisible)
    }
  }, [isOpen, announcement])

  const resolveUploadServerBase = () => {
    const envBase = process.env.NEXT_PUBLIC_UPLOAD_SERVER_ORIGIN?.trim()
    if (envBase) return envBase.replace(/\/$/, '')

    if (typeof window !== 'undefined') {
      const origin = window.location.origin
      if (origin.includes('localhost:3001')) {
        return origin.replace('localhost:3001', 'localhost:3000')
      }
      return origin
    }
    return ''
  }

  const uploadSelectedImage = async (silent = false): Promise<string | null> => {
    if (!selectedImageFile) return imageUrl || null
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', selectedImageFile)

      const token =
        typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null
      const uploadBase = resolveUploadServerBase()
      const response = await fetch(`${uploadBase}/api/upload-announcement-image`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      const result = await response.json()
      if (!response.ok || !result?.success) {
        if (!silent) {
          alert(result?.error || '圖片上傳失敗')
        }
        return null
      }

      setImageUrl(result.url)
      if (!silent) {
        alert('圖片上傳成功')
      }
      return result.url as string
    } catch (error) {
      console.error('上傳公告圖片失敗:', error)
      if (!silent) {
        alert('圖片上傳失敗')
      }
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  const handleUploadImage = async () => {
    if (!selectedImageFile) {
      alert('請先選擇圖片')
      return
    }
    await uploadSelectedImage(false)
  }

  const handleSave = async () => {
    if (loading || uploadingImage || !announcement) return

    if (!title.trim()) {
      alert('請輸入標題')
      return
    }

    if (!content.trim()) {
      alert('請輸入內容')
      return
    }

    if (!type) {
      alert('請選擇類型')
      return
    }

    // 如果設置為顯示，提示用戶
    if (isVisible && !announcement.isVisible) {
      const confirmMessage = `確定要顯示此${type}嗎？如果已有其他顯示中的${type}，系統將自動取消其顯示狀態。`
      if (!confirm(confirmMessage)) {
        return
      }
    }

    setLoading(true)
    try {
      let finalImageUrl = imageUrl || null
      if (selectedImageFile) {
        const uploadedUrl = await uploadSelectedImage(true)
        if (!uploadedUrl) {
          alert('圖片上傳失敗，請重新嘗試')
          return
        }
        finalImageUrl = uploadedUrl
      }

      const response = await apiPatch(`/api/announcements/${announcement.id}`, {
        title: title.trim(),
        content: content.trim(),
        imageUrl: finalImageUrl,
        type,
        isVisible,
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || '更新成功')
        onSuccess()
        onClose()
      } else {
        const result = await response.json()
        alert(result.error || '更新失敗')
      }
    } catch (error) {
      console.error('更新活動更新失敗:', error)
      alert('更新失敗')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !announcement) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">編輯活動更新</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 內容 */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              公告ID：<span className="font-semibold text-gray-900">{announcement.announcementId}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              標題 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="請輸入標題"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              內容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="請輸入內容"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              圖片檔案
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setSelectedImageFile(e.target.files?.[0] || null)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white file:mr-3 file:px-3 file:py-1 file:border-0 file:bg-blue-50 file:text-blue-700 file:rounded"
              />
              <button
                type="button"
                onClick={handleUploadImage}
                disabled={!selectedImageFile || uploadingImage || loading}
                className="px-3 py-2 text-sm rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingImage ? '上傳中...' : '上傳'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              請先選檔再按上傳（支援 JPG/PNG/WEBP/GIF，最大 10MB）
            </p>
            {imageUrl && (
              <div className="mt-2">
                <div className="relative w-full h-40 rounded border border-gray-200 overflow-hidden">
                  <Image
                    src={imageUrl}
                    alt="活動圖片預覽"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  移除圖片
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              類型 <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white"
            >
              <option value="活動">活動</option>
              <option value="更新">更新</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium text-gray-700">是否顯示</span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              一次只會顯示一個活動或更新，如果其他要顯示會提示是否取消其他活動或其他更新
            </p>
          </div>
        </div>

        {/* 按鈕 */}
        <div className="flex border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading || uploadingImage}
            className="flex-1 py-4 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
          >
            取消
          </button>
          <div className="w-px bg-gray-200"></div>
          <button
            onClick={handleSave}
            disabled={loading || uploadingImage}
            className="flex-1 py-4 text-blue-600 hover:text-blue-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
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
  )
}

