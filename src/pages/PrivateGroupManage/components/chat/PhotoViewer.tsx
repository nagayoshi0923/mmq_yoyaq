/**
 * 写真の拡大表示。左右で切り替え、保存ボタンで端末に保存する。
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { savePhoto } from './chatDom'

export interface ViewerPhoto {
  url: string | null
  label?: string
}

interface PhotoViewerProps {
  photos: ViewerPhoto[]
  startIndex: number
  onClose: () => void
}

export function PhotoViewer({ photos, startIndex, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(startIndex)
  const [touchX, setTouchX] = useState<number | null>(null)
  const count = photos.length
  const go = useCallback((delta: number) => setIndex(i => (i + delta + count) % count), [count])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])
  const photo = photos[index]
  if (!photo) return null
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="写真"
      data-testid="photo-viewer"
      onTouchStart={e => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={e => {
        const end = e.changedTouches[0]?.clientX
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 50 && count > 1) go(end < touchX ? 1 : -1)
        setTouchX(null)
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10" aria-label="閉じる">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <span className="text-sm">{count > 1 ? `${index + 1} / ${count}` : ''}{photo.label ? `　${photo.label}` : ''}</span>
        <button
          type="button"
          onClick={() => photo.url && void savePhoto(photo.url, `photo-${index + 1}.jpg`)}
          disabled={!photo.url}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
          aria-label="写真を保存"
          data-testid="photo-viewer-save"
        >
          <Download className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 relative flex items-center justify-center" onClick={onClose}>
        {photo.url ? (
          <img src={photo.url} alt="" className="max-w-full max-h-full object-contain select-none" onClick={e => e.stopPropagation()} draggable={false} />
        ) : (
          <span className="text-white/70 text-sm">読み込み中…</span>
        )}
        {count > 1 && (
          <>
            <button type="button" onClick={e => { e.stopPropagation(); go(-1) }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center" aria-label="前の写真">
              <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); go(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center" aria-label="次の写真">
              <ChevronRight className="w-6 h-6" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
