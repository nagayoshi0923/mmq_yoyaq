/**
 * 概要タブ: 作品の写真・作品名・人数・所要時間、希望店舗、申込内容（返事待ち・確定後は BookingSummaryBox）、注意事項への導線。
 */
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import type { PrivateGroup } from '@/types'

interface GroupOverviewTabProps {
  group: PrivateGroup
  title: string
  imageUrl: string | null
  memberCount: number
  playerRange: { min: number | null; max: number | null }
  preferredStoreNames: string[]
  /** 申込内容の箱（申込前は何も出ない） */
  bookingSummary: ReactNode
  onOpenScenario?: () => void
}

function durationText(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `約 ${h} 時間${m ? ` ${m} 分` : ''}` : `約 ${m} 分`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-border last:border-b-0">
      <dt className="w-20 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex-1 min-w-0 text-sm">{children}</dd>
    </div>
  )
}

export function GroupOverviewTab({ group, title, imageUrl, memberCount, playerRange, preferredStoreNames, bookingSummary, onOpenScenario }: GroupOverviewTabProps) {
  const { data: extras } = useQuery({
    queryKey: ['group-page-overview', group.scenario_master_id, group.organization_id],
    enabled: Boolean(group.organization_id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => privateGroupPageReadApi.findGroupOverviewExtras(group.scenario_master_id, group.organization_id),
  })
  const range = playerRange.min && playerRange.max
    ? playerRange.min === playerRange.max ? `${playerRange.min}名で遊ぶ作品` : `${playerRange.min}〜${playerRange.max}名で遊ぶ作品`
    : null
  const duration = durationText(extras?.duration ?? null)
  const slug = extras?.slug ?? null

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-card border border-border rounded-lg p-3 flex gap-3" aria-label="作品">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-20 h-28 shrink-0 rounded-md object-cover bg-muted cursor-pointer" onClick={onOpenScenario} />
        ) : (
          <div className="w-20 h-28 shrink-0 rounded-md bg-muted" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold leading-tight cursor-pointer hover:text-primary" onClick={onOpenScenario}>{title}</h2>
          {group.name && <p className="mt-0.5 text-xs text-muted-foreground">{group.name}</p>}
          <dl className="mt-2">
            <Row label="参加">{memberCount}名{range ? `（${range}）` : ''}</Row>
            {duration && <Row label="所要時間">{duration}</Row>}
            <Row label="希望店舗">{preferredStoreNames.length > 0 ? preferredStoreNames.join('・') : '未設定'}</Row>
          </dl>
        </div>
      </section>

      {bookingSummary}

      <section className="bg-card border border-border rounded-lg p-3" aria-label="注意事項">
        <h2 className="mb-1 text-sm font-bold">注意事項</h2>
        <p className="text-sm text-foreground/80 leading-snug">
          当日は参加人数全員でお越しください。キャンセル料の決まりは店舗ごとに異なります。
        </p>
        {slug && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to={`/${slug}/cancel-policy`} className="text-violet-700 hover:underline">キャンセルポリシー ›</Link>
            <Link to={`/${slug}/faq`} className="text-violet-700 hover:underline">よくある質問 ›</Link>
          </div>
        )}
      </section>
    </div>
  )
}
