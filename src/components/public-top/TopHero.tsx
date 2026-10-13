import { getOptimizedImageUrl } from '@/utils/imageUtils'

interface TopHeroProps {
  name: string
  tagline: string
  /** 真ん中のボタンの文字（店舗トップ「店舗とアクセス」、全体トップ「参加店舗」） */
  accessLabel?: string
  backgroundColor: string
  headerImageUrl: string | null
  onFirstTime: () => void
  onAccess: () => void
  onPrivate: () => void
}

const heroButton = 'inline-flex items-center justify-center rounded-md border border-white/40 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20'

/**
 * トップの上の帯（見出し・一言・3 つのボタン）。店舗トップと MMQ 全体トップで共通（見本 Top.dc.html / TopMMQ.dc.html）。
 * 帯の中に検索フォームは置かない（2026-10-14 社長指摘: 探すは下の「空いている公演を探す」の枠で）。
 */
export function TopHero({ name, tagline, accessLabel = '店舗とアクセス', backgroundColor, headerImageUrl, onFirstTime, onAccess, onPrivate }: TopHeroProps) {
  return (
    <section className="relative overflow-hidden text-white" style={{ backgroundColor }}>
      {headerImageUrl && (
        <>
          <img src={getOptimizedImageUrl(headerImageUrl, { width: 1200, format: 'webp', quality: 80 }) || headerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="relative mx-auto max-w-4xl px-3.5 pb-3.5 pt-4 sm:px-4">
        <h1 className="text-xl font-bold leading-snug">{name}</h1>
        <p className="mt-0.5 min-h-[1.25rem] text-sm opacity-85">{tagline}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className={heroButton} onClick={onFirstTime}>はじめての方へ</button>
          <button type="button" className={heroButton} onClick={onAccess}>{accessLabel}</button>
          <button type="button" className={heroButton} onClick={onPrivate}>貸切で遊ぶ</button>
        </div>
      </div>
    </section>
  )
}
