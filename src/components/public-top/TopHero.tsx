import { Link } from 'react-router-dom'
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
  /** 「カタログ」の行き先（全体トップは全体カタログ /scenario、店舗トップはその組織の /{org}/catalog） */
  catalogPath: string
}

const heroButton = 'inline-flex items-center justify-center rounded-md border border-white/40 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20'

/**
 * トップの上の帯（見出し・一言・3 つのボタン）。店舗トップと MMQ 全体トップで共通（見本 Top.dc.html / TopMMQ.dc.html）。
 * 帯の中に検索フォームは置かない（2026-10-14 社長指摘: 探すは下の「空いている公演を探す」の枠で）。
 * 2026-10-23（QW-20261023-001、Figma 改善案 611-80）: 「貸切で遊ぶ」の隣に「カタログ」。
 * PC は 4 つを横一列、スマホは 2 列 × 2 行（下段が「貸切で遊ぶ」「カタログ」）。
 */
export function TopHero({ name, tagline, accessLabel = '店舗とアクセス', backgroundColor, headerImageUrl, onFirstTime, onAccess, onPrivate, catalogPath }: TopHeroProps) {
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
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="top-hero-buttons">
          <button type="button" className={heroButton} onClick={onFirstTime}>はじめての方へ</button>
          <button type="button" className={heroButton} onClick={onAccess}>{accessLabel}</button>
          <button type="button" className={heroButton} onClick={onPrivate}>貸切で遊ぶ</button>
          <Link to={catalogPath} className={heroButton}>カタログ</Link>
        </div>
      </div>
    </section>
  )
}
