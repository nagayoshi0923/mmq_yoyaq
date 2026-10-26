import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ArrowLeft, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation/index'
import { PrivateBookingRequest } from '../PrivateBookingRequest/index'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { formatJstDateJa, toJstYmd } from '@/utils/jstDate'

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
import { EventList } from './components/EventList'
import { PrivateBookingForm } from './components/PrivateBookingForm'
import { BookingPanel } from './components/BookingPanel'
import { PrivateBookingPanel } from './components/PrivateBookingPanel'
import { VenueAccess } from './components/VenueAccess'
import { RelatedScenarios } from './components/RelatedScenarios'
import { StoreSelector } from './components/StoreSelector'
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
import { takePrivateBookingLoginDraft, type PrivateBookingDraftSlot } from '@/lib/privateBookingLoginDraft'
import { availableSlotsForDate } from '@/lib/candidateSlotAvailability'
import { showToast } from '@/utils/toast'
import { parseStoreIdsParam, privateGroupCreatePath } from '@/pages/PrivateBookingStart/paths'

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

type PrivateBookingUrlSlotKey = 'morning' | 'afternoon' | 'evening'

/** 表示中の作品データが URL の作品（slug または ID）のものか。作品を移った直後の古いデータで動かないため */
function scenarioMatchesRoute(scenario: { slug?: string; scenario_master_id: string; org_scenario_id?: string }, routeId: string): boolean {
  return scenario.slug === routeId || scenario.scenario_master_id === routeId || scenario.org_scenario_id === routeId
}

