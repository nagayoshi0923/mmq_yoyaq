import { ChevronRight } from 'lucide-react'
import { formatJstMonthDay } from '@/utils/jstDate'
import { formatDurationJa, formatPlayersJa, hhmm, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { KeyVisualThumb } from './KeyVisualThumb'
import { SeatBadge, SoftTag } from './SeatBadge'

interface PerformanceResultCardProps {
  performance: PublicPerformance
  /** 全体トップでは組織名も出す */
  showOrganization?: boolean
  onSelect: (performance: PublicPerformance) => void
}

/** 「空いている公演を探す」の結果 1 件（押すと作品ページを公演・人数を選んだ状態で開く） */
export function PerformanceResultCard({ performance: p, showOrganization = false, onSelect }: PerformanceResultCardProps) {
  const time = p.end_time ? `${hhmm(p.start_time)}〜${hhmm(p.end_time)}` : hhmm(p.start_time)
  const facts = [
    formatPlayersJa(p.player_count_min, p.player_count_max),
    formatDurationJa(p.duration_minutes),
    p.fee !== null ? `¥${p.fee.toLocaleString('ja-JP')}` : '',
  ].filter(Boolean).join('・')
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className="flex w-full min-w-0 items-stretch gap-2.5 rounded-lg border border-border bg-white p-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <KeyVisualThumb src={p.key_visual_url} alt={p.title} seed={p.scenario_id} width={120} className="h-[76px] w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        {/* 日時と場所。場所（組織名・店舗名）は切らずに 2 行まで折り返す */}
        <div className="line-clamp-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">{formatJstMonthDay(p.date, true)} {time}</span> ・ {showOrganization && <b className="font-bold text-foreground">{p.organization_name} </b>}{p.store_name}
        </div>
        <div className="truncate text-base font-bold leading-snug">{p.title}</div>
        {facts && <div className="text-xs text-muted-foreground">{facts}</div>}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <SeatBadge performance={p} />
          {p.beginner_friendly && <SoftTag>初心者OK</SoftTag>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground" aria-hidden />
    </button>
  )
}
