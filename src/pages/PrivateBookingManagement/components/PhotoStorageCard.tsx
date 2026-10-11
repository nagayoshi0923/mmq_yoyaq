/**
 * 貸切グループ一覧の上の「チャット写真の容量」（社長決定 2026-10-11）。
 * 総容量・今月の増加量・枚数と、サイト全体が 50GB を超えたときの注意。読めないときは何も出さない。
 */
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Images } from 'lucide-react'
import { fetchPhotoStorageUsage } from '@/lib/api/privateGroupPhotoStorageApi'
import { photoStorageView } from '@/lib/photoStorageUsage'

export function PhotoStorageCard() {
  const { data } = useQuery({
    queryKey: ['private-group-photo-storage-usage'],
    queryFn: fetchPhotoStorageUsage,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  if (!data) return null
  const view = photoStorageView(data)
  return (
    <section className="mb-3 rounded-lg border border-border bg-card p-3" aria-label="チャット写真の容量" data-testid="photo-storage-card">
      {view.warning && (
        <p role="alert" className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="photo-storage-warning">
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{view.warning}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <Images className="w-4 h-4 text-muted-foreground" aria-hidden="true" />チャット写真の容量
        </h2>
        <p className="text-sm">
          総容量 <span className="font-bold tabular-nums" data-testid="photo-storage-total">{view.total}</span>
          <span className="mx-2 text-muted-foreground">・</span>
          今月 <span className="font-bold tabular-nums" data-testid="photo-storage-month">{view.month}</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{view.count}</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full ${view.warning ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${Math.max(view.percent, 1)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        注意の目安 {view.limit}{view.siteTotal ? `（サイト全体 ${view.siteTotal}）` : ''}。写真は削除されない限り残ります。
      </p>
    </section>
  )
}
