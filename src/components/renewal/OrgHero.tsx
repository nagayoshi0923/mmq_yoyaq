import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { SERIF_HEADING } from './fonts'

interface OrgHeroProps {
  /** 「東京・埼玉 6店舗」 */
  area: string
  name: string
  tagline: string
  imageUrl: string | null
  /** 写真が無いときの地の色（組織の色） */
  color: string
  /** 「公演を探す」 */
  onSearch: () => void
  links: Array<{ label: string; to?: string; onClick?: () => void }>
}

/**
 * 組織トップの上の帯（刷新版）。店内・公演の写真を全面に敷き、下側を暗くして文字を載せる。
 * 地域と店舗数 → 明朝の組織名 → 一言 → 白い「公演を探す」 → 小さな 3 つのリンク。
 */
export function OrgHero({ area, name, tagline, imageUrl, color, onSearch, links }: OrgHeroProps) {
  const src = imageUrl ? getOptimizedImageUrl(imageUrl, { width: 1200, format: 'webp', quality: 80 }) || imageUrl : null
  return (
    <section className="relative overflow-hidden text-white" style={{ backgroundColor: color }}>
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/45 to-black/80" />
      <div className="relative mx-auto max-w-4xl px-4 pb-6 pt-36">
        <p className="text-sm tracking-wider text-white/80">{area}</p>
        <h1 className={cn(SERIF_HEADING, 'mt-2 text-[32px] font-bold leading-tight tracking-wide')}>{name}</h1>
        {tagline && <p className="mt-3 text-sm text-white/85">{tagline}</p>}
        <button
          type="button"
          onClick={onSearch}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-[2px] bg-white text-base font-bold hover:bg-white/90"
          style={{ color }}
        >
          公演を探す
        </button>
        <nav className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85" aria-label="案内">
          {links.map((l) => l.to
            ? <Link key={l.label} to={l.to} className="hover:text-white">{l.label}</Link>
            : <button key={l.label} type="button" onClick={l.onClick} className="hover:text-white">{l.label}</button>)}
        </nav>
      </div>
    </section>
  )
}
