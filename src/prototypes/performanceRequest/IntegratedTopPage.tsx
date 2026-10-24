/** 現行TOPの表示部品と#1223の新作判定を、そのまま架空データに接続する統合プレビュー。 */
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/layout/Footer'
import { HeaderView } from '@/components/layout/HeaderView'
import { TopHero } from '@/components/public-top/TopHero'
import { NewArrivalsSection } from '@/components/public-top/NewArrivalsSection'
import { ScenarioBrowseSection } from '@/components/public-top/ScenarioBrowseSection'
import { ScenarioCard } from '@/components/public-top/ScenarioCard'
import { pickNewArrivals, newArrivalDateIfNew, matchesCategoryChips } from '@/components/public-top/newArrivals'
import { scenarioBrowseCard, indexUpcoming, type ScenarioCardData } from '@/components/public-top/scenarioCards'
import { PrivateBookingSection, FirstTimeSection } from '@/components/public-top/InfoSections'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { StoreSearchSection } from '@/pages/PublicBookingTop/components/top/StoreSearchSection'
import { PlatformSearchSection } from '@/pages/PlatformTop/components/PlatformSearchSection'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import { datePresetRange, searchPerformances, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { addJstDays } from '@/utils/jstDate'
import { PROTO_ORGANIZATION, findProtoScenario, findProtoStore } from './fixtures'
import { DETAIL_PREVIEW_THEME } from './publicScenarioSnapshot'
import { canRequestPerformance, type PreviewLoadState } from './requestPlacement'
import { detailPreviewPath, previewCatalogRows, previewSchedule, previewToday } from './integratedFixtures'
import { protoPaths } from './routes'

export function IntegratedTopPage({ catalog = false }: { catalog?: boolean }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const scope = params.get('scope') === 'organization' ? 'organization' : 'platform'
  const orgId = scope === 'organization' ? PROTO_ORGANIZATION.id : null
  const primary = scope === 'organization' ? DETAIL_PREVIEW_THEME.primary : '#1f2a2e'
  const today = previewToday()
  const loadState: PreviewLoadState = params.get('load') === 'loading' ? 'loading' : params.get('load') === 'error' ? 'error' : 'ready'
  const { state: search, update } = usePerformanceSearchParams()
  const raw = previewSchedule(params)
  const rows = previewCatalogRows(today).filter((s) => !orgId || s.organizationId === orgId)
  const to = (path: string, newOnly = false) => {
    const p = new URLSearchParams({ scope })
    for (const k of ['load', 'schedule', 'scheduleScenario', 'stores']) if (params.get(k)) p.set(k, params.get(k)!)
    if (newOnly) p.set('genre', '新作')
    return `${path}?${p}`
  }
  const catalogPath = to(protoPaths.catalog())
  const performances: PublicPerformance[] = raw.filter((e) => (!orgId || e.organizationId === orgId) && e.reservationEnabled).map((e, i) => {
    const s = findProtoScenario(e.scenarioId)!
    return { id: `proto-public-${i}`, scenario_id: s.id, scenario_slug: s.id, date: e.date, start_time: e.startTime, end_time: '16:30',
      store_id: e.storeId, store_name: findProtoStore(e.storeId)?.name ?? '架空の店舗', prefecture: '東京都', organization_id: e.organizationId,
      organization_slug: 'proto-org', organization_name: '架空の組織', title: s.title, key_visual_url: s.keyVisualUrl ?? null,
      player_count_min: s.playerMin, player_count_max: s.playerMax, duration_minutes: s.durationMinutes, fee: s.fee,
      available_seats: e.seats, current_participants: s.playerMax - e.seats, reservation_deadline_hours: 0, genres: s.genre ?? [], beginner_friendly: false }
  })
  const upcoming = indexUpcoming(performances, Date.now())
  const cards = rows.map((s) => {
    const events = performances.filter((e) => e.scenario_id === s.id)
    const card = scenarioBrowseCard({ id: s.id, title: s.title, author: s.author, key_visual_url: s.keyVisualUrl ?? null,
      player_count_min: s.playerMin, player_count_max: s.playerMax, duration_minutes: s.durationMinutes, fee: s.fee }, events, detailPreviewPath(s.id, params))
    return { ...card, performance_request_path: canRequestPerformance({ loadState, scenarioId: s.id, organizationId: orgId,
      selectedStoreIds: search.storeIds, events: raw, nowMs: Date.now() }) ? detailPreviewPath(s.id, params, true) : null }
  })
  const newItems = pickNewArrivals(rows, today, catalog ? Infinity : 12).map(({ item, date }) => ({ card: cards.find((c) => c.scenario_id === item.id)!, date }))
  const genres = params.getAll('genre')
  const keyword = params.get('q') ?? ''
  const filtered = rows.filter((s) => matchesCategoryChips(s.genre ?? [], genres, !!newArrivalDateIfNew(s, today)) && s.title.includes(keyword))
  if (genres.includes('新作')) filtered.sort((a, b) => (newArrivalDateIfNew(b, today)?.date ?? '').localeCompare(newArrivalDateIfNew(a, today)?.date ?? ''))
  const toggleGenre = (genre: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev); const values = new Set(next.getAll('genre')); next.delete('genre')
    if (genre) { if (values.has(genre)) values.delete(genre); else values.add(genre); values.forEach((v) => next.append('genre', v)) }
    return next
  })
  const open = (card: ScenarioCardData) => {
    saveScrollPositionForCurrentUrl()
    // 共有の公演検索カードが通常URLを持っていても、架空作品は必ず試作ルートで開く。
    navigate(detailPreviewPath(card.scenario_id, params, card.path === card.performance_request_path))
  }
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  const range = datePresetRange(search.preset, today, search.date)
  const results = searchPerformances(performances, { range, storeIds: search.storeIds, onlyAvailable: search.onlyAvailable }, Date.now())

  return <div className="booking-shell min-h-screen bg-muted/40">
    <HeaderView headerBgColor={primary} displayOrganization={orgId ? { name: '架空の組織（試作）' } : null} user={null} organizationId={null} isStaffOrAdmin={false}
      handlePlatformClick={() => navigate(to(protoPaths.top()))} handleOrgClick={() => navigate(to(protoPaths.top()))}
      handleDashboardClick={() => navigate(protoPaths.admin())} handleMyPageClick={() => navigate(protoPaths.notifications())}
      handleSignOut={() => {}} onSearch={() => {}} onLogin={() => {}} onSignup={() => {}} notification={null} />
    <TopHero name={catalog ? (orgId ? '架空の組織のカタログ' : '全国の作品カタログ') : orgId ? '架空の組織（試作）' : '全国のマーダーミステリー公演を、ここから予約'}
      tagline="表示・受付・公演は安全な試作データです" backgroundColor={primary} headerImageUrl={null}
      accessLabel={orgId ? '店舗とアクセス' : '参加店舗'} onFirstTime={() => scroll('first-time')} onAccess={() => scroll('scenarios')}
      onPrivate={() => scroll('private-booking')} catalogPath={catalogPath} />
    <main className="mx-auto max-w-4xl space-y-3 px-3.5 py-3 sm:px-4 md:py-5">
      <details className="border bg-background p-2 ts-caption"><summary>確認用のデータ・範囲を切り替える</summary>
        <div className="flex flex-wrap gap-2 py-2">
          <Button size="sm" onClick={() => setParams({ scope: 'platform' })}>MMQ全体</Button>
          <Button size="sm" onClick={() => setParams({ scope: 'organization' })}>組織</Button>
          {(['ready', 'loading', 'error'] as const).map((v) => <Button key={v} size="sm" variant="outline" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('load', v); return n })}>{v}</Button>)}
          {['empty', 'scheduled', 'full', 'closed', 'other-org'].map((v) => <Button key={v} size="sm" variant="outline" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('schedule', v); return n })}>{v}</Button>)}
        </div>
      </details>
      {loadState !== 'ready' ? <p role={loadState === 'error' ? 'alert' : 'status'}>{loadState === 'loading' ? '公演日程を読み込み中です…' : '公演日程を取得できませんでした。再読み込みしてご確認ください。'}</p> : null}
      {catalog ? <section className="space-y-3 bg-background p-3">
        <h2 className="ts-label">{genres.includes('新作') ? '新作で絞り込み中（基準日から90日間）' : 'すべての作品'}</h2>
        <div className="flex flex-wrap gap-2">{[null, '新作', 'LARP', 'SF'].map((g) => <Button key={g ?? 'all'} data-chip={g ?? 'すべて'} aria-pressed={g ? genres.includes(g) : genres.length === 0} variant={g ? genres.includes(g) ? 'default' : 'outline' : genres.length === 0 ? 'default' : 'outline'} onClick={() => toggleGenre(g)}>{g ?? 'すべて'}</Button>)}</div>
        <input aria-label="作品名で検索" className="border p-2" value={keyword} onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); n.set('q', e.target.value); return n }, { replace: true })} />
        <p>{filtered.length}件</p><div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="preview-catalog-results">{filtered.map((s) => <ScenarioCard key={s.id} card={cards.find((c) => c.scenario_id === s.id)!} onOpen={open} />)}</div>
        {filtered.length === 0 ? <p>条件に合う作品がありません。</p> : null}
      </section> : <>
        <NewArrivalsSection items={newItems} lead={orgId ? 'この組織の公開作品から、新しい物語を見つけよう' : '全国の公開作品から、新しい物語を見つけよう'} allPath={to(protoPaths.catalog(), true)} onOpen={open} />
        <PrivateBookingSection text="お仲間だけで遊ぶ貸切の申込みは、1人からの開催希望とは別の導線です。" scenariosPath={orgId ? detailPreviewPath('proto-scn-public', params) : undefined} chooseStorePath={orgId ? undefined : detailPreviewPath('proto-scn-public', params)} primaryColor={primary} />
        {orgId ? <StoreSearchSection performances={performances} isLoading={loadState === 'loading'} state={search} onChange={update}
          storeOptions={['proto-store-a', 'proto-store-b', 'proto-store-c'].map((id) => ({ id, label: findProtoStore(id)!.name }))}
          today={today} nowMs={Date.now()} primaryColor={primary} source={{ upcoming, meta: () => undefined }} onOpen={open}
          classicPreview={<p className="ts-caption">試作のカレンダー／リストです。公演の予約・作成はできません。</p>}
          classic={{ organizationId: orgId, allEvents: [], blockedSlots: [], stores: [], scenarios: [], organizationSlug: 'proto-org', organizationName: '架空の組織', privateBookingDeadlineDays: 14, onCardClick: (id) => navigate(detailPreviewPath(id, params)) }} /> : <PlatformSearchSection performances={performances} results={results} range={range} isLoading={loadState === 'loading'} state={search} onChange={update}
          prefectures={[]} today={today} maxDate={addJstDays(today, 90)} markedDates={new Set(performances.map((e) => e.date))} primaryColor={primary}
          source={{ upcoming, meta: () => undefined }} onOpen={open} />}
        <ScenarioBrowseSection scenarios={rows.map((s) => ({ id: s.id, title: s.title, author: s.author, genres: s.genre ?? [], player_count_min: s.playerMin, player_count_max: s.playerMax,
          is_new: !!newArrivalDateIfNew(s, today), is_popular: false, next_date: null, card: cards.find((c) => c.scenario_id === s.id)! }))}
          catalogPath={catalogPath} primaryColor={primary} onOpen={open} />
        <FirstTimeSection faqPath={to(protoPaths.top())} />
      </>}
    </main><Footer minimal />
  </div>
}
