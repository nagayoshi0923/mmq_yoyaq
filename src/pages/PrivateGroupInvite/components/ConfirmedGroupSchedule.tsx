import type { PrivateGroup } from '@/types'
import { formatJstDateJa } from '@/utils/jstDate'

export function ConfirmedGroupSchedule({ group }: { group: PrivateGroup }) {
  if (group.confirmed_performance_access === 'preview') return <p className="p-3">開催日時・日程調整の状況はグループ参加後に確認できます。</p>
  const performance = group.confirmed_performance
  if (!performance) {
    return group.status === 'confirmed'
      ? <p role="status" className="p-3">確定公演の日時を確認できません。店舗へお問い合わせください。</p>
      : null
  }
  return <section aria-label="確定した開催日時" className="rounded-lg border bg-background p-3 space-y-1">
    <p>確定した開催日時</p>
    <p>{formatJstDateJa(performance.date)} {performance.start_time.slice(0, 5)}〜{performance.end_time.slice(0, 5)}</p>
    {performance.store_name && <p>{performance.store_name}</p>}
    <p className="text-muted-foreground">ご来店はこの日時です。申請時の候補とは異なる場合があります。</p>
  </section>
}
