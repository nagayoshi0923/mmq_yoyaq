/**
 * 画像カルーセル（スライドショー）コンポーネント
 * シナリオのギャラリー画像をスライド表示
 */
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ImageCarouselProps {
  images: string[]
  className?: string
  autoPlay?: boolean
  autoPlayInterval?: number
  showThumbnails?: boolean
  aspectRatio?: 'square' | 'video' | 'wide'
  onImageClick?: (index: number) => void
}

export function ImageCarousel({
  images,
  className,
  autoPlay = false,
  autoPlayInterval = 5000,
  showThumbnails = true,
  aspectRatio = 'video',
  onImageClick
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    wide: 'aspect-[21/9]'
  }[aspectRatio]

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }, [images.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }, [images.length])

  // 自動再生
  useEffect(() => {
    if (!autoPlay || images.length <= 1) return

    const interval = setInterval(goToNext, autoPlayInterval)
    return () => clearInterval(interval)
  }, [autoPlay, autoPlayInterval, goToNext, images.length])

  // キーボード操作
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious()
      else if (e.key === 'ArrowRight') goToNext()
      else if (e.key === 'Escape') setIsFullscreen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, goToPrevious, goToNext])

  if (images.length === 0) {
    return null
  }

  if (images.length === 1) {
    return (
      <div className={cn('relative overflow-hidden rounded-lg', className)}>
        <div className={aspectRatioClass}>
          <img
            src={images[0]}
            alt="シナリオ画像"
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => onImageClick?.(0)}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('relative overflow-hidden rounded-lg', className)}>
        {/* メイン画像 */}
        <div className={cn('relative', aspectRatioClass)}>
          <img
            src={images[currentIndex]}
            alt={`シナリオ画像 ${currentIndex + 1}`}
            className="w-full h-full object-cover cursor-pointer transition-opacity duration-300"
            onClick={() => setIsFullscreen(true)}
          />

          {/* 左矢印 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
            onClick={(e) => {
              e.stopPropagation()
              goToPrevious()
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          {/* 右矢印 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
            onClick={(e) => {
              e.stopPropagation()
              goToNext()
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>

          {/* インジケーター */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentIndex(index)
                }}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  index === currentIndex
                    ? 'bg-white w-6'
                    : 'bg-white/50 hover:bg-white/75'
                )}
              />
            ))}
          </div>

          {/* カウンター */}
          <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* サムネイル */}
        {showThumbnails && images.length > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {images.map((url, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-all',
                  index === currentIndex
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                <img
                  src={url}
                  alt={`サムネイル ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* フルスクリーンモーダル */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 h-12 w-12"
            onClick={(e) => {
              e.stopPropagation()
              goToPrevious()
            }}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <img
            src={images[currentIndex]}
            alt={`シナリオ画像 ${currentIndex + 1}`}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 h-12 w-12"
            onClick={(e) => {
              e.stopPropagation()
              goToNext()
            }}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
            {currentIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  )
}

