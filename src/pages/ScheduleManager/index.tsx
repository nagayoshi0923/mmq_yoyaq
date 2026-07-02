// React
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

// API
import { staffApi, scheduleApi, salesApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'

// Custom Hooks
import { useRouteScrollControls } from '@/contexts/RouteScrollRestorationContext'
import { useLocalState } from '@/hooks/useLocalState'
import { useScheduleTable } from '@/hooks/useScheduleTable'
import { useTemporaryVenues } from '@/hooks/useTemporaryVenues'
import { useOrganization } from '@/hooks/useOrganization'
import { useBlockedSlots } from '@/hooks/useBlockedSlots'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { useAuth } from '@/contexts/AuthContext'

// Custom Hooks (ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useGmStats } from './hooks/useGmStats'

// Types
import type { Staff } from '@/types'

// Layout Components
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'

// UI Components
import { Button } from '@/components/ui/button'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { ConfirmDialog } from '@/components/patterns/modal'

// Schedule Components（常時表示）
import { CategoryGmStatsBar } from '@/components/schedule/CategoryGmStatsBar'
import { computeScheduleWarnings } from '@/utils/scheduleWarnings'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'

// Icons
import { CalendarDays } from 'lucide-react'

// Utils
import { getJapaneseHoliday } from '@/utils/japaneseHolidays'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { exportScheduleToCSV, exportScheduleRangeToZip } from './utils/exportSchedule'
import { type FillSeatsCategory } from './components/FillSeatsModal'
import { ScheduleToolbar } from './components/ScheduleToolbar'
import { ScheduleMobileFilters } from './components/ScheduleMobileFilters'
import { ScheduleModals } from './components/ScheduleModals'
import { getParticipationFee, type ScenarioPricing } from '@/lib/pricing'

// Types
import type { ScheduleEvent } from '@/types/schedule'
export type { ScheduleEvent }

export function ScheduleManager() {
  // 認証情報（権限チェック用）
  const { user } = useAuth()
  const isAdminOrLicenseAdmin = user?.role === 'admin' || user?.role === 'license_admin'
  
  // 月ナビゲーション
  const { clearScrollPosition } = useRouteScrollControls()
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(clearScrollPosition)

  // キーボードショートカット: ← 前月 / → 次月 / T 今月
  useKeyboardShortcut('ArrowLeft', useCallback(() => {
    if (clearScrollPosition) clearScrollPosition()
    setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d })
  }, [setCurrentDate, clearScrollPosition]))
  useKeyboardShortcut('ArrowRight', useCallback(() => {
    if (clearScrollPosition) clearScrollPosition()
    setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d })
  }, [setCurrentDate, clearScrollPosition]))
  useKeyboardShortcut('t', useCallback(() => {
    if (clearScrollPosition) clearScrollPosition()
    setCurrentDate(new Date())
  }, [setCurrentDate, clearScrollPosition]))

  // 臨時会場管理
  const { temporaryVenues, availableVenues, getVenueNameForDate, addTemporaryVenue, updateVenueName, removeTemporaryVenue } = useTemporaryVenues(currentDate)
  
  // 組織ID（履歴モーダル用）
  const { organizationId } = useOrganization()
  
  // 募集中止スロット管理
  const { isSlotBlocked, blockSlot, unblockSlot } = useBlockedSlots()
  
  // カスタム休日管理
  const { isCustomHoliday, toggleHoliday } = useCustomHolidays()

  // GMリスト（scheduleStaff キャッシュから初期化して即座に表示 → selectedGMs フィルターが空白にならない）
  const [gmList, setGmList] = useState<Staff[]>(() => {
    try {
      const cached = sessionStorage.getItem('scheduleStaff')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [selectedGMs, setSelectedGMs] = useLocalState<string[]>('scheduleSelectedGMs', [])

  // 店舗フィルター（localStorageで次回以降も同じ店舗を保持）
  // 店舗フィルタは永続させず、初期は未選択（＝全表示）。空のとき filteredStores は
  // 全店舗を返し、臨時会場も出る。選択はそのセッション中のフォーカス用途（オーナー指示）
  const [selectedStores, setSelectedStores] = useState<string[]>([])

  // シフト提出者フィルター（空スロットに表示されるシフト提出者を絞り込む）
  const [selectedShiftStaff, setSelectedShiftStaff] = useState<string[]>([])

  // シナリオ検索（単一選択）
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([])

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isKitManagementOpen, setIsKitManagementOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isFillingSeats, setIsFillingSeats] = useState(false)
  const [isFillSeatsModalOpen, setIsFillSeatsModalOpen] = useState(false)
  const [isFixingData, setIsFixingData] = useState(false)
  const [isCleaningDemo, setIsCleaningDemo] = useState(false)
  const [isFixAllDataConfirmOpen, setIsFixAllDataConfirmOpen] = useState(false)
  const [isCleanupBadDemoConfirmOpen, setIsCleanupBadDemoConfirmOpen] = useState(false)
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

  // テーブル列ヘッダーの同期用 ref
  const colHeaderScrollRef = useRef<HTMLDivElement>(null)
  const colHeaderInnerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tableScroll = document.querySelector('[data-schedule-scroll]') as HTMLElement | null
    const header = colHeaderScrollRef.current
    if (!tableScroll || !header) return

    // 横スクロールを同期
    const onScroll = () => { header.scrollLeft = tableScroll.scrollLeft }
    tableScroll.addEventListener('scroll', onScroll, { passive: true })

    // テーブルの実際の列幅をヘッダーに反映（ResizeObserver で追跡）
    const syncColWidths = () => {
      const table = tableScroll.querySelector('table')
      const inner = colHeaderInnerRef.current
      if (!table || !inner) return

      // colgroup の col 要素から幅を取得
      const cols = table.querySelectorAll('col')
      if (!cols.length) return

      // table の実際の BoundingRect で絶対幅を計算
      const tableRect = table.getBoundingClientRect()
      const totalWidth = tableRect.width
      const headerRect = header.getBoundingClientRect()

      inner.style.width = `${totalWidth}px`
      inner.style.marginLeft = `${tableRect.left - headerRect.left}px`

      // 各列の幅をヘッダー列に適用
      const headerCols = inner.querySelectorAll<HTMLElement>('[data-col]')
      const tableCells = table.querySelector('tbody tr')?.querySelectorAll('td') ??
                         table.querySelector('thead tr')?.querySelectorAll('th')
      if (!tableCells) return

      headerCols.forEach((col, i) => {
        const cell = tableCells[i]
        if (cell) col.style.width = `${cell.getBoundingClientRect().width}px`
      })
    }

    // リサイズ時の連続発火を 50ms debounce で抑制
    let debounceTimer: ReturnType<typeof setTimeout>
    const debouncedSync = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(syncColWidths, 50)
    }

    const ro = new ResizeObserver(debouncedSync)
    ro.observe(tableScroll)

    // テーブルの行が描画されるまで少し待つ
    const timer = setTimeout(syncColWidths, 100)

    return () => {
      tableScroll.removeEventListener('scroll', onScroll)
      ro.disconnect()
      clearTimeout(debounceTimer)
      clearTimeout(timer)
    }
  }, [])
  
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

  // スケジュールCSVエクスポート（期間指定）
  const handleExportRange = async (startYM: string, endYM: string) => {
    setIsExporting(true)
    try {
      const [sy, sm] = startYM.split('-').map(Number)
      const [ey, em] = endYM.split('-').map(Number)
      const totalMonths = (ey - sy) * 12 + (em - sm) + 1

      if (totalMonths === 1) {
        const lastDay = new Date(sy, sm, 0).getDate()
        const startDate = `${startYM}-01`
        const endDate = `${startYM}-${String(lastDay).padStart(2, '0')}`
        const rows = await salesApi.getScheduleExportData(startDate, endDate)
        exportScheduleToCSV(rows, startYM.replace('-', ''))
      } else {
        const monthlyData: { yearMonth: string; rows: Awaited<ReturnType<typeof salesApi.getScheduleExportData>> }[] = []
        for (let i = 0; i < totalMonths; i++) {
          const d = new Date(sy, sm - 1 + i, 1)
          const y = d.getFullYear()
          const m = d.getMonth() + 1
          const ym = `${y}-${String(m).padStart(2, '0')}`
          const lastDay = new Date(y, m, 0).getDate()
          const startDate = `${ym}-01`
          const endDate = `${ym}-${String(lastDay).padStart(2, '0')}`
          const rows = await salesApi.getScheduleExportData(startDate, endDate)
          monthlyData.push({ yearMonth: ym.replace('-', ''), rows })
        }
        const rangeLabel = `${startYM.replace('-', '')}-${endYM.replace('-', '')}`
        await exportScheduleRangeToZip(monthlyData, rangeLabel)
      }

      setIsExportModalOpen(false)
    } catch (e) {
      showToast.error('CSVエクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  // D-5d: 対象公演数のカウント（FillSeatsModal の確認ステップ用。handleFillAllSeats 冒頭の SELECT と同一条件）
  // カテゴリ別の内訳表示のため、選択カテゴリごとに count クエリを並列実行する
  const fetchFillSeatsTargetCount = async (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }): Promise<{ total: number; byCategory: { category: FillSeatsCategory; count: number }[] }> => {
    const { startDate, endDate, categories } = params
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織情報が取得できません')
    }
    const results = await Promise.all(
      categories.map(async (cat) => {
        const { count, error } = await supabase
          .from('schedule_events_staff_view')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('date', startDate)
          .lte('date', endDate)
          .eq('is_cancelled', false)
          .eq('category', cat)
        if (error) {
          throw new Error(getSafeErrorMessage(error, '対象件数の取得に失敗しました'))
        }
        return { category: cat, count: count ?? 0 }
      })
    )
    const total = results.reduce((sum, r) => sum + r.count, 0)
    return { total, byCategory: results }
  }

  // 中止以外を満席にする処理（参加者数を定員に合わせる）
  const handleFillAllSeats = async (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }) => {
    const { startDate, endDate, categories } = params

    setIsFillingSeats(true)
    try {
      // 組織IDを最初に取得
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        return
      }

      // まず対象のイベントを取得（シナリオの定員情報も含む、現在の組織のみ）
      const { data: events, error: fetchError } = await supabase
        .from('schedule_events_staff_view')
        .select('id, scenario, category, max_participants, capacity, current_participants, date, start_time, scenario_id, scenario_master_id, store_id, gms, scenario_masters:scenario_master_id(player_count_max)')
        .eq('organization_id', orgId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_cancelled', false)
        .in('category', categories)
      
      if (fetchError) {
        showToast.error(getSafeErrorMessage(fetchError, 'データの取得に失敗しました'))
        return
      }
      
      logger.log(`📊 満席処理対象: ${startDate} 〜 ${endDate} (${categories.join(',')}) ${events?.length || 0}件`)
      
      // シナリオ情報を一括取得（参加費・所要時間）
      const scenarioMasterIds = [...new Set(
        (events || [])
          .map(e => e.scenario_master_id || e.scenario_id)
          .filter(Boolean)
      )]
      
      const scenarioInfoMap = new Map<string, { duration: number; pricing: ScenarioPricing }>()
      if (scenarioMasterIds.length > 0) {
        const { data: scenarioInfos } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, duration, participation_fee, gm_test_participation_fee, participation_costs')
          .eq('organization_id', orgId)
          .in('scenario_master_id', scenarioMasterIds)

        scenarioInfos?.forEach(s => {
          if (s.scenario_master_id) {
            scenarioInfoMap.set(s.scenario_master_id, {
              duration: s.duration || 120,
              pricing: {
                participation_fee: s.participation_fee ?? null,
                gm_test_participation_fee: s.gm_test_participation_fee ?? null,
                participation_costs: s.participation_costs ?? null,
              },
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
          const isGmTest = (event as { category?: string }).category === 'gmtest'
          const participationFee = getParticipationFee(scenarioInfo?.pricing, isGmTest ? 'gmtest' : 'normal')
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

  // 単体イベントを満席にする（デモ参加者で埋める）
  const handleFillSeatsForEvent = async (event: ScheduleEvent) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        return
      }

      // 最新の event 情報と既存予約を取得
      const { data: ev, error: evError } = await supabase
        .from('schedule_events_staff_view')
        .select('id, scenario, max_participants, capacity, current_participants, date, start_time, scenario_id, scenario_master_id, store_id, gms, category, scenario_masters:scenario_master_id(player_count_max)')
        .eq('id', event.id)
        .single()
      if (evError || !ev) {
        showToast.error(getSafeErrorMessage(evError, 'イベント情報の取得に失敗しました'))
        return
      }

      const scenarioMax = (ev.scenario_masters as { player_count_max?: number } | null)?.player_count_max
      const baseMax = scenarioMax || ev.max_participants || ev.capacity || 8
      const maxParticipants = ev.capacity ? Math.min(baseMax, ev.capacity) : baseMax

      if ((ev.current_participants || 0) >= maxParticipants) {
        showToast.info('既に満席です')
        return
      }

      const { data: reservations } = await supabase
        .from('reservations')
        .select('participant_count, participant_names')
        .eq('schedule_event_id', ev.id)
        .in('status', ['confirmed', 'pending'])

      const currentReservedCount = (reservations || []).reduce((sum, r) => sum + (r.participant_count || 0), 0)
      const neededParticipants = maxParticipants - currentReservedCount
      const hasDemoParticipant = (reservations || []).some(r =>
        r.participant_names?.includes('デモ参加者') ||
        r.participant_names?.some((name: string) => name.includes('デモ'))
      )

      if (neededParticipants <= 0 || hasDemoParticipant) {
        // current_participants だけ揃える
        await supabase
          .from('schedule_events')
          .update({ current_participants: maxParticipants })
          .eq('id', ev.id)
        showToast.success('満席に設定しました')
        return
      }

      // シナリオ情報取得（参加費・所要時間）
      const scenarioMasterId = ev.scenario_master_id || ev.scenario_id
      let participationFee = 0
      let duration = 120
      if (scenarioMasterId) {
        const { data: scenarioInfo } = await supabase
          .from('organization_scenarios_with_master')
          .select('duration, participation_fee, gm_test_participation_fee, participation_costs')
          .eq('organization_id', orgId)
          .eq('scenario_master_id', scenarioMasterId)
          .maybeSingle()
        if (scenarioInfo) {
          const isGmTest = ev.category === 'gmtest'
          participationFee = getParticipationFee(scenarioInfo as ScenarioPricing, isGmTest ? 'gmtest' : 'normal')
          duration = scenarioInfo.duration || 120
        }
      }

      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      const reservationNumber = `${dateStr}-${randomStr}`

      const { error: insertError } = await supabase
        .from('reservations')
        .insert({
          schedule_event_id: ev.id,
          organization_id: orgId,
          title: ev.scenario || '',
          scenario_master_id: ev.scenario_master_id || ev.scenario_id || null,
          store_id: ev.store_id || null,
          customer_id: null,
          customer_notes: `デモ参加者${neededParticipants}名`,
          requested_datetime: `${ev.date}T${ev.start_time}+09:00`,
          duration,
          participant_count: neededParticipants,
          participant_names: Array(neededParticipants).fill(null).map((_, i) =>
            neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`
          ),
          assigned_staff: ev.gms || [],
          base_price: participationFee * neededParticipants,
          options_price: 0,
          total_price: participationFee * neededParticipants,
          discount_amount: 0,
          final_price: participationFee * neededParticipants,
          payment_method: 'onsite',
          payment_status: 'paid',
          status: 'confirmed',
          reservation_source: RESERVATION_SOURCE.DEMO,
          reservation_number: reservationNumber,
        })
      if (insertError) {
        showToast.error(getSafeErrorMessage(insertError, 'デモ参加者の作成に失敗しました'))
        return
      }

      await supabase
        .from('schedule_events')
        .update({ current_participants: maxParticipants })
        .eq('id', ev.id)

      showToast.success(`満席に設定しました（デモ参加者 ${neededParticipants}名追加）`)
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    }
  }

  // 全期間のデータ修復（予約レコードがないのにcurrent_participantsが設定されている公演を修復）
  const handleFixAllData = () => {
    setIsFixAllDataConfirmOpen(true)
  }

  const runFixAllData = async () => {
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

  // テストプレイの誤デモ予約削除 & GMテスト参加費の修正
  const handleCleanupBadDemoReservations = () => {
    setIsCleanupBadDemoConfirmOpen(true)
  }

  const runCleanupBadDemoReservations = async () => {
    setIsCleaningDemo(true)
    let deletedCount = 0
    let fixedCount = 0

    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        setIsCleaningDemo(false)
        return
      }

      // ─── ① テストプレイのデモ予約を削除 ───
      const { data: testplayEvents } = await supabase
        .from('schedule_events')
        .select('id')
        .eq('organization_id', orgId)
        .eq('category', 'testplay')

      if (testplayEvents && testplayEvents.length > 0) {
        const testplayIds = testplayEvents.map(e => e.id)
        const { data: demoReservations } = await supabase
          .from('reservations')
          .select('id, schedule_event_id')
          .eq('organization_id', orgId)
          .in('schedule_event_id', testplayIds)
          .in('reservation_source', [RESERVATION_SOURCE.DEMO, RESERVATION_SOURCE.DEMO_AUTO])

        if (demoReservations && demoReservations.length > 0) {
          const ids = demoReservations.map(r => r.id)
          // eslint-disable-next-line no-restricted-syntax
          await supabase.from('reservations').delete().in('id', ids)
          deletedCount = ids.length

          const affectedIds = [...new Set(demoReservations.map(r => r.schedule_event_id))]
          await Promise.all(affectedIds.map(id => recalculateCurrentParticipants(id)))
        }
      }

      // ─── ② GMテストのデモ予約の参加費を修正 ───
      const { data: gmtestEvents } = await supabase
        .from('schedule_events')
        .select('id, scenario_master_id')
        .eq('organization_id', orgId)
        .eq('category', 'gmtest')

      if (gmtestEvents && gmtestEvents.length > 0) {
        const gmtestIds = gmtestEvents.map(e => e.id)
        const eventScenarioMap = new Map(gmtestEvents.map(e => [e.id, e.scenario_master_id]))

        const { data: demoReservations } = await supabase
          .from('reservations')
          .select('id, schedule_event_id, participant_count')
          .eq('organization_id', orgId)
          .in('schedule_event_id', gmtestIds)
          .in('reservation_source', [RESERVATION_SOURCE.DEMO, RESERVATION_SOURCE.DEMO_AUTO])

        if (demoReservations && demoReservations.length > 0) {
          const scenarioMasterIds = [...new Set(gmtestEvents.map(e => e.scenario_master_id).filter(Boolean))]
          const { data: orgScenarios } = await supabase
            .from('organization_scenarios_with_master')
            .select('scenario_master_id, participation_fee, gm_test_participation_fee, participation_costs')
            .eq('organization_id', orgId)
            .in('scenario_master_id', scenarioMasterIds)

          const feeMap = new Map(orgScenarios?.map(s => [s.scenario_master_id, s]) || [])

          await Promise.all(
            demoReservations.map(async (r) => {
              const scenarioMasterId = eventScenarioMap.get(r.schedule_event_id)
              const scenarioInfo = scenarioMasterId ? feeMap.get(scenarioMasterId) : null
              const correctFee = getParticipationFee(scenarioInfo as ScenarioPricing | null, 'gmtest')
              const totalPrice = correctFee * (r.participant_count || 1)

              // eslint-disable-next-line no-restricted-syntax
              await supabase
                .from('reservations')
                .update({ base_price: totalPrice, total_price: totalPrice, final_price: totalPrice })
                .eq('id', r.id)
              fixedCount++
            })
          )
        }
      }

      const messages: string[] = []
      if (deletedCount > 0) messages.push(`テストプレイの誤デモ予約 ${deletedCount}件を削除`)
      if (fixedCount > 0) messages.push(`GMテストの参加費 ${fixedCount}件を修正`)
      if (messages.length === 0) messages.push('修正対象はありませんでした')
      showToast.success(messages.join('、'))
      scheduleTableProps.fetchSchedule?.()
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsCleaningDemo(false)
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
    // 公演数降順 → 名前昇順
    return [...map.values()].sort((a, b) => {
      const aCount = scheduledCount.get(a.id) || 0
      const bCount = scheduledCount.get(b.id) || 0
      if (bCount !== aCount) return bCount - aCount
      return a.name.localeCompare(b.name, 'ja')
    })
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
  const { selectedCategories, setSelectedCategories, categoryCounts } = useCategoryFilter(allEventsForMonth)

  // 警告対象公演リスト (シナリオ/GM未定 + 60分未満インターバル)
  const scheduleWarnings = useMemo(
    () => computeScheduleWarnings(
      allEventsForMonth,
      scheduleTableProps.dataProvider.intervalWarningEventIds ?? new Set<string>(),
      scheduleTableProps.viewConfig.stores,
      scheduleTableProps.dataProvider.kitWarningEventIds ?? new Set<string>(),
    ),
    [allEventsForMonth, scheduleTableProps.dataProvider.intervalWarningEventIds, scheduleTableProps.dataProvider.kitWarningEventIds, scheduleTableProps.viewConfig.stores]
  )

  // カテゴリオプション（開催予定数・中止数付き）
  const categoryOptions = useMemo(() => {
    const defs = [
      { id: 'open', name: 'オープン' },
      { id: 'private', name: '貸切' },
      { id: 'gmtest', name: 'GMテスト' },
      { id: 'testplay', name: 'テスト' },
      { id: 'trip', name: '出張' },
      { id: 'mtg', name: 'MTG' },
    ]
    const cancelledCount: Record<string, number> = {}
    const activeCount: Record<string, number> = {}
    allEventsForMonth.forEach(event => {
      if (event.is_cancelled) {
        cancelledCount[event.category] = (cancelledCount[event.category] || 0) + 1
      } else {
        activeCount[event.category] = (activeCount[event.category] || 0) + 1
      }
    })
    return defs.map(def => {
      const active = activeCount[def.id] || 0
      const cancelled = cancelledCount[def.id] || 0
      return {
        id: def.id,
        name: def.name,
        displayInfo: (
          <span className="flex items-center gap-0.5 text-xs">
            <span className="text-foreground font-medium">{active}</span>
            <span className="text-muted-foreground">/</span>
            <span className={cancelled > 0 ? 'text-orange-500 font-medium' : 'text-muted-foreground'}>{cancelled}</span>
          </span>
        ),
        displayInfoSearchText: `${active}/${cancelled}`
      }
    })
  }, [allEventsForMonth])

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

      // カテゴリーフィルター（複数選択対応）
      if (selectedCategories.length > 0) {
        events = events.filter(event => selectedCategories.includes(event.category))
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
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategories, selectedScenarioId, scenarioMatchesEvent, selectedGMs, gmList])

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
      if (selectedCategories.length > 0 && !selectedCategories.includes(event.category)) continue
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
    selectedCategories,
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
      containerPadding="px-[10px] py-0"
      className="mx-auto"
      stickyLayout
    >
      {/* ツールバー（sticky） */}
      <div data-schedule-toolbar className="sticky top-0 z-40 bg-background border-b -mx-[10px] px-[10px]">
        {/* 見出し（sticky に含めて消えないようにする / mb-2 は sticky 高さを抑えるため） */}
        <PageHeader
          title={<><CalendarDays className="h-5 w-5 text-primary" />スケジュール管理</>}
          description={`${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`}
          className="mb-2 pt-2"
        />
        <ScheduleToolbar
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          scheduleTableProps={scheduleTableProps}
          gmList={gmList}
          selectedGMs={selectedGMs}
          setSelectedGMs={setSelectedGMs}
          selectedStores={selectedStores}
          setSelectedStores={setSelectedStores}
          scenarioOptions={scenarioOptions}
          selectedScenarioIds={selectedScenarioIds}
          setSelectedScenarioIds={setSelectedScenarioIds}
          shiftStaffOptions={shiftStaffOptions}
          selectedShiftStaff={selectedShiftStaff}
          setSelectedShiftStaff={setSelectedShiftStaff}
          categoryOptions={categoryOptions}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          selectedScenarioId={selectedScenarioId}
          selectedScenarioTitle={selectedScenarioTitle}
          scenarioMatchedDates={scenarioMatchedDates}
          jumpScenarioMatch={jumpScenarioMatch}
          scrollToDate={scrollToDate}
          showMobileFilters={showMobileFilters}
          setShowMobileFilters={setShowMobileFilters}
          isAdminOrLicenseAdmin={isAdminOrLicenseAdmin}
          handleCleanupBadDemoReservations={handleCleanupBadDemoReservations}
          isCleaningDemo={isCleaningDemo}
          setIsFillSeatsModalOpen={setIsFillSeatsModalOpen}
          isFillingSeats={isFillingSeats}
          setIsKitManagementOpen={setIsKitManagementOpen}
          setIsExportModalOpen={setIsExportModalOpen}
          isExporting={isExporting}
          setIsImportModalOpen={setIsImportModalOpen}
        />

        {/* モバイル用フィルターパネル */}
        {showMobileFilters && (
          <ScheduleMobileFilters
            gmList={gmList}
            scheduleTableProps={scheduleTableProps}
            selectedGMs={selectedGMs}
            setSelectedGMs={setSelectedGMs}
            selectedStores={selectedStores}
            setSelectedStores={setSelectedStores}
            scenarioOptions={scenarioOptions}
            selectedScenarioIds={selectedScenarioIds}
            setSelectedScenarioIds={setSelectedScenarioIds}
            categoryOptions={categoryOptions}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
          />
        )}

        {/* カテゴリ + GM統計（統合バー） */}
        <div className="py-0.5 border-t border-muted/50">
          <CategoryGmStatsBar
            selectedCategories={selectedCategories}
            onCategoryChange={setSelectedCategories}
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
            warnings={scheduleWarnings}
            onWarningClick={(w) => {
              const target = allEventsForMonth.find(e => e.id === w.eventId)
              if (target) scheduleTableProps.eventHandlers.onEditPerformance(target)
            }}
          />
        </div>
        
        {/* テーブルヘッダー行（操作行に統合してstickyに） */}
        {/* JS でテーブル実測値を適用 → 列幅が常にピクセル単位で一致 */}
        <div className="overflow-x-hidden border-t -mx-[10px]" ref={colHeaderScrollRef}>
          <div className="flex bg-muted" ref={colHeaderInnerRef}>
            <div data-col className="shrink-0 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight w-[32px] sm:w-[40px] md:w-[48px]">
              <span className="hidden sm:inline">日付</span>
              <span className="sm:hidden">日</span>
            </div>
            <div data-col className="shrink-0 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight w-[24px] sm:w-[28px] md:w-[32px]">
              <span className="hidden sm:inline">会場</span>
              <span className="sm:hidden">店</span>
            </div>
            <div data-col className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">午前</div>
            <div data-col className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">午後</div>
            <div data-col className="flex-1 border-r text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight">夜</div>
            <div data-col className="shrink-0 text-[10px] sm:text-xs font-bold py-0.5 text-center leading-tight w-[160px]">メモ</div>
          </div>
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

      {/* モーダル・ダイアログ群（遅延ロード） */}
      <ScheduleModals
        modals={modals}
        scheduleTableProps={scheduleTableProps}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        isExportModalOpen={isExportModalOpen}
        setIsExportModalOpen={setIsExportModalOpen}
        handleExportRange={handleExportRange}
        isExporting={isExporting}
        isFillSeatsModalOpen={isFillSeatsModalOpen}
        setIsFillSeatsModalOpen={setIsFillSeatsModalOpen}
        handleFillAllSeats={handleFillAllSeats}
        fetchFillSeatsTargetCount={fetchFillSeatsTargetCount}
        isFillingSeats={isFillingSeats}
        isImportModalOpen={isImportModalOpen}
        setIsImportModalOpen={setIsImportModalOpen}
        temporaryVenues={temporaryVenues}
        availableVenues={availableVenues}
        addTemporaryVenue={addTemporaryVenue}
        removeTemporaryVenue={removeTemporaryVenue}
        updateVenueName={updateVenueName}
        getVenueNameForDate={getVenueNameForDate}
        historyModal={historyModal}
        setHistoryModal={setHistoryModal}
        handleFillSeatsForEvent={handleFillSeatsForEvent}
        isSlotBlocked={isSlotBlocked}
        blockSlot={blockSlot}
        unblockSlot={unblockSlot}
        isCustomHoliday={isCustomHoliday}
        toggleHoliday={toggleHoliday}
        organizationId={organizationId}
        isKitManagementOpen={isKitManagementOpen}
        setIsKitManagementOpen={setIsKitManagementOpen}
      />

      {/* 全期間の公演データ修復 確認ダイアログ */}
      <ConfirmDialog
        open={isFixAllDataConfirmOpen}
        onOpenChange={setIsFixAllDataConfirmOpen}
        title="全期間の公演データを修復しますか？"
        message="予約レコードがない公演にデモ参加者を追加します。"
        confirmLabel="実行する"
        variant="default"
        onConfirm={runFixAllData}
      />

      {/* 過去の誤ったデモ予約修正 確認ダイアログ */}
      <ConfirmDialog
        open={isCleanupBadDemoConfirmOpen}
        onOpenChange={setIsCleanupBadDemoConfirmOpen}
        title="過去の誤ったデモ予約を修正しますか？"
        message={'・テストプレイ公演のデモ予約を削除\n・GMテスト公演のデモ予約の参加費をGMテスト料金に修正'}
        confirmLabel="実行する"
        variant="default"
        onConfirm={runCleanupBadDemoReservations}
      />
    </AppLayout>
  )
}
