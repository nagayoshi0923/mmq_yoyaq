import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { cn } from '@/lib/utils'

/**
 * 作品カードのキービジュアル（本番 main の ScenarioCard の LazyImage と同じ）。
 * 画面に入ってから読み込み、背景にぼかした同じ画像を敷いて、本体は全体が見えるように収める。
 * 変換に失敗したら元の URL で読み直す。
 */
export function ScenarioCardImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setIsInView(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setIsInView(true)
        observer.disconnect()
      }
    }, { rootMargin: '50px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const original = src ?? undefined
  const optimized = getOptimizedImageUrl(original, { width: 400, format: 'webp', quality: 80 })
  const blurred = getOptimizedImageUrl(original, { width: 100, format: 'webp', quality: 50 })
  const displaySrc = useFallback ? original : optimized
  const displayBg = useFallback ? original : blurred

  const handleError = () => {
    if (!useFallback && original && original !== optimized) setUseFallback(true)
    else setIsLoaded(true)
  }

  return (
    <div ref={ref} className={cn('relative h-full w-full overflow-hidden bg-gray-900', className)}>
      {original && !isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        </div>
      )}
      {isInView && displaySrc ? (
        <>
          <div
            className="absolute inset-0 scale-110"
            style={{ backgroundImage: `url(${displayBg})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(20px) brightness(0.7)' }}
          />
          <img
            src={displaySrc}
            alt={alt}
            loading="lazy"
            className={cn('relative h-full w-full object-contain transition-opacity duration-300', isLoaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => setIsLoaded(true)}
            onError={handleError}
          />
        </>
      ) : !original && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Sparkles className="h-8 w-8 text-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
