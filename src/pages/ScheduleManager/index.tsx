// React
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

// API
import { staffApi, scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'

// Custom Hooks
import { useRouteScrollControls } from '@/contexts/RouteScrollRestorationContext'
import { useScheduleTable } from '@/hooks/useScheduleTable'
import { useTemporaryVenues } from '@/hooks/useTemporaryVenues'
import { useOrganization } from '@/hooks/useOrganization'
import { useBlockedSlots } from '@/hooks/useBlockedSlots'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { useAuth } from '@/contexts/AuthContext'

// Custom Hooks (ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'
import { useGmStats } from './hooks/useGmStats'

// Types
import type { Staff } from '@/types'

// Layout Components
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'

// UI Components
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { HelpButton } from '@/components/ui/help-button'
import { MonthSwitcher } from '@/components/patterns/calendar'

// Schedule Components
import { ConflictWarningModal } from '@/components/schedule/ConflictWarningModal'
import { ContextMenu, Copy, Clipboard } from '@/components/schedule/ContextMenu'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { MoveOrCopyDialog } from '@/components/schedule/MoveOrCopyDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { HistoryModal } from '@/components/schedule/modal/HistoryModal'
import { CategoryGmStatsBar } from '@/components/schedule/CategoryGmStatsBar'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'
import { KitManagementDialog } from './components/KitManagementDialog'

// Icons
import { Ban, Edit, RotateCcw, Trash2, Plus, CalendarDays, Upload, FileText, EyeOff, Eye, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Package, Calendar, Users } from 'lucide-react'

// Utils
import { getJapaneseHoliday } from '@/utils/japaneseHolidays'
import { RESERVATION_SOURCE } from '@/lib/constants'

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 認証情報（権限チェック用）
  const { user } = useAuth()
  const isAdminOrLicenseAdmin = user?.role === 'admin' || user?.role === 'license_admin'
  
  // 月ナビゲーション
  const { clearScrollPosition } = useRouteScrollControls()
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(clearScrollPosition)

  // 臨時会場管理
  const { temporaryVenues, availableVenues, getVenueNameForDate, addTemporaryVenue, updateVenueName, removeTemporaryVenue } = useTemporaryVenues(currentDate)
  
  // 組織ID（履歴モーダル用）
  const { organizationId } = useOrganization()
  
  // 募集中止スロット管理
  const { isSlotBlocked, blockSlot, unblockSlot } = useBlockedSlots()
  
  // カスタム休日管理
  const { isCustomHoliday, toggleHoliday } = useCustomHolidays()

  // GMリスト
  const [gmList, setGmList] = useState<Staff[]>([])
  const [selectedGMs, setSelectedGMs] = useState<string[]>([])
  
  // 店舗フィルター
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  
  // シフト提出者フィルター（空スロットに表示されるシフト提出者を絞り込む）
  const [selectedShiftStaff, setSelectedShiftStaff] = useState<string[]>([])

  // シナリオ検索（単一選択）
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([])

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isKitManagementOpen, setIsKitManagementOpen] = useState(false)
  const [isFillingSeats, setIsFillingSeats] = useState(false)
  const [isFixingData, setIsFixingData] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  
  // 履歴モーダル（セルベース）
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean
    cellInfo?: { date: string; storeId: string; timeSlot: string | null }
    title?: string
  }>({ isOpen: false })
  
  // 現在表示中の日付（スクロール追跡用）
  const [currentVisibleDate, setCurrentVisibleDate] = useState<string | null>(null)
  const [showDateBar, setShowDateBar] = useState(false)
  
  // スクロール時に現在表示されている日付を追跡
  const handleScroll = useCallback(() => {
    const toolbar = document.querySelector('[data-schedule-toolbar]')
    if (!toolbar) return
    
    const toolbarRect = toolbar.getBoundingClientRect()
    
    // テーブル内の日付行を走査
    const dateRows = document.querySelectorAll('[data-date]')
    let foundDate: string | null = null
    
    for (const row of dateRows) {
      const rect = row.getBoundingClientRect()
      // 行が操作行の下端より上にある場合
      if (rect.top <= toolbarRect.bottom + 50) {
        foundDate = row.getAttribute('data-date')
      } else {
        break
      }
    }
    
    // 最初の日付行がまだ見えている場合は日付バーを非表示
    const firstDateRow = dateRows[0]
    const shouldShow = firstDateRow && firstDateRow.getBoundingClientRect().top < toolbarRect.bottom
    
    setShowDateBar(shouldShow && foundDate !== null)
    if (foundDate) {
      setCurrentVisibleDate(foundDate)
    }
  }, [])
  
  // スクロールイベントリスナーを設定
  useEffect(() => {
    const scrollContainer = document.querySelector('.overflow-y-auto') || window
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])
  
  // 現在表示されている日付の情報
  const currentDayInfo = useMemo(() => {
    if (!currentVisibleDate) return null
    return monthDays.find(d => d.date === currentVisibleDate)
  }, [currentVisibleDate, monthDays])
  
  const currentHoliday = currentVisibleDate ? getJapaneseHoliday(currentVisibleDate) : null

  // 中止以外を満席にする処理（参加者数を定員に合わせる）
  const handleFillAllSeats = async () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    
    if (!confirm(`${year}年${month}月の中止以外の公演を満席（参加者数＝定員）にしますか？`)) return
    
    setIsFillingSeats(true)
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      // 月末日を正しく計算（翌月の0日 = 当月の最終日）
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      
      // 組織IDを最初に取得
      const orgId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
      
      // まず対象のイベントを取得（シナリオの定員情報も含む、現在の組織のみ）
      const { data: events, error: fetchError } = await supabase
        .from('schedule_events_staff_view')
        .select('id, scenario, max_participants, capacity, current_participants, date, start_time, scenario_id, scenario_master_id, store_id, gms, scenario_masters:scenario_master_id(player_count_max)')
        .eq('organization_id', orgId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_cancelled', false)
      
      if (fetchError) {
        showToast.error(getSafeErrorMessage(fetchError, 'データの取得に失敗しました'))
        return
      }
      
      logger.log(`📊 満席処理対象: ${year}年${month}月 ${events?.length || 0}件`)
      
      // シナリオ情報を一括取得（参加費・所要時間）
      const scenarioMasterIds = [...new Set(
        (events || [])
          .map(e => e.scenario_master_id || e.scenario_id)
          .filter(Boolean)
      )]
      
      const scenarioInfoMap = new Map<string, { duration: number; participation_fee: number }>()
      if (scenarioMasterIds.length > 0) {
        const { data: scenarioInfos } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, duration, participation_fee')
          .eq('organization_id', orgId)
          .in('scenario_master_id', scenarioMasterIds)
        
        scenarioInfos?.forEach(s => {
          if (s.scenario_master_id) {
            scenarioInfoMap.set(s.scenario_master_id, {
              duration: s.duration || 120,
              participation_fee: s.participation_fee || 0
            })
          }
        })
      }
      
      // 対象イベントIDを抽出して一括で予約を取得（バッチ分割でURL長制限回避）
      const eventIds = (events || []).map(e => e.id)
      const BATCH_SIZE = 100
      const allReservations: Array<{ schedule_event_id: string; participant_count: number; participant_names: string[] | null }> = []
      
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE)
        const { data } = await supabase
          .from('reservations')
          .select('schedule_event_id, participant_count, participant_names')
          .in('schedule_event_id', batchIds)
          .in('status', ['confirmed', 'pending'])
        if (data) {
          allReservations.push(...(data as typeof allReservations))
        }
      }
      
      // イベントIDごとに予約をグループ化
      const reservationsByEvent = new Map<string, typeof allReservations>()
      allReservations.forEach(r => {
        const list = reservationsByEvent.get(r.schedule_event_id) || []
        list.push(r)
        reservationsByEvent.set(r.schedule_event_id, list)
      })
      
      // 各イベントの参加者数を定員に合わせ、デモ参加者の予約レコードを一括作成
      const demoReservations: Array<{
        schedule_event_id: string
        organization_id: string
        title: string
        scenario_master_id: string | null
        store_id: string | null
        customer_id: null
        customer_notes: string
        requested_datetime: string
        duration: number
        participant_count: number
        participant_names: string[]
        assigned_staff: string[]
        base_price: number
        options_price: number
        total_price: number
        discount_amount: number
        final_price: number
        payment_method: string
        payment_status: string
        status: string
        reservation_source: string
        reservation_number: string
      }> = []
      const eventsToUpdate: Array<{ id: string; newCount: number }> = []
      
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      
      for (const event of events || []) {
        // シナリオJOIN → イベントのmax_participants → capacity → デフォルト8人
        const scenarioMax = (event.scenario_masters as { player_count_max?: number } | null)?.player_count_max
        const baseMax = scenarioMax || event.max_participants || event.capacity || 8
        // capacity制約を超えないように制限
        const maxParticipants = event.capacity ? Math.min(baseMax, event.capacity) : baseMax
        
        // 既に満席ならスキップ
        if ((event.current_participants || 0) >= maxParticipants) {
          continue
        }
        
        // 予約情報を取得（一括取得済み）
        const reservations = reservationsByEvent.get(event.id) || []
        const currentReservedCount = reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
        const neededParticipants = maxParticipants - currentReservedCount
        
        // デモ参加者が既に存在するかチェック
        const hasDemoParticipant = reservations.some(r => 
          r.participant_names?.includes('デモ参加者') || 
          r.participant_names?.some((name: string) => name.includes('デモ'))
        )
        
        // 足りない分だけデモ参加者を追加
        if (neededParticipants > 0 && !hasDemoParticipant) {
          // シナリオ情報を取得（一括取得済み）
          const scenarioMasterId = event.scenario_master_id || event.scenario_id
          const scenarioInfo = scenarioMasterId ? scenarioInfoMap.get(scenarioMasterId) : null
          const participationFee = scenarioInfo?.participation_fee || 0
          const duration = scenarioInfo?.duration || 120
          
          // 予約番号を生成（ユニークにするためインデックスを含める）
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
          const reservationNumber = `${dateStr}-${randomStr}`
          
          demoReservations.push({
            schedule_event_id: event.id,
            organization_id: orgId,
            title: event.scenario || '',
            scenario_master_id: event.scenario_master_id || event.scenario_id || null,
            store_id: event.store_id || null,
            customer_id: null,
            customer_notes: `デモ参加者${neededParticipants}名`,
            requested_datetime: `${event.date}T${event.start_time}+09:00`,
            duration: duration,
            participant_count: neededParticipants,
            participant_names: Array(neededParticipants).fill(null).map((_, i) => 
              neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`
            ),
            assigned_staff: event.gms || [],
            base_price: participationFee * neededParticipants,
            options_price: 0,
            total_price: participationFee * neededParticipants,
            discount_amount: 0,
            final_price: participationFee * neededParticipants,
            payment_method: 'onsite',
            payment_status: 'paid',
            status: 'confirmed',
            reservation_source: RESERVATION_SOURCE.DEMO,
            reservation_number: reservationNumber
          })
          
          eventsToUpdate.push({ id: event.id, newCount: maxParticipants })
        }
      }
      
      logger.log(`📊 デモ参加者追加: ${demoReservations.length}件`)
      
      // バッチサイズ（Supabaseの制限を考慮）
      const INSERT_BATCH_SIZE = 50
      
      // デモ参加者予約をバッチでinsert
      if (demoReservations.length > 0) {
        for (let i = 0; i < demoReservations.length; i += INSERT_BATCH_SIZE) {
          const batch = demoReservations.slice(i, i + INSERT_BATCH_SIZE)
          const { error: insertError } = await supabase
            .from('reservations')
            .insert(batch)
          
          if (insertError) {
            logger.error(`デモ参加者の予約作成エラー (バッチ ${Math.floor(i / BATCH_SIZE) + 1}):`, insertError)
          }
        }
        
        // 参加者数をバッチで更新
        for (let i = 0; i < eventsToUpdate.length; i += BATCH_SIZE) {
          const batch = eventsToUpdate.slice(i, i + BATCH_SIZE)
          await Promise.all(
            batch.map(({ id, newCount }) =>
              supabase
                .from('schedule_events')
                .update({ current_participants: newCount })
                .eq('id', id)
            )
          )
        }
      }
      
      showToast.success(`${eventsToUpdate.length}件を満席に設定しました`)
      // Realtimeで自動的にデータが更新されるため、ページリロードは不要
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsFillingSeats(false)
    }
  }

  // 全期間のデータ修復（予約レコードがないのにcurrent_participantsが設定されている公演を修復）
  const handleFixAllData = async () => {
    if (!confirm('全期間の公演データを修復しますか？\n（予約レコードがない公演にデモ参加者を追加します）')) return
    
    setIsFixingData(true)
    try {
      const result = await scheduleApi.addDemoParticipantsToAllActiveEvents()
      if (result.success) {
        showToast.success(result.message || 'データ修復完了')
        scheduleTableProps.fetchSchedule?.()
      } else {
        showToast.error('データ修復に失敗しました')
      }
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsFixingData(false)
    }
  }

  // スケジュールテーブルの共通フック
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = scheduleTableProps.modals!

  // シナリオ候補（MultiSelect用）
  const scenarioOptions = useMemo(() => {
    const scenarios = (modals?.performanceModal?.scenarios || []) as Array<any>
    const events = scheduleTableProps.events || []

    // 表示中の月のイベントからシナリオごとに公演数・中止数を集計
    const scheduledCount = new Map<string, number>()
    const cancelledCount = new Map<string, number>()
    events.forEach((ev: any) => {
      // フォーマット後のイベントは scenarios.id に scenario_master_id が入っている
      const sid = ev.scenarios?.id
      if (!sid) return
      if (ev.is_cancelled) {
        cancelledCount.set(sid, (cancelledCount.get(sid) || 0) + 1)
      } else {
        scheduledCount.set(sid, (scheduledCount.get(sid) || 0) + 1)
      }
    })

    const map = new Map<string, { id: string; name: string; displayInfo?: React.ReactNode; displayInfoSearchText?: string }>()
    scenarios.forEach((s) => {
      const id = String(s?.id || '').trim()
      const title = String(s?.title || s?.scenario || '').trim()
      if (!id || !title) return
      if (map.has(id)) return
      const scheduled = scheduledCount.get(id) || 0
      const cancelled = cancelledCount.get(id) || 0
      const displayInfo = (
        <span className="flex items-center gap-0.5 text-xs">
          <span className="text-foreground font-medium">{scheduled}</span>
          <span className="text-muted-foreground">/</span>
          <span className={cancelled > 0 ? 'text-orange-500 font-medium' : 'text-muted-foreground'}>{cancelled}</span>
        </span>
      )
      map.set(id, {
        id,
        name: title,
        displayInfo,
        displayInfoSearchText: `${scheduled}/${cancelled}`
      })
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [modals?.performanceModal?.scenarios, scheduleTableProps.events])

  const selectedScenarioId = selectedScenarioIds[0] || null
  const selectedScenarioTitle = useMemo(() => {
    if (!selectedScenarioId) return null
    return scenarioOptions.find(o => o.id === selectedScenarioId)?.name || null
  }, [selectedScenarioId, scenarioOptions])

  const normalizeScenarioKey = useCallback((s: string) => {
    return (s || '').replace(/[\s\-・／/]/g, '').toLowerCase()
  }, [])

  const scenarioMatchesEvent = useCallback((event: any) => {
    if (!selectedScenarioId || !selectedScenarioTitle) return true
    // 通常公演: JOINされた scenario_masters.id
    if (event?.scenario_masters?.id && String(event.scenario_masters.id) === String(selectedScenarioId)) {
      return true
    }
    // 貸切/フォールバック: タイトルで照合
    const eventTitle = String(event?.scenario || '').trim()
    if (!eventTitle) return false
    return normalizeScenarioKey(eventTitle) === normalizeScenarioKey(selectedScenarioTitle)
  }, [normalizeScenarioKey, selectedScenarioId, selectedScenarioTitle])

  // カテゴリーフィルター（ScheduleManager独自機能）
  const timeSlots = ['morning', 'afternoon', 'evening'] as const
  const allEventsForMonth = useMemo(() => 
    scheduleTableProps.viewConfig.stores.flatMap(store => 
      timeSlots.flatMap(timeSlot => 
        monthDays.flatMap(day => 
          scheduleTableProps.dataProvider.getEventsForSlot(day.date, store.id, timeSlot)
        )
      )
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 必要な依存のみ
    [scheduleTableProps.viewConfig.stores, scheduleTableProps.dataProvider.getEventsForSlot, monthDays]
  )
  const { selectedCategory, setSelectedCategory, categoryCounts } = useCategoryFilter(allEventsForMonth)
  
  // GM出勤統計（ScheduleManager独自機能）
  const gmStats = useGmStats(allEventsForMonth, gmList)

  // スタッフリスト取得
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        const staff = await staffApi.getAll()
        // 全スタッフを表示（ロールでフィルタリングしない）
        setGmList(staff)
      } catch (error) {
        logger.error('スタッフリストの取得に失敗しました:', error)
      }
    }
    fetchStaffList()
  }, [])

  // カテゴリー＋スタッフフィルター適用版のgetEventsForSlot
  const filteredGetEventsForSlot = useMemo(() => {
    return (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      let events = scheduleTableProps.dataProvider.getEventsForSlot(date, venue, timeSlot)
      
      // カテゴリーフィルター
      if (selectedCategory !== 'all') {
        events = events.filter(event => event.category === selectedCategory)
      }

      // シナリオフィルター（単一）
      if (selectedScenarioId) {
        events = events.filter(scenarioMatchesEvent)
      }
      
      // スタッフフィルター（複数選択対応）
      if (selectedGMs.length > 0) {
        events = events.filter(event => {
          // gms配列をチェック（schedule_eventsテーブルの実際の構造）
          if (!event.gms || !Array.isArray(event.gms)) {
            return false
          }
          
          // 選択したスタッフのいずれかがイベントに含まれているかチェック
          return selectedGMs.some(selectedId => {
            const selectedStaff = gmList.find(s => s.id === selectedId)
            const selectedStaffName = selectedStaff?.display_name || selectedStaff?.name
            
            return event.gms.some(gm => 
              String(gm) === String(selectedId) || 
              (selectedStaffName && String(gm) === selectedStaffName)
            )
          })
        })
      }
      
      return events
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategory, selectedScenarioId, scenarioMatchesEvent, selectedGMs, gmList])

  // 店舗フィルター適用版の店舗リスト
  const filteredStores = useMemo(() => {
    if (selectedStores.length === 0) {
      return scheduleTableProps.viewConfig.stores
    }
    return scheduleTableProps.viewConfig.stores.filter(store => 
      selectedStores.includes(store.id)
    )
  }, [scheduleTableProps.viewConfig.stores, selectedStores])

  // シナリオの該当日（現在の月・現在のフィルタ条件に基づく）
  const scenarioMatchedDates = useMemo(() => {
    if (!selectedScenarioId) return []
    const visibleStoreIds = new Set(filteredStores.map(s => s.id))
    const dates = new Set<string>()
    for (const event of (scheduleTableProps.events || [])) {
      // カテゴリ
      if (selectedCategory !== 'all' && event.category !== selectedCategory) continue
      // シナリオ
      if (!scenarioMatchesEvent(event)) continue
      // GM
      if (selectedGMs.length > 0) {
        if (!event.gms || !Array.isArray(event.gms)) continue
        const ok = selectedGMs.some(selectedId => {
          const selectedStaff = gmList.find(s => s.id === selectedId)
          const selectedStaffName = selectedStaff?.display_name || selectedStaff?.name
          return event.gms.some(gm =>
            String(gm) === String(selectedId) ||
            (selectedStaffName && String(gm) === selectedStaffName)
          )
        })
        if (!ok) continue
      }
      // 店舗（店舗未確定の貸切リクエストは全店舗に出るので通す）
      if (selectedStores.length > 0) {
        const isPrivateUnassigned = !!event.is_private_request && !event.venue
        if (!isPrivateUnassigned && event.venue && !visibleStoreIds.has(event.venue)) continue
      }
      if (event.date) dates.add(event.date)
    }
    return [...dates].sort()
  }, [
    selectedScenarioId,
    scheduleTableProps.events,
    selectedCategory,
    scenarioMatchesEvent,
    selectedGMs,
    gmList,
    selectedStores,
    filteredStores
  ])

  const scrollToDate = useCallback((date: string) => {
    const row = document.querySelector(`[data-date="${date}"]`) as HTMLElement | null
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const jumpScenarioMatch = useCallback((direction: 'prev' | 'next') => {
    if (!selectedScenarioId || scenarioMatchedDates.length === 0) return
    const base = currentVisibleDate || scenarioMatchedDates[0]
    if (direction === 'next') {
      const next = scenarioMatchedDates.find(d => d > base) || scenarioMatchedDates[0]
      scrollToDate(next)
      return
    }
    const prevCandidates = scenarioMatchedDates.filter(d => d < base)
    const prev = prevCandidates.length > 0
      ? prevCandidates[prevCandidates.length - 1]
      : scenarioMatchedDates[scenarioMatchedDates.length - 1]
    scrollToDate(prev)
  }, [selectedScenarioId, scenarioMatchedDates, currentVisibleDate, scrollToDate])

  // シフト提出者一覧を取得（MultiSelectのオプション用）
  const shiftStaffOptions = useMemo(() => {
    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
    
    // シフト提出済みのスタッフIDを抽出
    const staffWithShift = new Set<string>()
    Object.values(shiftData).forEach((staffList: Staff[]) => {
      staffList.forEach(s => staffWithShift.add(s.id))
    })
    
    // 全スタッフを表示（シフト提出済みを上に、提出済みバッジ付き）
    return [...gmList]
      .sort((a, b) => {
        const aHasShift = staffWithShift.has(a.id)
        const bHasShift = staffWithShift.has(b.id)
        if (aHasShift && !bHasShift) return -1
        if (!aHasShift && bHasShift) return 1
        return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
      })
      .map(staff => {
        const hasShift = staffWithShift.has(staff.id)
        return {
          id: staff.id,
          name: staff.display_name || staff.name,
          displayInfo: hasShift ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
              提出済
            </span>
          ) : undefined,
          displayInfoSearchText: hasShift ? '提出済' : undefined
        }
      })
  }, [scheduleTableProps.dataProvider.shiftData, gmList])

  // シフトデータのフィルタリング（選択したスタッフのみ表示）
  const filteredShiftData = useMemo(() => {
    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
    
    // フィルターが選択されていない場合はそのまま返す
    if (selectedShiftStaff.length === 0) {
      return shiftData
    }
    
    // 選択されたスタッフのみフィルタリング
    const filtered: Record<string, Array<Staff & { timeSlot: string }>> = {}
    Object.entries(shiftData).forEach(([key, staffList]) => {
      filtered[key] = staffList.filter(s => selectedShiftStaff.includes(s.id))
    })
    return filtered
  }, [scheduleTableProps.dataProvider.shiftData, selectedShiftStaff])

  // カテゴリー＋スタッフ＋店舗＋シフト提出者フィルター適用版のpropsを作成
  const filteredScheduleTableProps = useMemo(() => ({
    ...scheduleTableProps,
    viewConfig: {
      ...scheduleTableProps.viewConfig,
      stores: filteredStores,
      temporaryVenues: selectedStores.length === 0 ? temporaryVenues : [],
      getVenueNameForDate // 日付ごとの臨時会場名を取得する関数
    },
    dataProvider: {
      ...scheduleTableProps.dataProvider,
      getEventsForSlot: filteredGetEventsForSlot,
      shiftData: filteredShiftData
    },
    isSlotBlocked, // 募集中止状態チェック関数
    isCustomHoliday // カスタム休日判定関数
  }), [scheduleTableProps, filteredStores, filteredGetEventsForSlot, temporaryVenues, selectedStores, filteredShiftData, getVenueNameForDate, isSlotBlocked, isCustomHoliday])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      // ハッシュ値をホワイトリストで検証（オープンリダイレクト防止）
      const allowedHashes = ['schedule', 'staff', 'stores', 'scenarios', 'settings', 'dashboard']
      if (hash && hash !== 'schedule' && allowedHashes.includes(hash)) {
        window.location.href = '/' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <AppLayout
      currentPage="schedule" 
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-4"
      className="mx-auto"
      stickyLayout
    >
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            スケジュール管理
          </div>
        }
        description={`${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月のスケジュールを管理`}
      >
        <HelpButton topic="schedule" label="スケジュール管理マニュアル" />
      </PageHeader>

      {/* ツールバー（sticky） */}
      <div data-schedule-toolbar className="sticky top-0 z-40 bg-background border-b -mx-[10px] px-[10px]">
        <div className="flex items-center h-12 gap-2">
          {/* 月切り替え - 連結ボタングループ */}
          <div className="flex items-center shrink-0 border border-input rounded-lg overflow-hidden bg-background">
            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setMonth(newDate.getMonth() - 1)
                setCurrentDate(newDate)
              }}
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-r border-input"
              title="前月"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center px-1">
              <select
                value={currentDate.getFullYear()}
                onChange={(e) => {
                  const newDate = new Date(currentDate)
                  newDate.setFullYear(parseInt(e.target.value))
                  setCurrentDate(newDate)
                }}
                className="h-9 w-[70px] px-1 text-sm font-semibold bg-transparent hover:bg-accent transition-colors cursor-pointer text-center appearance-none"
              >
                {Array.from({ length: 10 }, (_, i) => 2021 + i).map(y => (
                  <option key={y} value={y}>{y}年</option>
                ))}
              </select>
              <select
                value={currentDate.getMonth() + 1}
                onChange={(e) => {
                  const newDate = new Date(currentDate)
                  newDate.setMonth(parseInt(e.target.value) - 1)
                  setCurrentDate(newDate)
                }}
                className="h-9 w-[50px] px-1 text-sm font-semibold bg-transparent hover:bg-accent transition-colors cursor-pointer text-center appearance-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const newDate = new Date(currentDate)
                newDate.setMonth(newDate.getMonth() + 1)
                setCurrentDate(newDate)
              }}
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-l border-input"
              title="次月"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          {/* 区切り線 */}
          <div className="hidden sm:block h-6 w-px bg-border mx-2" />
          
          {/* フィルター - 連結グループ */}
          <div className="hidden sm:flex items-center h-9 border border-input rounded-lg bg-background flex-1">
            {gmList.length > 0 && (
              <div className="flex-1 border-r border-input">
                <MultiSelect
                  options={(() => {
                    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
                    const staffWithShift = new Set<string>()
                    Object.values(shiftData).forEach((staffList: Staff[]) => {
                      staffList.forEach(s => staffWithShift.add(s.id))
                    })
                    return [...gmList]
                      .sort((a, b) => {
                        const aHasShift = staffWithShift.has(a.id)
                        const bHasShift = staffWithShift.has(b.id)
                        if (aHasShift && !bHasShift) return -1
                        if (!aHasShift && bHasShift) return 1
                        return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
                      })
                      .map((staff) => {
                        const hasShift = staffWithShift.has(staff.id)
                        return {
                          id: staff.id,
                          name: staff.display_name || staff.name,
                          displayInfo: hasShift ? (
                            <span className="text-[9px] text-green-600">●</span>
                          ) : undefined,
                          displayInfoSearchText: hasShift ? '提出済' : undefined
                        }
                      })
                  })()}
                  selectedValues={selectedGMs}
                  onSelectionChange={setSelectedGMs}
                  placeholder="スタッフ"
                  closeOnSelect={false}
                  useIdAsValue={true}
                  className="h-9 w-full border-0 rounded-none shadow-none"
                />
              </div>
            )}
            
            {scheduleTableProps.viewConfig.stores.length > 0 && (
              <div className="flex-1 border-r border-input">
                <StoreMultiSelect
                  stores={scheduleTableProps.viewConfig.stores}
                  selectedStoreIds={selectedStores}
                  onStoreIdsChange={setSelectedStores}
                  hideLabel={true}
                  placeholder="店舗"
                  className="h-9 w-full border-0 rounded-none shadow-none"
                />
              </div>
            )}

            {scenarioOptions.length > 0 && (
              <div className="flex-1 border-r border-input">
                <MultiSelect
                  options={scenarioOptions}
                  selectedValues={selectedScenarioIds}
                  onSelectionChange={(values) => setSelectedScenarioIds(values.slice(-1))}
                  placeholder="シナリオ"
                  searchPlaceholder="シナリオ検索..."
                  closeOnSelect={true}
                  useIdAsValue={true}
                  className="h-9 w-full border-0 rounded-none shadow-none"
                />
              </div>
            )}
            
            {shiftStaffOptions.length > 0 && (
              <div className="flex-1">
                <MultiSelect
                  options={shiftStaffOptions}
                  selectedValues={selectedShiftStaff}
                  onSelectionChange={setSelectedShiftStaff}
                  placeholder="出勤者"
                  closeOnSelect={false}
                  useIdAsValue={true}
                  className="h-9 w-full border-0 rounded-none shadow-none"
                />
              </div>
            )}
            
            {(selectedGMs.length > 0 || selectedStores.length > 0 || selectedScenarioIds.length > 0 || selectedShiftStaff.length > 0) && (
              <button
                onClick={() => {
                  setSelectedGMs([])
                  setSelectedStores([])
                  setSelectedScenarioIds([])
                  setSelectedShiftStaff([])
                }}
                className="h-9 px-3 text-sm text-muted-foreground hover:bg-accent transition-colors border-l border-input whitespace-nowrap"
              >
                クリア
              </button>
            )}

            {/* シナリオ該当日ジャンプ（選択中のみ表示） */}
            {selectedScenarioId && (
              <div className="flex items-center border-l border-input shrink-0">
                <button
                  type="button"
                  onClick={() => jumpScenarioMatch('prev')}
                  disabled={scenarioMatchedDates.length === 0}
                  title="前の該当日へ"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (scenarioMatchedDates.length > 0) scrollToDate(scenarioMatchedDates[0])
                  }}
                  disabled={scenarioMatchedDates.length === 0}
                  title={selectedScenarioTitle ? `${selectedScenarioTitle} の該当日へ` : '該当日へ'}
                  className="h-9 px-2 text-[11px] text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
                >
                  {scenarioMatchedDates.length}件
                </button>
                <button
                  type="button"
                  onClick={() => jumpScenarioMatch('next')}
                  disabled={scenarioMatchedDates.length === 0}
                  title="次の該当日へ"
                  className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* アクションボタン - スマホ用 */}
          <div className="sm:hidden flex items-center gap-1 ml-auto">
            {isAdminOrLicenseAdmin && (
              <button
                onClick={handleFillAllSeats}
                disabled={isFillingSeats}
                title="中止以外を満席にする"
                className="h-9 w-9 flex items-center justify-center border border-input rounded-lg bg-background hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
              >
                {isFillingSeats ? (
                  <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              onClick={() => setIsKitManagementOpen(true)}
              title="キット配置管理"
              className="h-9 w-9 flex items-center justify-center border border-input rounded-lg bg-background hover:bg-accent transition-colors shrink-0"
            >
              <Package className="h-4 w-4" />
            </button>
          </div>
          
          {/* アクションボタン - PC用連結グループ */}
          <div className="hidden sm:flex items-center h-9 border border-input rounded-lg overflow-hidden bg-background shrink-0 ml-auto">
            <button
              onClick={() => setIsKitManagementOpen(true)}
              title="キット配置管理"
              className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors border-r border-input"
            >
              <Package className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              title="インポート"
              className={`h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors ${isAdminOrLicenseAdmin ? 'border-r border-input' : ''}`}
            >
              <Upload className="h-4 w-4" />
            </button>
            {isAdminOrLicenseAdmin && (
              <button
                onClick={handleFillAllSeats}
                disabled={isFillingSeats}
                title="中止以外を満席にする（デモ参加者を追加）"
                className="h-9 w-9 flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isFillingSeats ? (
                  <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* カテゴリ + GM統計（統合バー） */}
        <div className="py-0.5 border-t border-muted/50">
          <CategoryGmStatsBar
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categoryCounts={categoryCounts}
            gmStats={gmStats}
            selectedStaffIds={selectedGMs}
            onStaffClick={(staffId) => {
              setSelectedGMs(prev => 
                prev.includes(staffId)
                  ? prev.filter(id => id !== staffId)
                  : [...prev, staffId]
              )
            }}
          />
        </div>
        
        {/* テーブルヘッダー行（操作行に統合してstickyに） */}
        <div className="flex bg-muted border-t -mx-[10px] px-[10px]">
          <div className="w-[32px] sm:w-[40px] md:w-[48px] shrink-0 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">
            <span className="hidden sm:inline">日付</span>
            <span className="sm:hidden">日</span>
          </div>
          <div className="w-[24px] sm:w-[28px] md:w-[32px] shrink-0 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">
            <span className="hidden sm:inline">会場</span>
            <span className="sm:hidden">店</span>
          </div>
          <div className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">午前</div>
          <div className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">午後</div>
          <div className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">夜</div>
          <div className="w-[160px] shrink-0 text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">メモ</div>
        </div>
        
        {/* スティッキー日付バー（スクロール時に現在の日付を表示） */}
        {showDateBar && currentDayInfo && (
          <div className="h-[18px] bg-slate-700 text-white flex items-center px-2 text-[11px] font-medium -mx-[10px] px-[10px]">
            <span className={
              currentHoliday || currentDayInfo.dayOfWeek === '日' 
                ? 'text-red-300' 
                : currentDayInfo.dayOfWeek === '土' 
                  ? 'text-blue-300' 
                  : ''
            }>
              {currentDayInfo.displayDate}（{currentDayInfo.dayOfWeek}）
              {currentHoliday && <span className="ml-2 text-red-300 text-xs">{currentHoliday}</span>}
            </span>
          </div>
        )}
      </div>

      {/* スケジュールテーブル */}
      <ScheduleTable {...filteredScheduleTableProps} hideHeader />

      {/* 下部の月切り替え */}
      <div className="flex justify-center py-4">
        <MonthSwitcher
          value={currentDate}
          onChange={setCurrentDate}
          showToday
          quickJump
        />
      </div>

      {/* フローティング「上に戻る」ボタン */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-6 right-6 z-50 shadow-lg bg-background hover:bg-muted"
        onClick={() => {
          // stickyLayoutの場合、スクロールコンテナはAppLayout内のdiv
          const scrollContainer = document.querySelector('.overflow-y-auto')
          if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }}
        title="ページ上部に戻る"
      >
        ↑
      </Button>

      {/* モーダル・ダイアログ群 */}
      <PerformanceModal
        isOpen={modals.performanceModal.isOpen}
        onClose={modals.performanceModal.onClose}
        onSave={modals.performanceModal.onSave}
        mode={modals.performanceModal.mode}
        event={modals.performanceModal.event}
        initialData={modals.performanceModal.initialData}
        stores={modals.performanceModal.stores}
        scenarios={modals.performanceModal.scenarios}
        staff={modals.performanceModal.staff}
        events={scheduleTableProps.events}
        availableStaffByScenario={modals.performanceModal.availableStaffByScenario}
        allAvailableStaff={modals.performanceModal.allAvailableStaff}
        onParticipantChange={modals.performanceModal.onParticipantChange}
        onDeleteEvent={modals.performanceModal.onDeleteEvent}
      />

      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentDisplayDate={currentDate}
        onImportComplete={(targetMonth) => {
          // インポート対象の月に切り替え
          if (targetMonth) {
            const targetDate = new Date(targetMonth.year, targetMonth.month - 1, 1)
            setCurrentDate(targetDate)
          }
          // データを再取得（同じ月の場合もあるので必ず呼び出す）
          scheduleTableProps.fetchSchedule?.()
        }}
      />

      <ConflictWarningModal
        isOpen={modals.conflictWarning.isOpen}
        onClose={modals.conflictWarning.onClose}
        onContinue={modals.conflictWarning.onContinue}
        conflictInfo={modals.conflictWarning.conflictInfo}
      />

      <ScheduleDialogs
        isDeleteDialogOpen={modals.scheduleDialogs.isDeleteDialogOpen}
        onCloseDeleteDialog={modals.scheduleDialogs.onCloseDeleteDialog}
        onConfirmDelete={modals.scheduleDialogs.onConfirmDelete}
        isCancelDialogOpen={modals.scheduleDialogs.isCancelDialogOpen}
        onCloseCancelDialog={modals.scheduleDialogs.onCloseCancelDialog}
        onConfirmCancel={modals.scheduleDialogs.onConfirmCancel}
        cancellationReason={modals.scheduleDialogs.cancellationReason}
        onCancellationReasonChange={modals.scheduleDialogs.onCancellationReasonChange}
        isRestoreDialogOpen={modals.scheduleDialogs.isRestoreDialogOpen ?? false}
        onCloseRestoreDialog={modals.scheduleDialogs.onCloseRestoreDialog ?? (() => {})}
        onConfirmRestore={modals.scheduleDialogs.onConfirmRestore ?? (() => {})}
      />

      <MoveOrCopyDialog
        isOpen={modals.moveOrCopyDialog.isOpen}
        onClose={modals.moveOrCopyDialog.onClose}
        onMove={modals.moveOrCopyDialog.onMove}
        onCopy={modals.moveOrCopyDialog.onCopy}
        eventInfo={modals.moveOrCopyDialog.selectedEvent ? {
          scenario: modals.moveOrCopyDialog.selectedEvent.scenario || '',
          date: modals.moveOrCopyDialog.selectedEvent.date || '',
          storeName: modals.moveOrCopyDialog.stores.find((s: { id: string; name: string }) => s.id === modals.moveOrCopyDialog.selectedEvent?.venue)?.name || '',
          timeSlot: (() => {
            const hour = parseInt(modals.moveOrCopyDialog.selectedEvent.start_time.split(':')[0])
            if (hour < 12) return 'morning'
            if (hour < 17) return 'afternoon'
            return 'evening'
          })()
        } : null}
      />

      {modals.contextMenu.contextMenu && (
        <ContextMenu
          x={modals.contextMenu.contextMenu.x}
          y={modals.contextMenu.contextMenu.y}
          onClose={() => modals.contextMenu.setContextMenu(null)}
          items={modals.contextMenu.contextMenu.type === 'event' && modals.contextMenu.contextMenu.event ? (() => {
              const event = modals.contextMenu.contextMenu!.event!
              const isTemporaryVenue = temporaryVenues.some(v => v.id === event.venue)
              
              // デバッグログ
              logger.log('コンテキストメニュー:', {
                eventVenue: event.venue,
                temporaryVenues: temporaryVenues.map(v => ({ id: v.id, name: v.name })),
                isTemporaryVenue
              })
              
              return [
                {
                  label: '編集',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onEditPerformance(event)
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: 'コピー',
                  icon: <Copy className="w-4 h-4" />,
                  onClick: () => {
                    modals.contextMenu.handleCopyToClipboard(event)
                  }
                },
                {
                  label: '公演名をコピー',
                  icon: <Clipboard className="w-4 h-4" />,
                  onClick: () => {
                    const scenarioText = event.scenario || '未設定'
                    navigator.clipboard.writeText(scenarioText)
                    showToast.success('公演名をコピーしました')
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '履歴を表示',
                  icon: <Clock className="w-4 h-4" />,
                  onClick: () => {
                    const stores = scheduleTableProps.viewConfig.stores
                    const storeId = event.store_id || event.venue
                    const storeName = stores.find(s => s.id === storeId)?.name || event.venue
                    const timeSlotLabel = event.time_slot || ''
                    setHistoryModal({
                      isOpen: true,
                      cellInfo: { date: event.date, storeId, timeSlot: event.time_slot || null },
                      title: `${event.date} ${storeName}${timeSlotLabel ? ' ' + timeSlotLabel : ''} の更新履歴`
                    })
                    modals.contextMenu.setContextMenu(null)
                  },
                  separator: true
                },
                ...(event.is_cancelled ? [
                  {
                    label: '復活',
                    icon: <RotateCcw className="w-4 h-4" />,
                    onClick: () => {
                      scheduleTableProps.eventHandlers.onUncancel(event)
                      modals.contextMenu.setContextMenu(null)
                    }
                  }
                ] : [
                  {
                    label: '中止',
                    icon: <Ban className="w-4 h-4" />,
                    onClick: () => {
                      scheduleTableProps.eventHandlers.onCancelConfirm(event)
                      modals.contextMenu.setContextMenu(null)
                    }
                  }
                ]),
                // 仮状態切替
                {
                  label: event.is_tentative ? '公開する' : '仮状態にする',
                  icon: event.is_tentative ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
                  onClick: async () => {
                    try {
                      await scheduleTableProps.eventHandlers.onToggleTentative(event)
                      showToast.success(event.is_tentative ? '公開しました' : '仮状態にしました')
                    } catch (error) {
                      showToast.error('更新に失敗しました')
                    }
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '公演を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onDeletePerformance(event)
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: 'メモに変換',
                  icon: <FileText className="w-4 h-4" />,
                  onClick: () => {
                    // 直接メモに変換（モーダルなし）
                    scheduleTableProps.eventHandlers.onConvertToMemo(event)
                    modals.contextMenu.setContextMenu(null)
                  },
                  separator: true
                },
                {
                  label: '臨時会場を追加',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => {
                    // その日付で既に使用されている臨時会場を確認
                    const usedVenueIds = temporaryVenues
                      .filter(v => v.temporary_dates?.includes(event.date))
                      .map(v => v.id)
                    
                    // まだ使用されていない最初の臨時会場を選択
                    const nextVenue = availableVenues.find(v => !usedVenueIds.includes(v.id))
                    
                    if (nextVenue) {
                      addTemporaryVenue(event.date, nextVenue.id)
                    } else {
                      showToast.warning('すべての臨時会場が使用されています')
                    }
                    
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    if (confirm(`${event.date}から臨時会場を削除しますか？`)) {
                      removeTemporaryVenue(event.date, event.venue)
                    }
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue
                }
              ]
            })()
             : modals.contextMenu.contextMenu.type === 'cell' && modals.contextMenu.contextMenu.cellInfo ? (() => {
              // すべてのセルで統一メニューを表示
              const { date, venue, timeSlot } = modals.contextMenu.contextMenu!.cellInfo!
              const isTemporaryVenue = venue && temporaryVenues.some(v => v.id === venue)
              
              // 既存の公演があるかチェック（公演追加のグレーアウト用）
              const contextTimeSlot = timeSlot === 'morning' ? 'morning' : timeSlot === 'afternoon' ? 'afternoon' : 'evening'
              const hasExisting = modals.contextMenu.hasExistingEvent?.(date, venue, contextTimeSlot) ?? false
              
              // 募集中止されているかチェック
              const isBlocked = isSlotBlocked(date, venue, contextTimeSlot)
              
              // 公演追加不可の条件: 既存公演あり OR 募集中止
              const cannotAddPerformance = hasExisting || isBlocked
              const addLabel = isBlocked ? '公演を追加（募集中止）' : hasExisting ? '公演を追加（既存あり）' : '公演を追加'
              
              return [
                {
                  label: addLabel,
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    logger.log('🔵 公演を追加クリック:', { date, venue, timeSlot })
                    logger.log('🔵 modals:', modals)
                    logger.log('🔵 modals.performance:', modals.performance)
                    logger.log('🔵 modals.performance のキー:', modals.performance ? Object.keys(modals.performance) : 'undefined')
                    if (modals.performance && modals.performance.handleOpenPerformanceModal) {
                      modals.performance.handleOpenPerformanceModal(date, venue, timeSlot)
                      modals.contextMenu.setContextMenu(null)
                    } else {
                      logger.error('❌ modals.performance.handleOpenPerformanceModal が見つかりません')
                      logger.error('❌ 利用可能なキー:', modals.performance ? Object.keys(modals.performance) : 'なし')
                    }
                  },
                  disabled: cannotAddPerformance,
                  separator: true
                },
                {
                  label: isBlocked ? '募集を再開' : '募集を中止',
                  icon: isBlocked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
                  onClick: () => {
                    if (isBlocked) {
                      unblockSlot(date, venue, contextTimeSlot)
                      showToast.success('募集を再開しました')
                    } else {
                      blockSlot(date, venue, contextTimeSlot)
                      showToast.success('募集を中止しました')
                    }
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を追加',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => {
                    // その日付で既に使用されている臨時会場を確認
                    const usedVenueIds = temporaryVenues
                      .filter(v => v.temporary_dates?.includes(date))
                      .map(v => v.id)
                    
                    // まだ使用されていない最初の臨時会場を選択
                    const nextVenue = availableVenues.find(v => !usedVenueIds.includes(v.id))
                    
                    if (nextVenue) {
                      // 会場名を入力してもらう
                      const customName = window.prompt('臨時会場の名前を入力してください（例: スペースマーケット渋谷）', '')
                      // キャンセル時は追加しない
                      if (customName === null) {
                        modals.contextMenu.setContextMenu(null)
                        return
                      }
                      addTemporaryVenue(date, nextVenue.id, customName || undefined)
                    } else {
                      showToast.warning('すべての臨時会場が使用されています')
                    }
                    
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場名を変更',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    const currentName = getVenueNameForDate(venue, date)
                    const newName = window.prompt('新しい会場名を入力してください', currentName)
                    if (newName !== null && newName !== currentName) {
                      updateVenueName(date, venue, newName)
                    }
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    if (confirm(`${date}から臨時会場を削除しますか？`)) {
                      removeTemporaryVenue(date, venue)
                    }
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue,
                  separator: true
                },
                {
                  label: 'ペースト',
                  icon: <Clipboard className="w-4 h-4" />,
                  onClick: () => {
                    const { date, venue, timeSlot } = modals.contextMenu.contextMenu!.cellInfo!
                    modals.contextMenu.handlePasteFromClipboard(date, venue, timeSlot)
                  },
                  disabled: !modals.contextMenu.clipboardEvent || venue === '',
                  separator: true
                },
                {
                  label: '履歴を表示',
                  icon: <Clock className="w-4 h-4" />,
                  onClick: () => {
                    const dbTimeSlotMap: Record<string, string> = { 'morning': '朝', 'afternoon': '昼', 'evening': '夜' }
                    const stores = scheduleTableProps.viewConfig.stores
                    const storeName = stores.find(s => s.id === venue)?.name || venue
                    const timeSlotLabel = dbTimeSlotMap[timeSlot] || ''
                    setHistoryModal({
                      isOpen: true,
                      cellInfo: { date, storeId: venue, timeSlot: dbTimeSlotMap[timeSlot] || null },
                      title: `${date} ${storeName} ${timeSlotLabel} の更新履歴`
                    })
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: venue === ''
                }
              ]
            })() : modals.contextMenu.contextMenu.type === 'date' && modals.contextMenu.contextMenu.dateInfo ? (() => {
              // 日付セルの右クリックメニュー
              const { date } = modals.contextMenu.contextMenu!.dateInfo!
              const isHoliday = isCustomHoliday(date)
              
              return [
                {
                  label: isHoliday ? '休日設定を解除' : '休日に設定',
                  icon: <Calendar className="w-4 h-4" />,
                  onClick: async () => {
                    await toggleHoliday(date)
                    modals.contextMenu.setContextMenu(null)
                  }
                }
              ]
            })() : []}
        />
      )}

      {/* 履歴モーダル */}
      <HistoryModal
        isOpen={historyModal.isOpen}
        onClose={() => setHistoryModal({ isOpen: false })}
        cellInfo={historyModal.cellInfo}
        organizationId={organizationId || undefined}
        title={historyModal.title}
        stores={scheduleTableProps.viewConfig.stores}
      />

      {/* キット配置管理ダイアログ */}
      <KitManagementDialog
        isOpen={isKitManagementOpen}
        onClose={() => setIsKitManagementOpen(false)}
      />
    </AppLayout>
  )
}
