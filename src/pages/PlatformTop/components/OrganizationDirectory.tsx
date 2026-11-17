import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { RenewalSection } from '@/components/renewal/RenewalSection'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { shortPrefecture } from '@/lib/publicStoreName'
import type { PlatformOrganization } from '../hooks/platformTopData'

interface OrganizationDirectoryProps {
  organizations: PlatformOrganization[]
  prefectures: string[]
  area: string | null
  /** 組織 ID → 今月（今日〜月末）に空きのある公演数 */
  monthOpenings: Map<string, number>
  primaryColor?: string
  onAreaChange: (area: string | null) => void
}

/**
 * 地域・組織から探す（刷新版）。地域のチップ（押すと絞る・もう一度押すと全国）と、組織の行（→ 各組織のトップ）。
 * 行は「組織名」「東京・埼玉 6店舗・今月 N 公演に空き」。
 */
export function OrganizationDirectory({ organizations, prefectures, area, monthOpenings, onAreaChange }: OrganizationDirectoryProps) {
  const shown = area ? organizations.filter((o) => o.prefectures.includes(area)) : organizations
  return (
    <RenewalSection id="organizations" title="地域・組織から探す">
      {prefectures.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row" role="group" aria-label="地域">
          {prefectures.map((p) => (
            <RenewalChip key={p} selected={area === p} onClick={() => onAreaChange(area === p ? null : p)}>{shortPrefecture(p)}</RenewalChip>
          ))}
        </div>
      )}
      <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
        {shown.map((o) => {
          const openings = monthOpenings.get(o.id) ?? 0
          const areas = o.prefectures.map(shortPrefecture).join('・')
          return (
            <li key={o.id}>
              <Link to={`/${o.slug}`} className="flex items-center gap-3 py-3.5 hover:bg-white/60">
                {o.logo_url
                  ? <img src={o.logo_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                  : <span className="h-10 w-1.5 shrink-0 bg-[#003437]" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {areas} {o.store_count}店舗・{openings > 0 ? `今月 ${openings} 公演に空き` : '今月の空きはありません'}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )
        })}
        {shown.length === 0 && <li className="py-4 text-sm text-muted-foreground">この地域の参加店舗はまだありません。</li>}
      </ul>
    </RenewalSection>
  )
}
