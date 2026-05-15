/** 後台圖片上傳時，Express 靜態檔可能與 Next Admin 不同 origin */
export function resolveUploadServerBase(): string {
  const envBase = process.env.NEXT_PUBLIC_UPLOAD_SERVER_ORIGIN?.trim()
  if (envBase) return envBase.replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    if (origin.includes('localhost:3001')) {
      return origin.replace('localhost:3001', 'localhost:3000')
    }
    if (origin.includes('mojan-admin-0kuv.onrender.com')) {
      return 'https://mojan-server-0kuv.onrender.com'
    }
    return origin
  }
  return ''
}

export async function uploadPlayerAvatarImage(
  file: File,
  options?: { silent?: boolean }
): Promise<string | null> {
  const formData = new FormData()
  formData.append('image', file)

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null
  const uploadBase = resolveUploadServerBase()
  const response = await fetch(`${uploadBase}/api/upload-player-avatar`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

  const raw = await response.text()
  let result: { success?: boolean; url?: string; error?: string } | null = null
  try {
    result = raw ? JSON.parse(raw) : null
  } catch {
    result = null
  }

  if (!response.ok || !result?.success || !result.url) {
    if (!options?.silent) {
      alert(result?.error || `頭像上傳失敗（HTTP ${response.status}）`)
    }
    return null
  }

  return result.url
}