export function ScenarioDetailPage({ scenarioId, onClose, organizationSlug }: ScenarioDetailPageProps) {
  const { user, isStaff } = useAuth()
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
  const [showStickyInfo, setShowStickyInfo] = useState(false)
  // 公演日程用の店舗フィルタ
  const [scheduleStoreFilter, setScheduleStoreFilter] = useState<string[]>([])
  
  // スクロール検知（600px以上スクロールしたらスティッキー情報を表示）
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyInfo(window.scrollY > 600)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  // データ取得フック（organization_idでフィルタリング）
  const { scenario, events, stores, relatedScenarios, organizationId, isLoading, loadScenarioDetail } = useScenarioDetail(scenarioId, organizationSlug)
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

  /** ログイン・プロフィール登録から戻って、預けた貸切の選択を戻した作品ページのパス（作品ごとに数え直す。QW-20261023-001） */
  const loginDraftAppliedPathRef = useRef<string | null>(null)
  /** 戻した選択で貸切リクエストの確認画面を開く予定（その作品の最新の空き判定が出てから開く） */
  const [pendingOpenPrivateRequest, setPendingOpenPrivateRequest] = useState<{
    pathname: string
    scenarioId: string
    slots: PrivateBookingDraftSlot[]
  } | null>(null)
  const openedPendingRef = useRef<object | null>(null)

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
      // ログインから戻って預けた選択を戻した後は、URL の事前選択で上書きしない
      if (loginDraftAppliedPathRef.current === window.location.pathname) return

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

  // ログイン（またはプロフィール登録）から作品ページへ戻ったら、預けておいた候補日時・店舗を戻す（QW-20261023-001）。
  // 安全側の決まり: 受付の範囲を広げない（無効な店舗を「全店舗」に戻さない）。
  // 預かりは 1 回で消す（再読み込み・戻る・StrictMode の 2 回目では何もしない）。別の作品・30 分より古い預かりは使わない。
  useEffect(() => {
    const pathname = window.location.pathname
    if (loginDraftAppliedPathRef.current === pathname || !user || !scenario || isLoading || stores.length === 0) return
    // 作品を移った直後に前の作品のデータが残っている間は触らない
    if (!scenarioMatchesRoute(scenario, scenarioId)) return
    if (!acceptsPrivateBooking) {
      const stale = takePrivateBookingLoginDraft(pathname)
      if (stale) {
        loginDraftAppliedPathRef.current = pathname
        showToast.warning('この作品は現在、貸切リクエストを受け付けていません')
      }
      return
    }
    const draft = takePrivateBookingLoginDraft(pathname)
    if (!draft) return
    loginDraftAppliedPathRef.current = pathname
    setPrivateBookingUrlPending(null)
    setActiveTab('private')
    const validStoreIds = draft.storeIds.filter((id) => availableStores.some((s) => s.id === id))
    const droppedStores = draft.storeIds.length - validStoreIds.length
    // 有効な店舗が無ければ未選択にする（初期の「全店舗」を残さない）
    setSelectedStoreIds(validStoreIds)
    setSelectedTimeSlots(draft.timeSlots)
    if (draft.timeSlots[0]) showMonthOf(draft.timeSlots[0].date)
    if (validStoreIds.length === 0) {
      showToast.warning('選んでいた店舗は現在選べません。希望店舗を選び直してください')
      return
    }
    if (droppedStores > 0) {
      // 選択が変わったので確認画面は開かず、作品ページで確かめてもらう
      showToast.warning(`選べなくなった店舗 ${droppedStores} 件を外しました。候補を確認して「貸切リクエスト」を押してください`)
      return
    }
    if (draft.openRequest && draft.timeSlots.length > 0) {
      setPendingOpenPrivateRequest({ pathname, scenarioId, slots: draft.timeSlots })
    }
  }, [user, scenario, scenarioId, isLoading, stores.length, acceptsPrivateBooking, availableStores, setSelectedStoreIds, setSelectedTimeSlots, showMonthOf])

  // 戻した店舗・月の最新の空き判定が出てから、預けた候補がすべて選べると確かめられたときだけ確認画面を開く。
  // 確かめられない（別の月にまたがる・読み取り失敗・作品を移った）ときは開かず、作品ページの選択で止める。
  useEffect(() => {
    const pending = pendingOpenPrivateRequest
    if (!pending) return
    if (pending.pathname !== window.location.pathname || pending.scenarioId !== scenarioId) {
      setPendingOpenPrivateRequest(null)
      return
    }
    if (availabilityError) {
      setPendingOpenPrivateRequest(null)
      return
    }
    if (!scenario || !isAvailabilityReady || isLoadingEvents) return
    setPendingOpenPrivateRequest(null)
    const allStillAvailable = pending.slots.every((ts) =>
      privateDates.includes(ts.date)
      && !!slotAvailability.slotsByDate[ts.date]
      && availableSlotsForDate(slotAvailability, ts.date).some((s) => s.label === ts.slot.label),
    )
    if (!allStillAvailable) {
      showToast.warning('候補日時の受付状況が変わりました。候補を確認して選び直してください')
      return
    }
    // StrictMode で effect が 2 回走っても 1 回だけ開く
    if (openedPendingRef.current === pending) return
    openedPendingRef.current = pending
    void handlePrivateBookingRequest(!!user, `「${scenario.scenario_title}」の貸切リクエスト`, {
      timeSlots: pending.slots,
      storeIds: privateStoreIdsForLinks,
    })
  }, [pendingOpenPrivateRequest, scenario, scenarioId, isAvailabilityReady, isLoadingEvents, availabilityError, privateDates, slotAvailability, user, handlePrivateBookingRequest, privateStoreIdsForLinks])



  // 貸切リクエスト完了時のハンドラ（選択状態をクリア）
  const handlePrivateBookingCompleteWithClear = useCallback(() => {
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
      />
    )
  }

  if (isLoading) {
    return (
      <div className="booking-shell min-h-screen bg-background overflow-x-clip">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
        )}
        <div className="text-white relative overflow-hidden" style={{ backgroundColor: heroBgColor }}>
          <div className="container mx-auto max-w-7xl px-4 py-2 relative">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
              >
                <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                <span>戻る</span>
              </Button>
            </div>
          </div>
        </div>
        {/* スケルトンUI */}
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* 左側：キービジュアルスケルトン */}
            <div className="md:col-span-5">
              <div className="aspect-[3/4] bg-gray-200 animate-pulse rounded-lg" />
            </div>
            {/* 右側：情報スケルトン */}
            <div className="md:col-span-7 space-y-4">
              {/* タイトル */}
              <div className="h-8 bg-gray-200 animate-pulse rounded w-3/4" />
              {/* サブタイトル */}
              <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
              {/* バッジ */}
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 animate-pulse rounded-full" />
                <div className="h-6 w-20 bg-gray-200 animate-pulse rounded-full" />
                <div className="h-6 w-14 bg-gray-200 animate-pulse rounded-full" />
              </div>
              {/* 説明文 */}
              <div className="space-y-2 pt-4">
                <div className="h-4 bg-gray-200 animate-pulse rounded w-full" />
                <div className="h-4 bg-gray-200 animate-pulse rounded w-full" />
                <div className="h-4 bg-gray-200 animate-pulse rounded w-2/3" />
              </div>
              {/* 料金 */}
              <div className="pt-4">
                <div className="h-10 bg-gray-200 animate-pulse rounded w-1/3" />
              </div>
            </div>
          </div>
          {/* 公演日程スケルトン */}
          <div className="mt-8">
            <div className="h-6 bg-gray-200 animate-pulse rounded w-32 mb-4" />
            <div className="space-y-3">
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="booking-shell min-h-screen bg-background overflow-x-clip">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
        )}
        <div className="text-white relative overflow-hidden" style={{ backgroundColor: heroBgColor }}>
          {/* アクセント装飾 */}
          <div
            className="absolute top-0 right-0 w-24 h-24 opacity-20"
            style={{
              background: `radial-gradient(circle at center, ${preset.accent} 0%, transparent 70%)`,
              transform: 'translate(30%, -30%)'
            }}
          />
          <div className="container mx-auto max-w-7xl px-4 py-2 relative">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
              >
                <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                <span>戻る</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">シナリオが見つかりませんでした</p>
        </div>
      </div>
    )
  }

  return (
    <div className="booking-shell min-h-screen bg-background overflow-x-clip">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
      )}

      {/* ヒーローセクション（トップページと統一） */}
      <div className="text-white relative overflow-hidden" style={{ backgroundColor: heroBgColor }}>
        {/* アクセント装飾 (テーマカラー連動) */}
        <div
          className="absolute top-0 right-0 w-24 h-24 opacity-20"
          style={{
            background: `radial-gradient(circle at center, ${preset.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="container mx-auto max-w-7xl px-4 py-2 relative">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span>戻る</span>
            </Button>
            <div className="h-4 w-px bg-white/30" />
            <span className="text-sm text-white/80">シナリオ詳細</span>
          </div>
        </div>
      </div>

      {/* スティッキーヘッダー */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4">
          
          {/* 2行目: モバイル用シナリオ概要（スクロール時にアニメーション表示） */}
          {/* md:hidden - 768px未満でのみ表示（グリッドレイアウトのmd:と統一） */}
          <div 
            className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
              showStickyInfo 
                ? 'max-h-[120px] opacity-100' 
                : 'max-h-0 opacity-0'
            }`}
          >
            <div className="flex items-center gap-3 pb-2 border-t pt-2">
              {/* キービジュアル（縦80px）- 最適化済み */}
              {scenario.key_visual_url && (
                <div className="flex-shrink-0 h-[80px] aspect-[1/1.4] bg-gray-200 overflow-hidden">
                  <img
                    src={getOptimizedImageUrl(scenario.key_visual_url, { width: 100, format: 'webp', quality: 80 })}
                    alt={scenario.scenario_title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      if (scenario.key_visual_url && e.currentTarget.src !== scenario.key_visual_url) {
                        e.currentTarget.src = scenario.key_visual_url
                      }
                    }}
                  />
                </div>
              )}
              {/* タイトルと基本情報 */}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold line-clamp-2">{scenario.scenario_title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {scenario.player_count_min === scenario.player_count_max
                    ? `${scenario.player_count_max}人`
                    : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                  {' / '}
                  {scenario.duration}分
                </p>
                {scenario.participation_fee && (
                  <p className="text-xs font-medium mt-0.5">
                    ¥{referenceMinFee(scenario.participation_fee, scenario.participation_costs).toLocaleString()}〜
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container mx-auto max-w-7xl px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* メインエリア - 詳細情報 */}
          <div className="md:col-span-7 space-y-4">
            <ScenarioHero
              scenario={scenario}
              events={events}
              organizationSlug={organizationSlug}
              stores={stores}
              showPrivateBookingCta={acceptsPrivateBooking}
              privateBookingStoreIds={privateStoreIdsForLinks}
            />
            
            {/* あらすじ・シナリオ情報 */}
            <ScenarioAbout scenario={scenario} stores={stores} />
          </div>

          {/* 右サイドバー - チケット購入 */}
          <div className="md:col-span-5">
            <div className="md:sticky md:top-[50px] space-y-3">
              <PrivateBookingStatusNote
                status={privateStatus}
                hasEvents={events.length > 0}
                onOpenPrivate={() => {
                  setActiveTab('private')
                  tabsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
                }}
              />
              {/* タブ: 公演日程 / 貸切リクエスト */}
              <div ref={tabsRef} className="scroll-mt-16">
              <Tabs 
                value={activeTab}
                className="w-full" 
                onValueChange={(value) => {
                  if (value === 'private' && !acceptsPrivateBooking) return
                  setActiveTab(value as 'schedule' | 'private')
                }}
              >
                {acceptsPrivateBooking ? (
                  <TabsList className="grid w-full grid-cols-2 mb-2">
                    <TabsTrigger value="schedule" className="text-sm py-1.5">公演日程</TabsTrigger>
                    <TabsTrigger value="private" className="text-sm py-1.5">貸切リクエスト</TabsTrigger>
                  </TabsList>
                ) : (
                  <TabsList className="grid w-full grid-cols-1 mb-2">
                    <TabsTrigger value="schedule" className="text-sm py-1.5">公演日程</TabsTrigger>
                  </TabsList>
                )}
                
                {/* 公演日程タブ */}
                <TabsContent value="schedule">
                  <div className="space-y-4">
                    {/* 店舗フィルタ（実際にスケジュールに存在する店舗のみ表示） */}
                    <StoreSelector
                      stores={scheduleStores}
                      selectedStoreIds={scheduleStoreFilter}
                      onStoreIdsChange={setScheduleStoreFilter}
                      label="店舗で絞り込み"
                      placeholder="店舗を選択"
                    />

                    <div>
                      <h3 className="ts-label">日付を選択</h3>
                      <EventList
                        events={scheduleStoreFilter.length > 0
                          ? events.filter(
                              (e) =>
                                scheduleStoreFilter.includes(e.store_id) ||
                                // 店舗未紐付け（出張公演など）は店舗絞り込みしても表示を維持
                                !e.store_id
                            )
                          : events}
                        selectedEventId={selectedEventId}
                        scenarioTitle={scenario.scenario_title}
                        onEventSelect={setSelectedEventId}
                        minParticipants={scenario.player_count_min}
                      />
                    </div>
                  </div>
                </TabsContent>
                
                {/* 貸切リクエストタブ */}
                {acceptsPrivateBooking && (
                <TabsContent value="private">
                  <div className="space-y-4">
                  {/* 日程を決めないで作成するボタン（一番上） */}
                  <div className="p-3 bg-purple-50 border border-purple-200">
                    <p className="ts-body text-purple-800 mb-2">
                      日程やメンバーが決まっていない場合
                    </p>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100"
                      onClick={() => {
                        // いま選んでいる希望店舗をグループ作成の初期値にする（ヒーロー・料金パネルのボタンと同じ。?stores= で来たときもその店舗）
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
                      }}
                    >
                      <Users className="w-4 h-4" />
                      まずはメンバーを招待して貸切グループを作成
                    </Button>
                  </div>
                  
                  <PrivateBookingForm
                    stores={availableStores}
                    selectedStoreIds={selectedStoreIds}
                    onStoreIdsChange={setSelectedStoreIds}
                    currentMonth={currentMonth}
                    onMonthChange={changeMonth}
                    availableDates={privateDates}
                    slotAvailability={slotAvailability}
                    selectedSlots={selectedTimeSlots}
                    onTimeSlotToggle={toggleTimeSlot}
                    maxSelections={MAX_SELECTIONS}
                    isCustomHoliday={isCustomHoliday}
                    isNextMonthDisabled={isNextMonthDisabled}
                    loading={isLoadingEvents}
                    deadlineDays={privateBookingDeadlineDays}
                    availabilityError={availabilityError}
                    onRetryAvailability={reloadAvailability}
                    horizon={privateBookingHorizon}
                  />
                  
                  {/* 選択された時間枠の表示 */}
                  {selectedTimeSlots.length > 0 && (
                    <div className="p-3 bg-purple-50 border border-purple-200">
                      <div className="text-xs text-purple-900 mb-2">
                        選択中の候補日時 ({selectedTimeSlots.length}/{MAX_SELECTIONS})
                      </div>
                      <div className="space-y-1">
                        {selectedTimeSlots.map((item, index) => {
                          return (
                            <div key={`${item.date}-${item.slot.label}`} className="flex items-center justify-between text-xs">
                              <span className="text-purple-900 flex-1 min-w-0 pr-2">
                                {index + 1}. {formatJstDateJa(item.date, true)} {item.slot.label}{' '}
                                {item.slot.startTime}〜{item.slot.endTime}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-purple-100 flex-shrink-0 touch-manipulation"
                                onClick={() => toggleTimeSlot(item.date, item.slot)}
                              >
                                ×
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  </div>
                </TabsContent>
                )}
              </Tabs>
              </div>


              {/* タブの内容に応じて表示を切り替え */}
              <div className="mt-4">
                {activeTab === 'schedule' && (
                  <BookingPanel
                    scenarioTitle={scenario.scenario_title}
                    participantCount={participantCount}
                    maxParticipants={scenario.player_count_max}
                    participationFee={calculatedParticipationFee}
                    feeUnknownText={openFeeUnknownText}
                    selectedEventId={selectedEventId}
                    isLoggedIn={!!user}
                    events={events}
                    onParticipantCountChange={setParticipantCount}
                    onBooking={handleBooking}
                    reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                    hasPreReading={scenario.has_pre_reading}
                  />
                )}

                {acceptsPrivateBooking && activeTab === 'private' && (() => {
                  const todayStr = toJstYmd(new Date())
                  const startDate = scenario.booking_start_date
                  const endDate = scenario.booking_end_date
                  const hasPeriod = !!(startDate || endDate)
                  const isBeforeStart = startDate && todayStr < startDate
                  const isAfterEnd = endDate && todayStr > endDate
                  const isOutOfPeriod = hasPeriod && (isBeforeStart || isAfterEnd)

                  if (isOutOfPeriod) {
                    return (
                      <div className="border rounded-lg bg-gray-50 p-6 text-center space-y-2">
                        <p className="ts-muted">現在は募集していません</p>
                        {startDate && endDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集期間: {startDate} 〜 {endDate}
                          </p>
                        ) : endDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集終了日: {endDate}
                          </p>
                        ) : startDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集開始日: {startDate}
                          </p>
                        ) : null}
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      {selectedStoreIds.length > 0 && (
                        <VenueAccess
                          selectedStoreIds={selectedStoreIds}
                          stores={availableStores}
                          mode="private"
                        />
                      )}
                      <PrivateBookingPanel
                        participationFee={privateCandidateFees.length ? Math.min(...privateCandidateFees) : scenario.participation_fee}
                        maxParticipationFee={privateCandidateFees.length ? Math.max(...privateCandidateFees) : undefined}
                        feeUnknownText={knownPrivateFees ? null : feePendingText}
                        maxParticipants={scenario.player_count_max}
                        selectedTimeSlotsCount={selectedTimeSlots.length}
                        isLoggedIn={!!user}
                        availabilityReady={isAvailabilityReady}
                        onRequestBooking={() => {
                          void handlePrivateBookingRequest(!!user, `「${scenario.scenario_title}」の貸切リクエスト`, {
                            timeSlots: selectedTimeSlots,
                            storeIds: privateStoreIdsForLinks,
                          })
                        }}
                        reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                        hasPreReading={scenario.has_pre_reading}
                        scenarioId={scenario.scenario_master_id}
                        organizationSlug={organizationSlug}
                        preferredStoreIds={privateStoreIdsForLinks}
                      />
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 関連シナリオ（2カラムレイアウトの外、全幅で表示） */}
        {relatedScenarios.length > 0 && (
          <div className="mt-8 pt-8 border-t">
            <RelatedScenarios
              scenarios={relatedScenarios}
              authorName={scenario.author}
              onScenarioClick={(id) => {
                saveScrollPositionForCurrentUrl()
                // 組織slugがあれば予約サイト形式、なければグローバル形式
                if (organizationSlug) {
                  navigate(`/${organizationSlug}/scenario/${id}`)
                } else {
                  navigate(`/scenario-detail/${id}`)
                }
              }}
            />
          </div>
        )}
      </div>

      {/* フッター */}
      <Footer organizationSlug={organizationSlug} minimal />
      {/* スマホで予約ボタンを画面下に固定している間、フッターが隠れないよう空ける（点検 18） */}
      {activeTab === 'schedule' && selectedEventId && <div className="h-24 md:hidden" aria-hidden="true" />}
    </div>
  )
}
