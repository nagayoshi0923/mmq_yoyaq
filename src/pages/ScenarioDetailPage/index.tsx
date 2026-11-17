import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation/index'
import { PrivateBookingRequest } from '../PrivateBookingRequest/index'
import { usePrivateBookingTabDraft } from './hooks/usePrivateBookingTabDraft'
import { clearPrivateBookingTabDraft } from './privateBookingTabDraft'
import { toJstYmd } from '@/utils/jstDate'
import { PageBar } from '@/components/renewal/PageBar'
import { MMQ_RED, PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { durationLabel } from '@/components/renewal/labels'
import { PRICE_NOTE } from '@/lib/priceNote'
import { buildPublicCancellationPolicyPath } from '@/lib/publicBookingPath'

// 分離された型定義
import { calculateParticipationFee, candidateFeesIfKnown, feeIfHolidayKnown, referenceMinFee } from './utils/pricingUtils'

// 分離されたフック
import { useScenarioDetail } from './hooks/useScenarioDetail'
import { usePrivateBooking } from './hooks/usePrivateBooking'
import { useBookingActions } from './hooks/useBookingActions'
import { knownCustomHoliday, useCustomHolidays } from '@/hooks/useCustomHolidays'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { usePrivateBookingDeadlineDays } from '@/hooks/usePrivateBookingDeadlineDays'

// 分離されたコンポーネント
import { ScenarioHero } from './components/ScenarioHero'
import { WorkScheduleTab } from './components/WorkScheduleTab'
import { WorkPrivateTab } from './components/WorkPrivateTab'
import { ScheduleBookingBar, PrivateRequestBar } from './components/WorkBottomBars'
import { BookingNotice } from './components/BookingNotice'
import { VenueAccess } from './components/VenueAccess'
import { RelatedScenarios } from './components/RelatedScenarios'
import { ScenarioAbout } from './components/ScenarioAbout'
import { PrivateBookingStatusNote } from './components/PrivateBookingStatusNote'
import { useScenarioPrivateBookingStatus } from './hooks/useScenarioPrivateBookingStatus'
import { Footer } from '@/components/layout/Footer'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { isScenarioAcceptingPrivateBooking } from '@/lib/privateBookingAcceptance'
import { usePageMeta } from '@/hooks/usePageMeta'
import { scenarioPageDescription, scenarioPageTitle } from '@/lib/seo'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { parseStoreIdsParam, privateGroupCreatePath } from '@/pages/PrivateBookingStart/paths'

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

type PrivateBookingUrlSlotKey = 'morning' | 'afternoon' | 'evening'

export function ScenarioDetailPage({ scenarioId, onClose, organizationSlug }: ScenarioDetailPageProps) {
  const { user, isStaff, isInitialized } = useAuth()
  const navigate = useNavigate()
  const shouldShowNavigation = isStaff
  const preset = useOrgThemePreset(organizationSlug)
  const heroBgColor = preset.primary
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
  /** ?tab=private&date&store&slot の枠を getTimeSlotsForDate で解決するまで保持 */
  const [privateBookingUrlPending, setPrivateBookingUrlPending] = useState<{
    date: string
    storeId: string
    slotKey: PrivateBookingUrlSlotKey
  } | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  // 公演日程用の店舗フィルタ
  const [scheduleStoreFilter, setScheduleStoreFilter] = useState<string[]>([])

  // データ取得フック（organization_idでフィルタリング）
  const { scenario, events, stores, relatedScenarios, organizationId, organizationName, isLoading, loadScenarioDetail } = useScenarioDetail(scenarioId, organizationSlug)
  const acceptsPrivateBooking = scenario ? isScenarioAcceptingPrivateBooking(scenario) : true
  // 「貸切受付中」の表示（表示中の組織で。貸切募集期間・公演期間も見る。読めない間は出さない）
  const privateStatus = useScenarioPrivateBookingStatus(organizationId, scenario, isLoading ? null : stores)
  const tabsRef = useRef<HTMLDivElement>(null)

  usePageMeta({
    title: scenario ? scenarioPageTitle(scenario.scenario_title) : 'マーダーミステリー公演予約 | MMQ',
    description: scenario
      ? scenarioPageDescription(scenario.scenario_title, scenario.synopsis || scenario.description)
      : undefined,
    canonicalPath: scenario?.slug ? `/scenario/${scenario.slug}` : undefined,
    image: scenario?.key_visual_url,
  })

  // 貸切受付OFFの作品は貸切タブを開かない
  useEffect(() => {
    if (!scenario || isLoading) return
    
    if (!acceptsPrivateBooking && activeTab === 'private') {
      setActiveTab('schedule')
      setPrivateBookingUrlPending(null)
    }
  }, [scenario, isLoading, acceptsPrivateBooking, activeTab])

  // URLがUUIDでシナリオにslugがある場合、slugのURLにリダイレクト
  useEffect(() => {
    if (!scenario || isLoading) return
    
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidPattern.test(scenarioId)
    
    if (isUuid && scenario.slug && scenario.slug !== scenarioId) {
      // クエリパラメータを保持してリダイレクト
      const searchParams = new URLSearchParams(window.location.search)
      const queryString = searchParams.toString()
      const newPath = organizationSlug 
        ? `/${organizationSlug}/scenario/${scenario.slug}${queryString ? '?' + queryString : ''}`
        : `/scenario/${scenario.slug}${queryString ? '?' + queryString : ''}`
      navigate(newPath, { replace: true })
    }
  }, [scenario, scenarioId, organizationSlug, isLoading, navigate])

  useReportRouteScrollRestoration('scenario-detail-page', { isLoading })
  
  // 予約・貸切リクエストアクションフック
  const {
    selectedEventId,
    selectedEvent,
    participantCount,
    showBookingConfirmation,
    showPrivateBookingRequest,
    setSelectedEventId,
    setParticipantCount,
    handleBooking,
    handleBookingComplete,
    handleBackFromBooking,
    handlePrivateBookingRequest,
    handlePrivateBookingComplete,
    handleBackFromPrivateBooking
  } = useBookingActions({ events, onReload: loadScenarioDetail })
  
  // カスタム休日フック（usePrivateBookingより先に呼ぶ必要がある）
  // 公開ページではorganizationSlugから組織IDを取得して休日を取得
  const holidays = useCustomHolidays({ organizationSlug })
  const { isCustomHoliday } = holidays
  // 料金用。独自休日を読み込み中・読み込めなかったときは null（平日の料金を出さない。枠・所要時間には従来どおり isCustomHoliday）
  const priceHoliday = knownCustomHoliday(holidays)
  const feePendingText = holidays.error ? '確認できません' : '確認中'

  // 貸切予約の受付締切（公演日の何日前まで申込可能か）
  const privateBookingDeadlineDays = usePrivateBookingDeadlineDays({ organizationId, organizationSlug, scenarioId: scenario?.scenario_master_id })
  
  // 貸切リクエストロジックフック
  const {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    isNextMonthDisabled,
    isLoadingEvents,
    isAvailabilityReady,
    availabilityError,
    reloadAvailability,
    horizon: privateBookingHorizon,
    slotAvailability,
    monthDates: privateDates,
    showMonthOf,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  } = usePrivateBooking({ events, stores, scenarioId, scenario, organizationId, isCustomHoliday, isActive: activeTab === 'private' })

  // 貸切タブの選択をタブ内で預かり、ログインの入口などから戻ったときに戻す（B29。組織・作品・利用者が同じときだけ）
  const availableStoreIdsForDraft = useMemo(() => availableStores.map((s) => s.id), [availableStores])
  usePrivateBookingTabDraft({
    ready: !!scenario && !isLoading && stores.length > 0 && isInitialized,
    organizationId,
    scenarioMasterId: scenario?.scenario_master_id,
    userId: user?.id ?? null,
    acceptsPrivateBooking,
    availableStoreIds: availableStoreIdsForDraft,
    activeTab,
    setActiveTab,
    selectedTimeSlots,
    setSelectedTimeSlots,
    selectedStoreIds,
    setSelectedStoreIds,
    currentMonth,
    showMonthOf,
  })

  // 貸切グループ作成へ引き継ぐ希望店舗（どの入口のボタンでも同じ。貸切タブで選んでいる店舗のうち、この作品を受け付ける店舗）
  const privateStoreIdsForLinks = useMemo(
    () => selectedStoreIds.filter((id) => availableStores.some((s) => s.id === id)),
    [selectedStoreIds, availableStores]
  )

  const knownPrivateFees = useMemo(() => scenario ? candidateFeesIfKnown(
    scenario.participation_fee, scenario.participation_costs, selectedTimeSlots, priceHoliday,
  ) : [], [scenario, selectedTimeSlots, priceHoliday])
  const privateCandidateFees = knownPrivateFees ?? []

  // 選択されたイベントの日付に応じた参加費を計算
  const calculatedParticipationFee = useMemo(() => {
    if (!scenario) return 0
    
    // 選択されたイベントの日付を取得
    const selectedEvent = selectedEventId ? events.find(e => e.event_id === selectedEventId) : null
    const eventDate = selectedEvent?.date
    
    return calculateParticipationFee(
      scenario.participation_fee,
      scenario.participation_costs,
      eventDate,
      priceHoliday ?? undefined,
      selectedEvent?.start_time
    )
  }, [scenario, selectedEventId, events, priceHoliday])
  // オープン公演の選んだ日の料金が独自休日しだいで変わり、独自休日が分からなければ未確定
  const openFeeUnknownText = scenario && selectedEvent && feeIfHolidayKnown(scenario.participation_fee, scenario.participation_costs, selectedEvent.date, priceHoliday, selectedEvent.start_time) === null ? feePendingText : null

  // 公演日程タブ用の店舗リスト
  // 「公演が実在する店舗（events の store_id）」∪「available_stores（availableStores）」の和集合。
  // available_stores 未登録でも公演がある店舗（例: 埼玉大宮）を候補に含める。
  // available_stores のみに絞ると、公演可能なのに予定がない店舗も残せるため和集合にする。
  // 除外条件（office/非active/一時店舗）は availableStores と同じものを適用する（勝手に足さない・引かない）。
  const scheduleStores = useMemo(() => {
    // events で実際に使われている店舗ID（未紐付け＝出張公演などは除外）
    const eventStoreIds = new Set(
      events.map((e) => e.store_id).filter((id): id is string => !!id)
    )
    // availableStores に既に含まれる店舗ID
    const availableStoreIds = new Set(availableStores.map((s) => s.id))

    return stores.filter((s) =>
      // availableStores と同一の除外条件を維持
      s.ownership_type !== 'office' &&
      s.status === 'active' &&
      !s.is_temporary &&
      // available_stores 由来 または 公演が実在する店舗
      (availableStoreIds.has(s.id) || eventStoreIds.has(s.id))
    )
  }, [stores, events, availableStores])

  // 公演日程タブの店舗フィルタ: 1店舗の場合は自動選択
  // 出張公演など store_id が無い枠があるときは自動選択しない（そのままだと出張が一覧から消える）
  useEffect(() => {
    const hasEventWithoutStore = events.some((e) => !e.store_id)
    if (scheduleStores.length === 1 && scheduleStoreFilter.length === 0 && !hasEventWithoutStore) {
      setScheduleStoreFilter([scheduleStores[0].id])
    }
  }, [scheduleStores, scheduleStoreFilter.length, events])

  /** ?stores= の希望店舗を反映済みか（作品と店舗の組で 1 回だけ） */
  const appliedPreferredStoresRef = useRef('')
  useEffect(() => {
    // URLパラメータを処理
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    const dateParam = urlParams.get('date')
    const storeParam = urlParams.get('store')
    const slotParam = urlParams.get('slot')

    const isUuidLike = (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    
    if (tabParam === 'private' && acceptsPrivateBooking) {
      setActiveTab('private')

      const slotKeys: PrivateBookingUrlSlotKey[] = ['morning', 'afternoon', 'evening']
      // 日付・店舗・枠キーが揃っている場合は店舗だけ即時反映し、実時刻は getTimeSlotsForDate で後段適用
      if (
        dateParam &&
        storeParam &&
        slotParam &&
        /^\d{4}-\d{2}-\d{2}$/.test(dateParam) &&
        slotKeys.includes(slotParam as PrivateBookingUrlSlotKey) &&
        isUuidLike(storeParam) &&
        stores.some((s) => s.id === storeParam)
      ) {
        setSelectedStoreIds([storeParam])
        setPrivateBookingUrlPending({
          date: dateParam,
          storeId: storeParam,
          slotKey: slotParam as PrivateBookingUrlSlotKey,
        })
      } else {
        setPrivateBookingUrlPending(null)
        // 貸切を始めるページで選んだ希望店舗（?stores=ID,ID）。作品ごとに 1 回だけ反映する（あとはお客様の選択を優先）
        const preferred = parseStoreIdsParam(urlParams.get('stores'))
        const appliedKey = `${scenarioId}:${preferred.join(',')}`
        if (preferred.length > 0 && stores.length > 0 && appliedPreferredStoresRef.current !== appliedKey) {
          const valid = preferred.filter((id) => availableStores.some((s) => s.id === id))
          if (valid.length > 0) {
            appliedPreferredStoresRef.current = appliedKey
            setSelectedStoreIds(valid)
          }
        }
      }
    } else {
      setPrivateBookingUrlPending(null)
      if (tabParam === 'private' && !acceptsPrivateBooking) {
        setActiveTab('schedule')
      }
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && events.length > 0) {
      // 公演日程タブ: 指定日付（+時間）に一致するイベントを自動選択
      const timeParam = urlParams.get('time')
      let matchingEvent
      if (timeParam) {
        // 時間パラメータがある場合は日付+時間で一致を探す
        matchingEvent = events.find(e => e.date === dateParam && e.start_time === timeParam)
      }
      // 見つからない場合は日付のみで探す
      if (!matchingEvent) {
        matchingEvent = events.find(e => e.date === dateParam)
      }
      if (matchingEvent) {
        setSelectedEventId(matchingEvent.event_id)
      }
      }
    }
  }, [scenarioId, stores, events, setSelectedStoreIds, setSelectedTimeSlots, setSelectedEventId, acceptsPrivateBooking, availableStores])

  // URL の slot=morning|afternoon|evening を、カレンダーと同じ getTimeSlotsForDate の実時刻に変換して反映
  useEffect(() => {
    if (!privateBookingUrlPending) return
    if (activeTab !== 'private') return
    const { date, storeId, slotKey } = privateBookingUrlPending
    if (selectedStoreIds.length !== 1 || selectedStoreIds[0] !== storeId) return

    const labelByKey: Record<PrivateBookingUrlSlotKey, string> = {
      morning: '午前',
      afternoon: '午後',
      evening: '夜',
    }
    // 空き状況（DB）がその日の分まで読めてから時刻を決める
    showMonthOf(date)
    if (!isAvailabilityReady || !slotAvailability.slotsByDate[date]) return
    const slots = getTimeSlotsForDate(date)
    const found = slots.find((s) => s.label === labelByKey[slotKey])
    setPrivateBookingUrlPending(null)
    if (found) {
      setSelectedTimeSlots([{ date, slot: found }])
    }
  }, [
    privateBookingUrlPending,
    activeTab,
    selectedStoreIds,
    getTimeSlotsForDate,
    setSelectedTimeSlots,
    showMonthOf,
    isAvailabilityReady,
    slotAvailability,
  ])



  // 貸切リクエスト完了時のハンドラ（選択状態をクリア）
  const handlePrivateBookingCompleteWithClear = useCallback(() => {
    clearPrivateBookingTabDraft()
    setSelectedTimeSlots([])
    setSelectedStoreIds([])
    handlePrivateBookingComplete()
  }, [handlePrivateBookingComplete, setSelectedTimeSlots, setSelectedStoreIds])

  // 予約確認画面を表示
  if (showBookingConfirmation && selectedEvent && scenario) {
    return (
      <BookingConfirmation
        eventId={selectedEvent.event_id}
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_master_id}
        storeId={selectedEvent.store_id}
        eventDate={selectedEvent.date}
        startTime={selectedEvent.start_time}
        endTime={selectedEvent.end_time}
        storeName={selectedEvent.store_name}
        storeAddress={selectedEvent.store_address}
        storeColor={selectedEvent.store_color}
        maxParticipants={selectedEvent.max_participants}
        currentParticipants={selectedEvent.current_participants}
        participationFee={calculatedParticipationFee}
        feeUnknownText={openFeeUnknownText}
        initialParticipantCount={participantCount}
        organizationSlug={organizationSlug}
        onBack={handleBackFromBooking}
        onComplete={handleBookingComplete}
      />
    )
  }

  // 貸切リクエスト確認画面を表示
  if (showPrivateBookingRequest && scenario) {
    return (
      <PrivateBookingRequest
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_master_id}
        participationFee={scenario.participation_fee}
        participationCosts={scenario.participation_costs}
        maxParticipants={scenario.player_count_max}
        scenarioDuration={scenario.duration}
        weekendDuration={scenario.weekend_duration ?? null}
        selectedTimeSlots={selectedTimeSlots}
        selectedStoreIds={selectedStoreIds}
        stores={stores}
        organizationSlug={organizationSlug}
        onBack={handleBackFromPrivateBooking}
        onComplete={handlePrivateBookingCompleteWithClear}
        onSubmitted={clearPrivateBookingTabDraft}
      />
    )
  }

  const goBack = () => (onClose ? onClose() : navigate(-1))
  const navBar = shouldShowNavigation && (
    <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
  )

  if (isLoading) {
    return (
      <div className="booking-shell min-h-screen overflow-x-clip bg-white">
        <Header />
        {navBar}
        <PageBar title="作品ページ" onBack={goBack} />
        <div className="aspect-[16/10] w-full animate-pulse bg-gray-200 md:aspect-[16/7]" />
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-5">
          <div className="h-3 w-24 animate-pulse bg-gray-200" />
          <div className="h-7 w-3/4 animate-pulse bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse bg-gray-200" />
          <div className="mt-6 h-11 animate-pulse bg-gray-200" />
          <div className="h-12 animate-pulse bg-gray-100" />
          <div className="h-12 animate-pulse bg-gray-100" />
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="booking-shell min-h-screen overflow-x-clip bg-white">
        <Header />
        {navBar}
        <PageBar title="作品ページ" onBack={goBack} />
        <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
          <p className="text-lg text-muted-foreground">シナリオが見つかりませんでした</p>
          <button type="button" onClick={() => navigate(organizationSlug ? `/${organizationSlug}` : '/')} className="border border-gray-300 px-6 py-2.5 text-sm font-bold">トップへ戻る</button>
        </div>
      </div>
    )
  }

  const todayStr = toJstYmd(new Date())
  const bookingStart = scenario.booking_start_date
  const bookingEnd = scenario.booking_end_date
  const privateOutOfPeriod = !!((bookingStart && todayStr < bookingStart) || (bookingEnd && todayStr > bookingEnd))
  const privateFeeText = knownPrivateFees
    ? `${(privateCandidateFees.length ? Math.min(...privateCandidateFees) : referenceMinFee(scenario.participation_fee, scenario.participation_costs)).toLocaleString()}円${privateCandidateFees.length > 1 && Math.max(...privateCandidateFees) !== Math.min(...privateCandidateFees) ? `〜${Math.max(...privateCandidateFees).toLocaleString()}円` : selectedTimeSlots.length === 0 ? '〜' : ''}`
    : feePendingText
  const privateSummary = [
    `${scenario.player_count_max}人で貸切（この作品の定員）`,
    `1人 ${privateFeeText}`,
    durationLabel(scenario.duration),
  ].filter(Boolean).join('・')
  const globalSlug = scenario.slug || scenarioId
  const showPrivateBar = acceptsPrivateBooking && activeTab === 'private' && !privateOutOfPeriod
  const showScheduleBar = activeTab === 'schedule'

  const openGroupCreate = () => {
    // いま選んでいる希望店舗をグループ作成の初期値にする
    const groupCreateUrl = privateGroupCreatePath({
      scenarioMasterId: scenario.scenario_master_id,
      organizationSlug,
      storeIds: privateStoreIdsForLinks,
      noDates: true,
    })
    if (!user) {
      navigate(loginUrlWithIntent('login', groupCreateUrl, `「${scenario.scenario_title}」の貸切グループ作成`))
      return
    }
    navigate(groupCreateUrl)
  }

  return (
    <div className="booking-shell min-h-screen overflow-x-clip bg-white">
      <Header />
      {navBar}
      <PageBar title="作品ページ" onBack={goBack} />

      <ScenarioHero scenario={scenario} stores={stores} />

      {/* ほかの組織・店舗でも遊べる作品は MMQ 全国の作品紹介へ */}
      <button
        type="button"
        onClick={() => { saveScrollPositionForCurrentUrl(); navigate(`/scenario/${globalSlug}`) }}
        className="block w-full border-y border-red-100 bg-red-50/60 px-4 py-2.5 text-left"
      >
        <span className="block text-2xs text-muted-foreground">ほかの組織・店舗でも遊べます</span>
        <span className="text-sm font-bold" style={{ color: MMQ_RED }}>MMQで、この作品を遊べる全国の店舗を見る ›</span>
      </button>

      <div className="mx-auto max-w-4xl">
        <div className="px-4 pt-4">
          <PrivateBookingStatusNote
            status={privateStatus}
            hasEvents={events.length > 0}
            onOpenPrivate={() => {
              setActiveTab('private')
              tabsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
            }}
          />
        </div>

        {/* 公演に参加する / 貸切で遊ぶ */}
        <div ref={tabsRef} className="scroll-mt-14 px-4 pt-3">
          <div role="tablist" className="flex rounded-full bg-gray-100 p-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'schedule'}
              onClick={() => setActiveTab('schedule')}
              className={`h-10 flex-1 rounded-full text-sm font-bold ${activeTab === 'schedule' ? 'bg-[#111] text-white' : 'text-gray-600'}`}
            >公演に参加する</button>
            {acceptsPrivateBooking && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'private'}
                onClick={() => setActiveTab('private')}
                className={`h-10 flex-1 rounded-full text-sm font-bold ${activeTab === 'private' ? 'text-white' : 'text-gray-600'}`}
                style={activeTab === 'private' ? { backgroundColor: PRIVATE_PURPLE } : undefined}
              >貸切で遊ぶ</button>
            )}
          </div>
        </div>

        <div className="px-4 py-5">
          {activeTab === 'schedule' || !acceptsPrivateBooking ? (
            <WorkScheduleTab
              events={events}
              stores={scheduleStores}
              storeFilter={scheduleStoreFilter}
              onStoreFilterChange={setScheduleStoreFilter}
              selectedEventId={selectedEventId}
              onSelect={setSelectedEventId}
              participantCount={participantCount}
              onParticipantCountChange={setParticipantCount}
              maxParticipants={scenario.player_count_max}
              isCustomHoliday={isCustomHoliday}
              accent={heroBgColor}
            />
          ) : privateOutOfPeriod ? (
            <div className="space-y-1 border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm text-muted-foreground">現在は貸切を募集していません</p>
              <p className="text-xs text-muted-foreground">
                {bookingStart && bookingEnd ? `募集期間: ${bookingStart} 〜 ${bookingEnd}` : bookingEnd ? `募集終了日: ${bookingEnd}` : `募集開始日: ${bookingStart}`}
              </p>
            </div>
          ) : (
            <WorkPrivateTab
              summary={privateSummary}
              stores={availableStores}
              selectedStoreIds={selectedStoreIds}
              onStoreIdsChange={setSelectedStoreIds}
              currentMonth={currentMonth}
              onMonthChange={changeMonth}
              isNextMonthDisabled={isNextMonthDisabled}
              availableDates={privateDates}
              slotAvailability={slotAvailability}
              selectedSlots={selectedTimeSlots}
              onToggle={toggleTimeSlot}
              maxSelections={MAX_SELECTIONS}
              loading={isLoadingEvents}
              availabilityError={availabilityError}
              onRetry={reloadAvailability}
              horizon={privateBookingHorizon}
              deadlineDays={privateBookingDeadlineDays}
              isCustomHoliday={isCustomHoliday}
              onCreateGroup={openGroupCreate}
            />
          )}
        </div>

        {/* 参加の前に（注意事項・キャンセル規定。組織の設定をそのまま出す） */}
        <section className="border-t border-gray-200 px-4 py-6">
          <h2 className="text-lg font-bold">{activeTab === 'private' ? '貸切の前に' : '参加の前に'}</h2>
          <div className={`relative mt-3 ${noticeOpen ? '' : 'max-h-56 overflow-hidden'}`} data-testid="notice-box">
            <BookingNotice
              reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
              hasPreReading={scenario.has_pre_reading}
              mode={activeTab === 'private' ? 'private' : 'schedule'}
              storeId={activeTab === 'schedule' ? selectedEvent?.store_id || null : null}
              eventId={activeTab === 'schedule' ? selectedEventId : null}
              scenarioMasterId={scenario.scenario_master_id}
              organizationSlug={organizationSlug}
            />
            {!noticeOpen && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />}
          </div>
          <button type="button" onClick={() => setNoticeOpen((v) => !v)} className="mt-2 text-sm underline underline-offset-4">
            {noticeOpen ? '閉じる' : '注意事項・キャンセル規定をすべて見る'}
          </button>
          {activeTab === 'schedule' && selectedEventId && (
            <div className="mt-4">
              <VenueAccess events={events} selectedEventId={selectedEventId} mode="schedule" />
            </div>
          )}
          {activeTab === 'private' && selectedStoreIds.length > 0 && (
            <div className="mt-4">
              <VenueAccess selectedStoreIds={selectedStoreIds} stores={availableStores} mode="private" />
            </div>
          )}
          <p className="mt-3 text-2xs text-muted-foreground" data-testid="scenario-price-note">{PRICE_NOTE}</p>
        </section>

        <ScenarioAbout scenario={scenario} stores={stores} />

        <section className="border-t border-gray-200 px-4 py-5">
          <p className="text-sm font-bold">この作品ページは {organizationName || 'この組織'} の予約ページです</p>
          <p className="mt-1 text-xs text-muted-foreground">料金・キャンセル・支払い・問い合わせ先は組織ごとに違います</p>
          <a href={buildPublicCancellationPolicyPath(organizationSlug, null, { scenarioMasterId: scenario.scenario_master_id })} className="mt-2 inline-block text-sm font-bold underline underline-offset-4" style={{ color: heroBgColor }}>
            {organizationName || 'この組織'}の規定を見る ›
          </a>
        </section>

        {relatedScenarios.length > 0 && (
          <div className="border-t border-gray-200 px-4 py-6">
            <RelatedScenarios
              scenarios={relatedScenarios}
              authorName={scenario.author}
              onScenarioClick={(id) => {
                saveScrollPositionForCurrentUrl()
                navigate(organizationSlug ? `/${organizationSlug}/scenario/${id}` : `/scenario-detail/${id}`)
              }}
            />
          </div>
        )}
      </div>

      <Footer organizationSlug={organizationSlug} minimal />
      {/* 下に固定した確認ボタンでフッターが隠れないよう空ける（点検 18） */}
      {(showScheduleBar || showPrivateBar) && <div className="h-32" aria-hidden="true" />}

      {showScheduleBar && (
        <ScheduleBookingBar
          scenarioTitle={scenario.scenario_title}
          selectedEvent={selectedEvent ?? null}
          participantCount={participantCount}
          fee={calculatedParticipationFee}
          feeUnknownText={openFeeUnknownText}
          isLoggedIn={!!user}
          onBooking={handleBooking}
          accent={heroBgColor}
        />
      )}
      {showPrivateBar && (
        <PrivateRequestBar
          count={selectedTimeSlots.length}
          selectedStores={privateStoreIdsForLinks.length}
          totalStores={availableStores.length}
          isLoggedIn={!!user}
          ready={isAvailabilityReady}
          onRequest={() => { void handlePrivateBookingRequest(!!user, `「${scenario.scenario_title}」の貸切リクエスト`) }}
        />
      )}
    </div>
  )
}
