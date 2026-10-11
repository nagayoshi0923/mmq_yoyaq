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

/** 縦横比がこれより横長なら、切り抜かずに枠の中へ全体を収める */
const LANDSCAPE_RATIO = 1.05

/**
 * 作品のキービジュアル（無い・読めないときは淡い色の面）。
 * 比率は崩さない: 縦長・正方形は枠いっぱいに中央で切り抜き（cover）、横長は全体を収めて余白は薄い地色（contain）。
 * 作品ページのキービジュアル（3:4 の枠に全体を収める）と同じく、横長の作品が大きく切れたり伸びたりしないようにする。
 */
export function KeyVisualThumb({ src, alt, seed, width = 160, className }: { src: string | null | undefined; alt: string; seed: string; width?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const [landscape, setLandscape] = useState(false)
  const url = src && !failed ? (getOptimizedImageUrl(src, { width, format: 'webp', quality: 75 }) || src) : null
  return (
    <div className={cn('overflow-hidden rounded-md bg-muted', className)} style={url ? undefined : { background: gradientFor(seed) }}>
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className={cn('h-full w-full object-center', landscape ? 'object-contain' : 'object-cover')}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) setLandscape(img.naturalWidth / img.naturalHeight > LANDSCAPE_RATIO)
          }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
