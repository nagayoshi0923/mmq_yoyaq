/** 現行の作品詳細と表示部品を共有する試作。実API・予約・通知には接続しない。 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bell, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HeaderView } from '@/components/layout/HeaderView'
import { ScenarioHeroView } from '@/pages/ScenarioDetailPage/components/ScenarioHeroView'
import { ScenarioAboutView } from '@/pages/ScenarioDetailPage/components/ScenarioAboutView'
import { BookingPanelView } from '@/pages/ScenarioDetailPage/components/BookingPanelView'
import { EventList } from '@/pages/ScenarioDetailPage/components/EventList'
import { StoreSelector } from '@/pages/ScenarioDetailPage/components/StoreSelector'
import type { ScenarioDetail } from '@/pages/ScenarioDetailPage/utils/types'
import { DETAIL_PREVIEW_THEME, PUBLIC_PREVIEW_CHARACTERS } from './publicScenarioSnapshot'
import { BellSubscribe } from './BellSubscribe'
import { RequestForm } from './RequestForm'
import { PROTO_ORGANIZATION, PROTO_SCENARIOS, PROTO_STORES, PROTO_USER_ID, findProtoStore } from './fixtures'
import { describePeriod, type PerformanceRequest } from './model'
import { protoPaths } from './routes'
import { PROTO_STORAGE_SCOPE_LABEL } from './storage'
import { useProtoState } from './useProtoState'
import { canRequestPerformance, type PreviewLoadState } from './requestPlacement'
import { previewSchedule } from './integratedFixtures'

export function CustomerScenarioPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const scenario = PROTO_SCENARIOS.find((s) => s.id === params.get('scenario')) ?? PROTO_SCENARIOS[0]
  const [state] = useProtoState()
  // view は既存の画面内状態キー。開閉で全体のスクロール復元を起動しない。
  const formOpen = params.get('view') === 'request'
  const activeTab = params.get('tab') === 'private' ? 'private' : 'schedule'
  const openedHere = useRef(false)
  const [privateNote, setPrivateNote] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [participantCount, setParticipantCount] = useState(1)
  const storeIds = params.get('stores')?.split(',').filter(Boolean) ?? []
  const setStoreIds = (ids: string[]) => setParams((prev) => { const next = new URLSearchParams(prev); if (ids.length) next.set('stores', ids.join(',')); else next.delete('stores'); return next }, { replace: true })
  const loadState: PreviewLoadState = params.get('load') === 'loading' ? 'loading' : params.get('load') === 'error' ? 'error' : 'ready'
  const targetOrganizationId = scenario.organizationId ?? PROTO_ORGANIZATION.id
  const targetStores = PROTO_STORES.filter((s) => (s.organizationId ?? PROTO_ORGANIZATION.id) === targetOrganizationId)
  const scopeOrganization = params.get('scope') === 'platform' ? null : targetOrganizationId
  const rawEvents = previewSchedule(params)
  const canRequest = canRequestPerformance({ loadState, scenarioId: scenario.id, organizationId: scopeOrganization,
    selectedStoreIds: storeIds, events: rawEvents, nowMs: Date.now() })
  const shownEvents = rawEvents.filter((e) => e.scenarioId === scenario.id && (!scopeOrganization || e.organizationId === scopeOrganization) &&
    (storeIds.length === 0 || storeIds.includes(e.storeId)) && e.published && !e.cancelled && e.category === 'open' && e.reservationEnabled)
    .map((e, i) => ({ event_id: `proto-detail-${i}`, date: e.date, start_time: e.startTime, end_time: '16:30', store_id: e.storeId,
      store_name: findProtoStore(e.storeId)?.name ?? '架空の他組織', store_short_name: findProtoStore(e.storeId)?.short_name ?? '他組織',
      max_participants: scenario.playerMax, current_participants: scenario.playerMax - e.seats, available_seats: e.seats,
      reservation_deadline_hours: 0, is_available: e.seats > 0 }))
  const [submitted, setSubmitted] = useState<PerformanceRequest | null>(null)
  const subscription = state.subscriptions.find((s) => s.scenarioId === scenario.id && s.userId === PROTO_USER_ID)
  const myRequests = state.requests.filter((r) => r.userId === PROTO_USER_ID && r.scenarioId === scenario.id)

  // URLが戻ったときも作品とモーダル状態を一致させる。入力は別作品へ持ち越さない。
  useEffect(() => { setSubmitted(null); setPrivateNote(false); setActionNote('') }, [scenario.id])
  const openForm = () => {
    openedHere.current = true
    setSubmitted(null)
    setParams((prev) => { const next = new URLSearchParams(prev); next.set('view', 'request'); return next })
  }
  const closeForm = () => {
    if (openedHere.current) {
      openedHere.current = false
      navigate(-1)
    } else {
      // 直接URL・再読込から開いた場合は外部ページへ戻さず、同じ作品の詳細に閉じる。
      setParams((prev) => { const next = new URLSearchParams(prev); next.delete('view'); return next }, { replace: true })
    }
  }
  const setTab = (tab: string) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (tab === 'private') next.set('tab', 'private'); else next.delete('tab')
    return next
  }, { replace: true })

  const detail: ScenarioDetail = {
    scenario_master_id: scenario.id, scenario_title: scenario.title, author: scenario.author,
    key_visual_url: scenario.keyVisualUrl, synopsis: scenario.synopsis, genre: scenario.genre ?? ['店舗公演'],
    duration: scenario.durationMinutes, player_count_min: scenario.playerMin, player_count_max: scenario.playerMax,
    participation_fee: scenario.fee, difficulty: 3, has_pre_reading: false,
    available_stores: scenario.availableStoreIds ?? targetStores.map((s) => s.id),
    characters: scenario.id === 'proto-scn-public' ? PUBLIC_PREVIEW_CHARACTERS : undefined,
  }
  const previewOnly = () => setActionNote('試作のため、この操作は本番のアカウント・予約・履歴を変更しません。')

  return (
    <div className="booking-shell min-h-screen bg-background overflow-x-clip">
      <HeaderView headerBgColor={DETAIL_PREVIEW_THEME.primary} displayOrganization={{ name: targetOrganizationId === PROTO_ORGANIZATION.id ? PROTO_ORGANIZATION.name : '架空の別組織（試作）' }}
        user={null} organizationId={null} isStaffOrAdmin={false}
        handlePlatformClick={previewOnly} handleOrgClick={previewOnly} handleDashboardClick={previewOnly}
        handleMyPageClick={previewOnly} handleSignOut={previewOnly} onSearch={previewOnly}
        onLogin={previewOnly} onSignup={previewOnly} notification={null} />
      <div className="text-white relative overflow-hidden" style={{ backgroundColor: DETAIL_PREVIEW_THEME.primary }}>
        <div className="absolute top-0 right-0 w-24 h-24 opacity-20" style={{ background: `radial-gradient(circle at center, ${DETAIL_PREVIEW_THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="container mx-auto max-w-7xl px-4 py-2 relative">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`${protoPaths.top()}?scope=${params.get('scope') === 'platform' ? 'platform' : 'organization'}`)} className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"><ArrowLeft className="w-4 h-4 flex-shrink-0" /><span>戻る</span></Button>
            <div className="h-4 w-px bg-white/30" /><span className="text-sm text-white/80">シナリオ詳細</span>
          </div>
        </div>
      </div>
      <div className="container mx-auto max-w-7xl px-4 py-3">
        <details className="mb-3 ts-caption">
          <summary>表示見本の作品を切り替える</summary>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="架空の作品を切り替える">
            {PROTO_SCENARIOS.map((s) => <Button key={s.id} variant={s.id === scenario.id ? 'default' : 'outline'} size="sm" onClick={() => { openedHere.current = false; setParams({ scenario: s.id }) }}>{s.title}</Button>)}
          </div>
        </details>
        {actionNote ? <p role="status" className="mb-3 ts-caption">{actionNote}</p> : null}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4" data-testid="scenario-detail-columns">
          <div className="md:col-span-7 space-y-4" data-testid="scenario-detail-information">
            <ScenarioHeroView scenario={detail} availableStoreNames={targetStores.filter((s) => !scenario.availableStoreIds || scenario.availableStoreIds.includes(s.id)).map((s) => s.name)}
              showPrivateBookingCta scenarioIsFavorite={false} isPlayed={false} isCheckingPlayed={false} isTogglingPlayed={false}
              onPlayedClick={previewOnly} onFavoriteClick={previewOnly} onPrivateBookingClick={() => { setTab('private'); setPrivateNote(true) }}
              onOfficialSiteClick={previewOnly} onShareClick={previewOnly}>
              <div className="px-3 pb-3"><BellSubscribe scenario={scenario} subscription={subscription} /></div>
            </ScenarioHeroView>
            <ScenarioAboutView key={scenario.id} scenario={detail} preset={DETAIL_PREVIEW_THEME} />
          </div>
          <div className="md:col-span-5" data-testid="scenario-detail-booking">
            <div className="md:sticky md:top-[50px] space-y-3">
              <Tabs value={activeTab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-2">
                  <TabsTrigger value="schedule" className="text-sm py-1.5">公演日程</TabsTrigger>
                  <TabsTrigger value="private" className="text-sm py-1.5">貸切リクエスト</TabsTrigger>
                </TabsList>
                <TabsContent value="schedule">
                  <div className="space-y-4">
                    <StoreSelector stores={targetStores} selectedStoreIds={storeIds} onStoreIdsChange={setStoreIds} label="店舗で絞り込み" placeholder="店舗を選択" />
                    <div><h3 className="ts-label">日付を選択</h3><EventList events={shownEvents} selectedEventId={null} scenarioTitle={scenario.title} onEventSelect={previewOnly} minParticipants={scenario.playerMin}
                      loadState={loadState} emptyAction={canRequest ? <Button type="button" className="w-full gap-2" onClick={openForm} style={{ backgroundColor: DETAIL_PREVIEW_THEME.primary }}><UserPlus className="w-4 h-4" />公演をリクエストする</Button> : undefined} /></div>

                  </div>
                </TabsContent>
                <TabsContent value="private">
                  <div className="p-3 bg-purple-50 border border-purple-200 space-y-3">
                    <p className="ts-body text-purple-800">日程やメンバーが決まっていない場合</p>
                    <Button variant="outline" className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100 whitespace-normal h-auto min-h-11" onClick={() => setPrivateNote(true)}>まずはメンバーを招待して貸切グループを作成</Button>
                    <p className="ts-caption">お仲間だけで遊ぶ貸切の申込みです。1人からのオープン公演の開催希望とは別です。</p>
                    <Button variant="outline" onClick={() => setPrivateNote(true)}>貸切で遊ぶ</Button>
                    {privateNote ? <p role="status" className="ts-caption">試作では貸切の申込画面へ進みません。実予約・公演作成・通知は行いません。</p> : null}
                  </div>
                </TabsContent>
              </Tabs>
              {activeTab === 'schedule' ? <BookingPanelView participantCount={participantCount} participationFee={scenario.fee}
                selectedEventId={null} isLoggedIn={false} events={[]} onParticipantCountChange={setParticipantCount}
                onBookingClick={previewOnly} onSignupClick={previewOnly} selectableMax={scenario.playerMax}
                availableSeats={scenario.playerMax} selectedEvent={null} maxParticipants={scenario.playerMax}
                isWeekendOrHolidayDate={false} preset={DETAIL_PREVIEW_THEME}
                notice={<p className="ts-caption">表示中の日程・受付状況は試作の見本です。本番への予約はできません。</p>} /> : null}
              {submitted ? <div role="status" className="space-y-1 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900" data-testid="proto-request-done">
                <p>リクエストをこのブラウザに保存しました（試作）</p>
                <p>予約ではありません。お席は確保されていません。公演が公開されたら別途ご予約ください。</p>
                <p className="ts-caption">保存は{PROTO_STORAGE_SCOPE_LABEL}です。店舗やサーバーには送っていません。</p>
                <Link className="underline" to={protoPaths.admin()}>管理: スケジュールの開催リクエストを見る</Link>
              </div> : null}
              {myRequests.length > 0 ? <section className="space-y-2 rounded-lg border bg-background p-4">
                <h2 className="ts-label">この作品へのあなたのリクエスト（このブラウザに保存）</h2>
                <ul>{myRequests.map((r) => <li key={r.id} className="ts-caption">{r.storeIds.length ? r.storeIds.map((id) => findProtoStore(id)?.short_name ?? id).join('・') : '店舗指定なし'}／{r.participants}人／{describePeriod(r)}</li>)}</ul>
              </section> : null}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent size="md" className="[&>button:last-child]:hidden" aria-describedby={undefined} data-testid="proto-request-dialog">
          <DialogTitle className="sr-only">公演をリクエスト：{scenario.title}</DialogTitle>
          <p className="ts-caption">{scopeOrganization ? 'この組織の公演の開催希望' : 'MMQ全体から開いた開催希望'}／選択中の作品: {scenario.title}</p>
          {canRequest ? <RequestForm inDialog key={`${scenario.id}:${location.key}`} scenario={scenario} organizationId={targetOrganizationId}
            onCancel={closeForm} onSubmitted={(r) => { setSubmitted(r); closeForm() }} /> : <div><p role="alert">{loadState === 'ready' ? '対象の店舗には公演が設定されています。公演日程をご確認ください。' : '公演日程を確認できるまで開催希望を送れません。'}</p><Button onClick={closeForm}>閉じる</Button></div>}
        </DialogContent>
      </Dialog>
      <footer className="border-t px-4 py-6 ts-caption"><div className="container mx-auto max-w-7xl flex flex-wrap gap-4"><span>MMQ</span><Link to={protoPaths.notifications()} className="flex items-center gap-1"><Bell className="w-4 h-4" />試作の通知一覧</Link></div></footer>
    </div>
  )
}
