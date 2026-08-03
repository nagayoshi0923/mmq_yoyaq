import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Phone, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { storeDashboardApi, type StoreDashboardData } from '@/lib/api/storeDashboardApi'
import { StaffCheckinBubble } from '@/components/store/StaffCheckinBubble'
import { LoadingScreen } from '@/components/layout/LoadingScreen'
import { useAuth } from '@/contexts/AuthContext'
import { EVENT_STATUS } from '@/constants/game'

const STORE_KEY = 'mmq_store_dashboard_selected_store'

function isCancelledEvent(event: { is_cancelled?: boolean; status?: string }) {
  return event.is_cancelled === true || event.status === EVENT_STATUS.CANCELLED
}

export function StoreDashboard() {
  const { isStaff } = useAuth()
  const [data, setData] = useState<StoreDashboardData | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState(() => localStorage.getItem(STORE_KEY) ?? '')
  const [openEventIds, setOpenEventIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const load = async (storeId?: string) => {
    try { setError(null); setData(await storeDashboardApi.get(storeId)) } catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました') }
  }
  useEffect(() => { load(selectedStoreId || undefined) }, [selectedStoreId])
  if (!isStaff) return <div className="p-8">スタッフ権限が必要です。</div>
  if (error) return <div className="p-8 text-destructive">{error}</div>
  if (!data) return <LoadingScreen message="店舗ダッシュボードを読み込み中..." />
  const store = data.stores.find(s => s.id === data.selected_store_id) ?? data.stores[0]
  const countableEvents = data.events.filter(event => !isCancelledEvent(event))
  const reservationCount = countableEvents.reduce((sum, e) => sum + e.reservations.reduce((n: number, r: any) => n + (r.participant_count ?? 0), 0), 0)
  const revenue = countableEvents.reduce((sum, e) => sum + e.reservations.reduce((n: number, r: any) => n + (r.final_price ?? r.total_price ?? 0), 0), 0)
  const checkedStaff = data.gm_status.filter(s => s.checkin).length
  const handleStoreChange = (id: string) => { localStorage.setItem(STORE_KEY, id); setOpenEventIds(new Set()); setSelectedStoreId(id) }
  const handleCustomerCheckin = async (reservationId: string) => { await storeDashboardApi.action({ action: 'customer_checkin', reservation_id: reservationId }); await load(data.selected_store_id ?? undefined) }
  const handleStaffCheckin = (staffId: string) => {
    setOpenEventIds(previous => {
      const next = new Set(previous)
      for (const event of data.events) {
        if (event.assigned_staff?.some((staff: any) => staff.id === staffId)) next.add(event.id)
      }
      return next
    })
  }
  return (
    <div className="min-h-full bg-muted/20 px-4 py-7 md:px-10">
      <header className="flex items-center gap-4">
        <label className="relative flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2 text-indigo-600">
          <span className="text-2xl font-bold">{store?.name ?? '店舗未選択'}</span><ChevronDown className="h-4 w-4" />
          <select aria-label="店舗切替" value={data.selected_store_id ?? ''} onChange={e => handleStoreChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
            {data.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <span className="flex-1 text-lg font-medium text-foreground">{formatJapaneseDate(data.date)}</span>
        <span className="rounded-lg border bg-white px-3 py-2 text-xs text-muted-foreground">店舗代表アカウント</span>
      </header>
      <section className="mt-5 grid gap-4 md:grid-cols-4">
        <Stat label="本日の公演" value={`${data.events.length}件`} /><Stat label="来客予定" value={`${reservationCount}名`} /><Stat label="出勤GM" value={`${checkedStaff}/${data.gm_status.length}名 打刻済み`} /><Stat label="本日の売上見込み" value={`¥${revenue.toLocaleString()}`} />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b px-5 py-4 text-base font-bold">本日の公演・来客予定</div>
          {data.events.length === 0 && <p className="p-8 text-sm text-muted-foreground">本日の公演はありません。</p>}
          {data.events.map(event => <EventSection key={event.id} event={event} isOpen={openEventIds.has(event.id)} onToggle={() => setOpenEventIds(previous => {
            const next = new Set(previous)
            if (next.has(event.id)) next.delete(event.id)
            else next.add(event.id)
            return next
          })} onCheckin={handleCustomerCheckin} />)}
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl border bg-white"><h2 className="border-b px-4 py-3 text-sm font-bold">本日のGM出勤状況</h2>{data.gm_status.map((s: any) => <div key={s.id} className="flex items-center justify-between border-b px-4 py-3 last:border-0"><div><p className="text-sm font-medium">{s.display_name || s.name}</p><p className="text-xs text-muted-foreground">{s.checkin ? `${new Date(s.checkin.checked_in_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 打刻済み` : '未打刻'}</p></div><span className={`h-3 w-3 rounded-full ${s.checkin ? 'bg-emerald-500' : 'bg-amber-400'}`} /> </div>)}</section>
          <section className="rounded-2xl border bg-white"><h2 className="border-b px-4 py-3 text-sm font-bold">店舗連絡</h2><p className="whitespace-pre-wrap px-4 py-4 text-sm text-muted-foreground">{store?.notes || '店舗連絡メモはありません。'}</p></section>
        </aside>
      </div>
      <StaffCheckinBubble onStaffCheckin={handleStaffCheckin} />
    </div>
  )
}

function EventSection({ event, isOpen, onToggle, onCheckin }: { event: any; isOpen: boolean; onToggle: () => void; onCheckin: (id: string) => Promise<void> }) {
  const isCancelled = isCancelledEvent(event)
  const statusBadge = isCancelled
    ? { label: '中止', variant: 'cancelled' as const }
    : event.status === EVENT_STATUS.COMPLETED
      ? { label: '終了', variant: 'success' as const }
      : { label: '受付中', variant: 'success' as const }

  return <div>
    <button type="button" className={`flex w-full items-center gap-4 px-5 py-3 text-left ${isCancelled ? 'bg-muted/60 hover:bg-muted' : 'bg-indigo-50/60 hover:bg-indigo-100/60'}`} onClick={onToggle} aria-expanded={isOpen}>
      <span className={`flex w-4 shrink-0 justify-center text-lg font-bold ${isCancelled ? 'text-muted-foreground' : 'text-indigo-600'}`} aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
      <span className={`rounded-lg px-3 py-2 text-sm font-bold ${isCancelled ? 'bg-muted text-muted-foreground line-through' : 'bg-indigo-100 text-indigo-600'}`}>{event.start_time.slice(0, 5)}〜{event.end_time.slice(0, 5)}</span>
      <span className="flex-1"><span className={`block text-sm font-semibold ${isCancelled ? 'text-muted-foreground line-through' : ''}`}>{event.scenario}</span><span className="block text-xs text-muted-foreground">予約 {event.reservations.reduce((n: number, r: any) => n + r.participant_count, 0)}/{event.capacity ?? event.max_participants ?? '—'}名 ・ GM: {event.gms?.join('、') || '未定'}</span></span>
      <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
    </button>
    {isOpen && <div className="space-y-1 px-5 py-2">{event.reservations.map((r: any) => <CustomerRow key={r.id} reservation={r} onCheckin={onCheckin} />)}</div>}
  </div>
}

function CustomerRow({ reservation, onCheckin }: { reservation: any; onCheckin: (id: string) => Promise<void> }) {
  const repeat = reservation.visit_count > 1
  return <div className="flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{reservation.customer_name}（{reservation.participant_count}名）</span><Badge variant={repeat ? 'secondary' : 'warning'}>{repeat ? 'リピーター' : '初参加'}</Badge><Badge variant="secondary">クーポン {reservation.coupon_count}枚</Badge></div><div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span><Phone className="mr-1 inline h-3 w-3" />{reservation.customer_phone || '電話番号なし'}</span><span><Mail className="mr-1 inline h-3 w-3" />{reservation.customer_email || 'メールなし'}</span><a href={`/customer-management?customerId=${encodeURIComponent(reservation.customer_id ?? '')}`} className="text-indigo-600 underline">顧客詳細 <ExternalLink className="inline h-3 w-3" /></a></div></div><Button size="sm" variant={reservation.status === 'checked_in' ? 'default' : 'outline'} className={reservation.status === 'checked_in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'h-10 px-4'} onClick={() => onCheckin(reservation.id)} disabled={reservation.status === 'checked_in'}>{reservation.status === 'checked_in' ? <><Check className="mr-1 h-4 w-4" />チェックイン済み</> : 'チェックイン'}</Button></div>
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white px-5 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div> }
function formatJapaneseDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(`${value}T00:00:00+09:00`)) }
