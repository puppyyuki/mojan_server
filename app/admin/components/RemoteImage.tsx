'use client'

import { useEffect, useState } from 'react'

export type RemoteImageProps = {
  src?: string | null
  alt?: string
  className?: string
  /** 填滿外層 relative 容器 */
  fill?: boolean
  width?: number
  height?: number
}

/**
 * 遠端圖片預覽：原生 img，不經 /_next/image。
 * fill 時父層需有 position: relative 與固定高度。
 */
export function RemoteImage({
  src,
  alt = '',
  className = '',
  fill = false,
  width,
  height,
}: RemoteImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const trimmed = src?.trim()

  if (!trimmed || failed) {
    return null
  }

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 遠端預覽不經 /_next/image
      <img
        src={trimmed}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`absolute inset-0 w-full h-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 遠端預覽不經 /_next/image
    <img
      src={trimmed}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
