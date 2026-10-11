import { getOptimizedImageUrl } from '@/utils/imageUtils'

interface StoreHeroProps {
  name: string
  tagline: string
  backgroundColor: string
  headerImageUrl: string | null
  onFirstTime: () => void
  onAccess: () => void
  onPrivate: () => void
}

const heroButton = 'inline-flex items-center justify-center rounded-md border border-white/40 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20'

/** 店舗トップの上の帯（組織名・一言・3 つのボタン） */
export function StoreHero({ name, tagline, backgroundColor, headerImageUrl, onFirstTime, onAccess, onPrivate }: StoreHeroProps) {
  return (
    <section className="relative overflow-hidden text-white" style={{ backgroundColor }}>
      {headerImageUrl && (
        <>
          <img src={getOptimizedImageUrl(headerImageUrl, { width: 1200, format: 'webp', quality: 80 }) || headerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="relative mx-auto max-w-4xl px-4 pb-3.5 pt-4">
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="mt-0.5 text-sm opacity-85">{tagline}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className={heroButton} onClick={onFirstTime}>はじめての方へ</button>
          <button type="button" className={heroButton} onClick={onAccess}>店舗とアクセス</button>
          <button type="button" className={heroButton} onClick={onPrivate}>貸切で遊ぶ</button>
        </div>
      </div>
    </section>
  )
}
