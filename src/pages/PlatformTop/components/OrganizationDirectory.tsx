import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ChipButton } from '@/components/public-top/ChipButton'
import { TopSection } from '@/components/public-top/TopSection'
import { shortPrefecture } from '@/lib/publicStoreName'
import type { PlatformOrganization } from '../hooks/platformTopData'
import { organizationCardPath } from '../utils/organizationCardPath'

interface OrganizationDirectoryProps {
  organizations: PlatformOrganization[]
  prefectures: string[]
  area: string | null
  /** 組織 ID → 今月（今日〜月末）に空きのある公演数 */
  monthOpenings: Map<string, number>
  primaryColor: string
  onAreaChange: (area: string | null) => void
  /**
   * 'private': 「友だちと貸切で遊ぶ」→「参加店舗から選ぶ」で開く貸切用の一覧（2026-10-15 社長指摘）。
   * 見出しを「貸切する店舗を選ぶ」にし、カードの行き先を組織の「貸切できる作品」（/{org}/private-booking-select）にする。
   */
  mode?: 'default' | 'private'
  /** 貸切用の一覧を閉じる（mode='private' のときだけ） */
  onClose?: () => void
}

const SHOWN_STORE_NAMES = 4

/** 参加店舗（エリアのチップと組織カード → 各組織の店舗トップ。貸切用は各組織の貸切できる作品） */
export function OrganizationDirectory({ organizations, prefectures, area, monthOpenings, primaryColor, onAreaChange, mode = 'default', onClose }: OrganizationDirectoryProps) {
  const shown = area ? organizations.filter((o) => o.prefectures.includes(area)) : organizations
  const isPrivate = mode === 'private'
  const aside = isPrivate && onClose
    ? <button type="button" onClick={onClose} className="underline hover:text-foreground">閉じる</button>
    : 'エリアで探す'
  return (
    <TopSection
      id={isPrivate ? 'private-organizations' : 'organizations'}
      title={isPrivate ? '貸切する店舗を選ぶ' : '参加店舗'}
      aside={aside}
      tone={isPrivate ? 'accent' : 'plain'}
    >
      {isPrivate && <p className="mb-2 text-xs text-muted-foreground">店舗を選ぶと、その店舗で貸切できる作品の一覧が開きます。</p>}
      {prefectures.length > 1 && (
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-row">
          <ChipButton selected={!area} primaryColor={primaryColor} onClick={() => onAreaChange(null)}>全国</ChipButton>
          {prefectures.map((p) => (
            <ChipButton key={p} selected={area === p} primaryColor={primaryColor} onClick={() => onAreaChange(p)}>{shortPrefecture(p)}</ChipButton>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {shown.map((o) => {
          const names = o.store_names.slice(0, SHOWN_STORE_NAMES).join('・')
          const more = o.store_count > SHOWN_STORE_NAMES ? ` ほか ${o.store_count} 店舗` : o.store_count > 1 ? ` ${o.store_count} 店舗` : ''
          const openings = monthOpenings.get(o.id) ?? 0
          return (
            <Link key={o.id} to={organizationCardPath(o.slug, mode)} className="flex items-center gap-2.5 rounded-lg border border-border bg-white p-2.5 hover:bg-muted/40">
              {o.logo_url ? (
                <img src={o.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white">{o.name.slice(0, 1)}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{o.name}</div>
                <div className="text-xs text-muted-foreground">{names}{more} ・ {o.scenario_count} 作品</div>
                {!isPrivate && (
                  <div className={openings > 0 ? 'text-xs text-emerald-700' : 'text-xs text-muted-foreground'}>
                    {openings > 0 ? `今月 ${openings} 公演に空きあり` : '今月の空きはありません'}
                  </div>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          )
        })}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">このエリアの参加店舗はまだありません。</p>}
      </div>
    </TopSection>
  )
}
