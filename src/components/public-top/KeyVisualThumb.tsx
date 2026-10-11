import { useState } from 'react'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { cn } from '@/lib/utils'

const GRADIENTS = [
  'linear-gradient(135deg,#d9c9f3,#bfe3cf)',
  'linear-gradient(135deg,#f3c9c9,#f3e3bf)',
  'linear-gradient(135deg,#c9d9f3,#bfe3e0)',
]

function gradientFor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

/** 作品のキービジュアル（無い・読めないときは淡い色の面） */
export function KeyVisualThumb({ src, alt, seed, width = 160, className }: { src: string | null | undefined; alt: string; seed: string; width?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const url = src && !failed ? (getOptimizedImageUrl(src, { width, format: 'webp', quality: 75 }) || src) : null
  return (
    <div className={cn('overflow-hidden rounded-md bg-muted', className)} style={url ? undefined : { background: gradientFor(seed) }}>
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
