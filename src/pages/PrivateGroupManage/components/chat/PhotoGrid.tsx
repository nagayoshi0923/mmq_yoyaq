/**
 * 発言の写真。1 枚は大きく、2 枚は横並び、3 枚以上は 2 列の格子。押すと拡大。
 * 2 枚以上は小さい版（長辺 400px、段階 4）を使う。無い写真は元画像を縮めて出す。
 */
import { ImageIcon } from 'lucide-react'
import type { PrivateGroupMessage } from '@/types'
import { photoLayout } from './chatModel'

interface PhotoGridProps {
  messageId: string
  photos: NonNullable<PrivateGroupMessage['photos']>
  urlOf: (messageId: string, position: number, thumb?: boolean) => string | null
  onOpen: (position: number) => void
}

export function PhotoGrid({ messageId, photos, urlOf, onOpen }: PhotoGridProps) {
  const layout = photoLayout(photos.length)
  const first = photos[0]
  // 1 枚のときは写真の縦横に合わせる（極端な形は 3:4〜4:3 に収める）
  const ratio = first?.width && first?.height ? Math.min(4 / 3, Math.max(3 / 4, first.width / first.height)) : 4 / 3
  return (
    <div
      className={`grid gap-0.5 rounded-xl overflow-hidden w-[220px] max-w-full ${layout === 'one' ? 'grid-cols-1' : 'grid-cols-2'}`}
      data-testid="chat-photo-grid"
      data-count={photos.length}
    >
      {photos.map(photo => {
        const url = urlOf(messageId, photo.position, layout !== 'one')
        return (
          <button
            key={photo.position}
            type="button"
            className="relative block bg-muted overflow-hidden"
            style={{ aspectRatio: layout === 'one' ? String(ratio) : '1' }}
            onClick={e => { e.stopPropagation(); onOpen(photo.position) }}
            aria-label={`写真 ${photo.position} 枚目を拡大`}
          >
            {url ? (
              <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-5 h-5" aria-hidden="true" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
