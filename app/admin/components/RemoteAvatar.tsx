'use client'

import { useEffect, useState } from 'react'

export type RemoteAvatarProps = {
  src?: string | null
  alt?: string
  /** 邊長（px），預設 40 */
  size?: number
  className?: string
  /** 無圖或載入失敗時顯示；預設「無」或暱稱首字 */
  fallbackLabel?: string
}

function AvatarFallback({
  size,
  label,
  className = '',
}: {
  size: number
  label: string
  className?: string
}) {
  return (
    <div
      className={`rounded-full bg-gray-200 flex items-center justify-center text-gray-500 shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}

/**
 * 遠端頭像：使用原生 img，不經 Next.js /_next/image 代理，
 * 避免 LINE 等第三方 CDN 404 時在 server log 刷 upstream image failed。
 */
export default function RemoteAvatar({
  src,
  alt = '',
  size = 40,
  className = '',
  fallbackLabel,
}: RemoteAvatarProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const trimmed = src?.trim()
  const fallback =
    fallbackLabel ?? (alt.trim() ? alt.trim().charAt(0) : '無')

  if (!trimmed || failed) {
    return (
      <AvatarFallback
        size={size}
        label={!trimmed ? '無' : fallback}
        className={className}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 第三方頭像不經 /_next/image，避免 CDN 404 刷 server log
    <img
      src={trimmed}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`rounded-full object-cover bg-gray-100 shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}
