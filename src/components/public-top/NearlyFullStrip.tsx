import { formatJstMonthDay } from '@/utils/jstDate'
import { hhmm, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { KeyVisualThumb } from './KeyVisualThumb'
import { SeatBadge } from './SeatBadge'
import { TopSection } from './TopSection'

interface NearlyFullStripProps {
  performances: PublicPerformance[]
  /** 全体トップでは「日時 ・ 組織名 店舗名」 */
  showOrganization?: boolean
  /** 見出しの右の小さな文字 */
  aside?: string
  onSelect: (p: PublicPerformance) => void
}

/** 残りわずか（残席 3 以下または成立間近、日付順の横スクロール）。店舗トップ・全体トップで共通 */
export function NearlyFullStrip({ performances, showOrganization = false, aside = '日付順', onSelect }: NearlyFullStripProps) {
  if (performances.length === 0) return null
  return (
    <TopSection id="nearly-full" title="残りわずか" aside={aside}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scroll-row">
        {performances.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-white text-left hover:bg-muted/40"
          >
            <KeyVisualThumb src={p.key_visual_url} alt={p.title} seed={p.scenario_id} width={300} className="aspect-[3/4] w-full rounded-none" />
            <div className="p-2">
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {formatJstMonthDay(p.date, true)} {hhmm(p.start_time)} ・ {showOrganization && <b className="font-bold text-foreground">{p.organization_name} </b>}{p.store_name}
              </div>
              <div className="truncate text-sm font-bold">{p.title}</div>
              <SeatBadge performance={p} className="mt-0.5" />
            </div>
          </button>
        ))}
      </div>
    </TopSection>
  )
}
