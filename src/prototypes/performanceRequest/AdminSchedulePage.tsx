/**
 * 管理のスケジュール画面の試作（架空データ）。表の右に「開催リクエスト」のパネルを出す（スマホではタブで切り替え）。
 * 表のセルは既存の公演カード（PerformanceCard）と「公演追加」（EmptySlot）を使う。
 * 本物の ScheduleTable はセルのメモ（SlotMemoInput）が実 API を読み書きするため使わず、同じ並びを組み直している。
 * 開催リクエストは表の公演セルに混ぜない。公演の予約人数・残席は架空の公演の値のまま変えない。
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PerformanceCard } from '@/components/schedule/PerformanceCard'
import { EmptySlot } from '@/components/schedule/EmptySlot'
import { CATEGORY_CONFIG, generateMonthDays, getReservationBadgeClass } from '@/utils/scheduleUtils'
import { getJapaneseHoliday } from '@/utils/japaneseHolidays'
import { allRequests, setStatus } from './actions'
import { PROTO_DEFAULT_MONTH, PROTO_ORGANIZATION, PROTO_EVENTS, PROTO_STORES, findProtoScenario } from './fixtures'
import { buildPerformanceDraft, eventsForSlot, formatMonthLabel, groupRequestsForPanel, type RequestGroup } from './model'
import { PrototypePerformanceDialog } from './PrototypePerformanceDialog'
import { RequestPanel } from './RequestPanel'
import { requestsForSlot, isUnspecifiedRequest, type RequestSlot } from './requestSlots'
import { useProtoState } from './useProtoState'
import type { EventFormData } from '@/types/schedule'

const SLOTS = ['morning', 'afternoon', 'evening'] as const

function toMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function AdminSchedulePage() {
  const [state] = useProtoState()
  const [params] = useSearchParams()
  const organizationId = params.get('organization') === 'proto-other-org' ? 'proto-other-org' : PROTO_ORGANIZATION.id
  const scopedStores = PROTO_STORES.filter((s) => (s.organizationId ?? PROTO_ORGANIZATION.id) === organizationId)
  const [currentDate, setCurrentDate] = useState(() => new Date(`${PROTO_DEFAULT_MONTH}-01T00:00:00`))
  const [storeIds, setStoreIds] = useState<string[]>([])
  const [mobileTab, setMobileTab] = useState<'schedule' | 'requests'>('schedule')
  const [dialog, setDialog] = useState<{ draft: EventFormData; summary: string; slot?: RequestSlot } | null>(null)
  const [placeholderNote, setPlaceholderNote] = useState<string | null>(null)

  const scopedRequests = useMemo(() => allRequests(state.requests).filter((r) => (r.organizationId ?? PROTO_ORGANIZATION.id) === organizationId), [state.requests, organizationId])
  const month = toMonth(currentDate)
  const monthDays = useMemo(() => generateMonthDays(currentDate), [currentDate])
  const stores = storeIds.length === 0 ? scopedStores : scopedStores.filter((s) => storeIds.includes(s.id))
  const groups = useMemo(() => groupRequestsForPanel(scopedRequests, month, storeIds), [scopedRequests, month, storeIds])
  const storeFilterLabel = storeIds.length === 0 ? 'すべての店舗' : stores.map((s) => s.short_name).join('・')
  const requestCount = groups.reduce((sum, g) => sum + g.requestCount, 0)

  const openCreate = (group: RequestGroup) => {
    const scenario = findProtoScenario(group.scenarioId)
    if (!scenario) return
    const eligibleStores = scopedStores.filter((s) => !scenario.availableStoreIds || scenario.availableStoreIds.includes(s.id))
    if (!eligibleStores.length) { setPlaceholderNote('この組織には上演可能な店舗がありません。公演の作成画面は開きません。'); return }
    const draft = buildPerformanceDraft(group, scenario, eligibleStores, month, storeIds)
    const summary = `「${scenario.title}」／希望 ${group.requestCount}件・参加希望 ${group.desiredParticipants}人／候補の月: ${formatMonthLabel(month)}${group.requestedDates.length === 0 ? '（日付の指定なし。曜日の希望から仮の日付を入れています）' : ''}`
    setDialog({ draft, summary })
  }

  const openSlot = (date: string, venue: string, slot: RequestSlot) => {
    const matches = requestsForSlot(scopedRequests, date, venue, slot, organizationId)
    const start = { morning: '10:00', afternoon: '13:00', evening: '19:00' }[slot]
    const draft: EventFormData = { id: '', date, venue, scenario: '', category: 'open', start_time: start,
      end_time: slot === 'morning' ? '14:00' : slot === 'afternoon' ? '16:30' : '22:30', max_participants: 6, capacity: 0, gms: [], gmRoles: {}, notes: '' }
    setDialog({ draft, slot, summary: `${date}／${PROTO_STORES.find((s) => s.id === venue)?.name}／${slot}：該当希望 ${matches.length}件。作品は自動選択しません。` })
  }
  const dialogRequests = dialog ? requestsForSlot(scopedRequests, dialog.draft.date, dialog.draft.venue, dialog.slot ?? 'afternoon', organizationId) : []
  const priorityTitles = [...new Set(dialogRequests.map((r) => findProtoScenario(r.scenarioId)?.title).filter((t): t is string => !!t))]
  const unspecified = groups.flatMap((g) => [...g.dated, ...g.unscheduled]).filter(isUnspecifiedRequest)

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-1.5 text-base font-semibold"><CalendarDays className="h-5 w-5 text-primary" aria-hidden />スケジュール管理（試作）</h1>
          <span className="text-xs text-muted-foreground">{formatMonthLabel(month)}・架空の組織・架空の公演</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <MonthSwitcher value={currentDate} onChange={setCurrentDate} />
          <div className="w-56">
            <StoreMultiSelect stores={scopedStores} selectedStoreIds={storeIds} onStoreIdsChange={setStoreIds} label="店舗" placeholder="すべての店舗" />
          </div>
        </div>
        <div className="flex gap-1 lg:hidden" role="tablist" aria-label="表示の切り替え">
          <button type="button" role="tab" aria-selected={mobileTab === 'schedule'} onClick={() => setMobileTab('schedule')} className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${mobileTab === 'schedule' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>スケジュール</button>
          <button type="button" role="tab" aria-selected={mobileTab === 'requests'} onClick={() => setMobileTab('requests')} className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${mobileTab === 'requests' ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>開催リクエスト（{requestCount}）</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={`${mobileTab === 'schedule' ? '' : 'hidden'} lg:block min-w-0 rounded-lg border bg-background`}>
          <div className="overflow-x-auto" data-testid="proto-schedule-table">
            <Table className="table-fixed w-full border-collapse min-w-[534px]">
              <colgroup>
                <col className="w-[40px]" />
                <col className="w-[44px]" />
                <col /><col /><col />
              </colgroup>
              <TableHeader>
                <TableRow className="bg-muted h-8">
                  <TableHead className="border-r text-xs font-bold text-center !p-0">日付</TableHead>
                  <TableHead className="border-r text-xs font-bold text-center !p-0">会場</TableHead>
                  <TableHead className="border-r text-xs font-bold text-center !p-0">午前</TableHead>
                  <TableHead className="border-r text-xs font-bold text-center !p-0">午後</TableHead>
                  <TableHead className="text-xs font-bold text-center !p-0">夜</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthDays.map((day) => stores.map((store, i) => {
                  const holiday = getJapaneseHoliday(day.date)
                  const red = holiday || day.dayOfWeek === '日'
                  return (
                    <TableRow key={`${day.date}-${store.id}`} className={i === 0 ? 'border-t-2 border-t-slate-400' : ''}>
                      {i === 0 ? (
                        <TableCell rowSpan={stores.length} className={`border-r !p-0 text-center align-top ${red ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`}>
                          <div className="flex flex-col items-center py-2 text-xs"><span className="font-bold">{day.displayDate}</span><span>({day.dayOfWeek})</span></div>
                        </TableCell>
                      ) : null}
                      <TableCell className="border-r !p-0 text-center text-xs font-medium">{store.short_name}</TableCell>
                      {SLOTS.map((slot) => {
                        const events = eventsForSlot(PROTO_EVENTS, day.date, store.id, slot)
                        return (
                          <TableCell key={slot} data-request-cell={`${day.date}:${store.id}:${slot}`} className="border-r !p-0.5 align-top">
                            {events.length > 0 ? events.map((e) => (
                              <PerformanceCard
                                key={e.id}
                                event={e}
                                categoryConfig={CATEGORY_CONFIG}
                                getReservationBadgeClass={getReservationBadgeClass}
                                previewMode
                                onClick={() => setPlaceholderNote(`架空の公演「${e.scenario}」（試作では公演の詳細は開きません）`)}
                              />
                            )) : (
                              <EmptySlot date={day.date} venue={store.id} timeSlot={slot} requestCount={requestsForSlot(scopedRequests, day.date, store.id, slot, organizationId).length} onAddPerformance={openSlot} />
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                }))}
              </TableBody>
            </Table>
          </div>
          {placeholderNote ? <p role="status" className="border-t px-3 py-2 text-xs text-muted-foreground">{placeholderNote}</p> : null}
        </div>

        <div className={`${mobileTab === 'requests' ? '' : 'hidden'} lg:block`}>
          <div className="lg:sticky lg:top-3 lg:max-h-[calc(100vh-24px)] lg:overflow-y-auto">
            <RequestPanel
              month={month}
              groups={groups}
              statuses={state.statuses}
              onStatusChange={setStatus}
              onCreatePerformance={openCreate}
              storeFilterLabel={storeFilterLabel}
            />
          </div>
        </div>
      </div>

      <p className="ts-caption" data-testid="proto-unspecified-note">日付・時間帯に未指定がある希望: {unspecified.length}件。日時未指定は全セルに広げず一覧で確認。店舗指定のない希望は、同組織の上演可能店舗の検討候補として表示します（予約ではありません）。</p>
      <PrototypePerformanceDialog
        organizationId={organizationId}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        draft={dialog?.draft ?? null}
        sourceSummary={dialog?.summary ?? ''}
        initialSlot={dialog?.slot}
        requestedTitles={priorityTitles}
        getRequestedTitles={(date, venue, slot) => [...new Set(requestsForSlot(scopedRequests, date, venue, slot, organizationId).map((r) => findProtoScenario(r.scenarioId)?.title).filter((t): t is string => !!t))]}
      />
    </div>
  )
}
