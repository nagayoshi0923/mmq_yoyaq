// React
import { useState, useEffect, useMemo, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// API
import { staffApi, scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'

// Custom Hooks
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useScheduleTable } from '@/hooks/useScheduleTable'
import { useTemporaryVenues } from '@/hooks/useTemporaryVenues'

// Custom Hooks (ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'

// Types
import type { Staff } from '@/types'

// Layout Components
import { AppLayout } from '@/components/layout/AppLayout'

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
import { CategoryTabs } from '@/components/schedule/CategoryTabs'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'

// Icons
import { Ban, Edit, RotateCcw, Trash2, Plus, CalendarDays, Upload, FileText, EyeOff, Eye } from 'lucide-react'

// Utils
import { getJapaneseHoliday } from '@/utils/japaneseHolidays'

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 月ナビゲーション
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: false })
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(scrollRestoration.clearScrollPosition)

  // 臨時会場管理
  const { temporaryVenues, availableVenues, getVenueNameForDate, addTemporaryVenue, updateVenueName, removeTemporaryVenue } = useTemporaryVenues(currentDate)

  // GMリスト
  const [gmList, setGmList] = useState<Staff[]>([])
  const [selectedGMs, setSelectedGMs] = useState<string[]>([])
  
  // 店舗フィルター
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  
  // シフト提出者フィルター（空スロットに表示されるシフト提出者を絞り込む）
  const [selectedShiftStaff, setSelectedShiftStaff] = useState<string[]>([])

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isFillingSeats, setIsFillingSeats] = useState(false)
  const [isFixingData, setIsFixingData] = useState(false)
  
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
    if (!confirm('中止以外の全公演を満席（参加者数＝定員）にしますか？')) return
    
    setIsFillingSeats(true)
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      // 月末日を正しく計算（翌月の0日 = 当月の最終日）
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      
      // シナリオリストを取得（名前で定員を検索するため）
      const { data: allScenarios } = await supabase
        .from('scenarios')
        .select('title, player_count_max')
      
      const scenarioByTitle = new Map<string, number>()
      allScenarios?.forEach(s => {
        if (s.title && s.player_count_max) {
          scenarioByTitle.set(s.title, s.player_count_max)
        }
      })
      
      // まず対象のイベントを取得（シナリオの定員情報も含む）
      const { data: events, error: fetchError } = await supabase
        .from('schedule_events')
        .select('id, scenario, max_participants, capacity, scenarios:scenario_id(player_count_max)')
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_cancelled', false)
      
      if (fetchError) {
        showToast.error(`取得エラー: ${fetchError.message}`)
        return
      }
      
      // シナリオ略称マッピング（略称 → 正式名称の一部）
      const SCENARIO_ALIAS: Record<string, string> = {
        'さきこさん': '裂き子さん',
        'サキコサン': '裂き子さん',
        'トレタリ': '撮れ高足りてますか',
        'ナナイロ橙': 'ナナイロの迷宮 橙',
        'ナナイロ緑': 'ナナイロの迷宮 緑',
        'ナナイロ黄': 'ナナイロの迷宮 黄',
        '童話裁判': '不思議の国の童話裁判',
        'TOOLS': 'TOOLS〜ぎこちない椅子',
        // 季節マダミス
        'カノケリ': '季節／カノケリ',
        'アニクシィ': '季節／アニクシィ',
        'シノポロ': '季節／シノポロ',
        'キモナス': '季節／キモナス',
        'ニィホン': '季節／ニィホン',
        // 数字の違い
        '凍てつくあなたに6つの灯火': '凍てつくあなたに６つの灯火',
        // REDRUM
        'REDRUM1': 'REDRUM01泉涌館の変転',
        // 傲慢女王
        '傲慢な女王とアリスの不条理裁判': '傲慢女王とアリスの不条理裁判',
        // 狂気山脈
        '狂気山脈1': '狂気山脈　陰謀の分水嶺（１）',
        '狂気山脈2': '狂気山脈　星降る天辺（２）',
        '狂気山脈3': '狂気山脈　薄明三角点（３）',
        '狂気山脈１': '狂気山脈　陰謀の分水嶺（１）',
        '狂気山脈２': '狂気山脈　星降る天辺（２）',
        '狂気山脈３': '狂気山脈　薄明三角点（３）',
        '狂気山脈2.5': '狂気山脈　2.5　頂上戦争',
        '狂気山脈２．５': '狂気山脈　2.5　頂上戦争',
        // ソルシエ
        'ソルシエ': 'SORCIER〜賢者達の物語〜',
        'SORCIER': 'SORCIER〜賢者達の物語〜',
        // 藍雨
        '藍雨': '藍雨廻逢',
        // TheRealFork
        "THEREALFOLK'30s": "TheRealFork30's",
        'THEREALFOLK': "TheRealFork30's",
        'TheRealFolk': "TheRealFork30's",
        // 表記ゆれ
        '真渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
        '真渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
        '渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '真・渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '土牢の悲鳴に谺して': '土牢に悲鳴は谺して',
        '百鬼の夜月光の影': '百鬼の夜、月光の影',
        'インビジブル亡霊列車': 'Invisible-亡霊列車-',
        'くずの葉の森': 'くずの葉のもり',
        'ドクターテラスの秘密の実験': 'ドクター・テラスの秘密の実験',
        'あるミステリーについて': 'あるマーダーミステリーについて',
      }
      
      // シナリオ名を正規化する関数
      const normalize = (s: string) => s
        .replace(/[\s\-・／/]/g, '') // スペース、ハイフン、中点、スラッシュを除去
        .toLowerCase()
      
      // シナリオ名からmax_participantsを検索する関数
      const findScenarioMax = (eventScenario: string): number | undefined => {
        // 0. 略称マッピングを適用
        const mappedScenario = SCENARIO_ALIAS[eventScenario] || eventScenario
        const normalizedEvent = normalize(mappedScenario)
        
        // 1. 完全一致（マッピング後）
        if (scenarioByTitle.has(mappedScenario)) {
          return scenarioByTitle.get(mappedScenario)
        }
        
        // 1b. 元のシナリオ名でも完全一致を試す
        if (scenarioByTitle.has(eventScenario)) {
          return scenarioByTitle.get(eventScenario)
        }
        
        // 2. 正規化後の完全一致
        for (const [title, max] of scenarioByTitle.entries()) {
          if (normalize(title) === normalizedEvent) {
            return max
          }
        }
        
        // 3. 部分一致（片方が片方を含む）
        for (const [title, max] of scenarioByTitle.entries()) {
          if (title.includes(eventScenario) || eventScenario.includes(title)) {
            return max
          }
        }
        
        // 4. 正規化後の部分一致
        for (const [title, max] of scenarioByTitle.entries()) {
          const normalizedTitle = normalize(title)
          if (normalizedTitle.includes(normalizedEvent) || normalizedEvent.includes(normalizedTitle)) {
            return max
          }
        }
        
        // 5. キーワード抽出マッチ（ナナイロ橙 → ナナイロの迷宮 橙）
        // イベント名からキーワードを抽出し、シナリオタイトルに全て含まれるか確認
        const eventKeywords = eventScenario.split(/[\s\-・／/]/).filter(k => k.length > 0)
        for (const [title, max] of scenarioByTitle.entries()) {
          const normalizedTitle = normalize(title)
          const allMatch = eventKeywords.every(kw => normalizedTitle.includes(normalize(kw)))
          if (allMatch && eventKeywords.length >= 1) {
            return max
          }
        }
        
        return undefined
      }
      
      // 各イベントの参加者数を定員に合わせ、デモ参加者の予約レコードも作成
      let successCount = 0
      for (const event of events || []) {
        // シナリオJOIN → イベントのmax_participants → capacity → シナリオ名検索 → デフォルト8人
        const scenarioMax = (event.scenarios as { player_count_max?: number } | null)?.player_count_max
        let maxParticipants = scenarioMax || event.max_participants || event.capacity
        
        // JOINが効かなかった場合、シナリオ名で検索
        if (!maxParticipants && event.scenario) {
          maxParticipants = findScenarioMax(event.scenario)
        }
        
        // それでも見つからない場合はデフォルト8
        if (!maxParticipants) {
          maxParticipants = 8
        }
        
        // 現在の予約を取得して実際の参加者数を確認
        const { data: reservations } = await supabase
          .from('reservations')
          .select('participant_count, participant_names')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        const currentReservedCount = reservations?.reduce((sum, r) => sum + (r.participant_count || 0), 0) || 0
        const neededParticipants = maxParticipants - currentReservedCount
        
        // デモ参加者が既に存在するかチェック
        const hasDemoParticipant = reservations?.some(r => 
          r.participant_names?.includes('デモ参加者') || 
          r.participant_names?.some((name: string) => name.includes('デモ'))
        )
        
        // 足りない分だけデモ参加者を追加
        if (neededParticipants > 0 && !hasDemoParticipant) {
          // イベントの詳細情報を取得
          const { data: eventDetails } = await supabase
            .from('schedule_events')
            .select('date, start_time, scenario_id, store_id, gms')
            .eq('id', event.id)
            .single()
          
          if (eventDetails) {
            // シナリオ情報を取得
            const { data: scenario } = await supabase
              .from('scenarios')
              .select('id, duration, participation_fee')
              .eq('id', eventDetails.scenario_id)
              .single()
            
            const participationFee = scenario?.participation_fee || 0
            const orgId = await getCurrentOrganizationId() || QUEENS_WALTZ_ORG_ID
            
            // デモ参加者の予約を作成
            const demoReservation = {
              schedule_event_id: event.id,
              organization_id: orgId,
              title: event.scenario || '',
              scenario_id: eventDetails.scenario_id || null,
              store_id: eventDetails.store_id || null,
              customer_id: null,
              customer_notes: `デモ参加者${neededParticipants}名`,
              requested_datetime: `${eventDetails.date}T${eventDetails.start_time}+09:00`,
              duration: scenario?.duration || 120,
              participant_count: neededParticipants,
              participant_names: Array(neededParticipants).fill(null).map((_, i) => 
                neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`
              ),
              assigned_staff: eventDetails.gms || [],
              base_price: participationFee * neededParticipants,
              options_price: 0,
              total_price: participationFee * neededParticipants,
              discount_amount: 0,
              final_price: participationFee * neededParticipants,
              payment_method: 'onsite',
              payment_status: 'paid',
              status: 'confirmed',
              reservation_source: 'demo'
            }
            
            await supabase.from('reservations').insert(demoReservation)
          }
        }
        
        // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
        try {
          await recalculateCurrentParticipants(event.id)
          successCount++
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }
      
      showToast.success(`${successCount}件を満席に設定しました`)
      // Realtimeで自動的にデータが更新されるため、ページリロードは不要
    } catch (err) {
      showToast.error(`エラー: ${err}`)
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
      showToast.error(`エラー: ${err}`)
    } finally {
      setIsFixingData(false)
    }
  }

  // スケジュールテーブルの共通フック
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = scheduleTableProps.modals

  // カテゴリーフィルター（ScheduleManager独自機能）
  const timeSlots = ['morning', 'afternoon', 'evening'] as const
  const { selectedCategory, setSelectedCategory, categoryCounts } = useCategoryFilter(
    scheduleTableProps.viewConfig.stores.flatMap(store => 
      timeSlots.flatMap(timeSlot => 
        monthDays.flatMap(day => 
          scheduleTableProps.dataProvider.getEventsForSlot(day.date, store.id, timeSlot)
        )
      )
    )
  )

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
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategory, selectedGMs, gmList])

  // 店舗フィルター適用版の店舗リスト
  const filteredStores = useMemo(() => {
    if (selectedStores.length === 0) {
      return scheduleTableProps.viewConfig.stores
    }
    return scheduleTableProps.viewConfig.stores.filter(store => 
      selectedStores.includes(store.id)
    )
  }, [scheduleTableProps.viewConfig.stores, selectedStores])

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
    }
  }), [scheduleTableProps, filteredStores, filteredGetEventsForSlot, temporaryVenues, selectedStores, filteredShiftData, getVenueNameForDate])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'schedule') {
        window.location.href = '/#' + hash
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
      {/* 操作行（PC:sticky、モバイル:通常） */}
      <div data-schedule-toolbar className="sticky top-0 z-40 bg-background border-b py-2 -mx-[10px] px-[10px]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">スケジュール管理</span>
          </div>
          <HelpButton topic="schedule" label="スケジュール管理マニュアル" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <MonthSwitcher
              value={currentDate}
              onChange={setCurrentDate}
              showToday
              quickJump
              enableKeyboard
            />
            
            {/* スタッフフィルター（シフト提出済みを上に、バッジ付き、複数選択対応） */}
            {gmList.length > 0 && (
              <div className="w-36 sm:w-52">
                <MultiSelect
                  options={(() => {
                    // シフトデータからシフト提出済みのスタッフIDを抽出
                    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
                    const staffWithShift = new Set<string>()
                    Object.values(shiftData).forEach((staffList: Staff[]) => {
                      staffList.forEach(s => staffWithShift.add(s.id))
                    })
                    
                    // シフト提出済みを上に並び替え
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
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                              提出済
                            </span>
                          ) : undefined,
                          displayInfoSearchText: hasShift ? '提出済' : undefined
                        }
                      })
                  })()}
                  selectedValues={selectedGMs}
                  onSelectionChange={setSelectedGMs}
                  placeholder="スタッフで絞込"
                  closeOnSelect={false}
                  useIdAsValue={true}
                />
              </div>
            )}
            
            {/* 店舗フィルター（複数選択対応） */}
            {scheduleTableProps.viewConfig.stores.length > 0 && (
              <div className="w-40 sm:w-48">
                <StoreMultiSelect
                  stores={scheduleTableProps.viewConfig.stores}
                  selectedStoreIds={selectedStores}
                  onStoreIdsChange={setSelectedStores}
                  hideLabel={true}
                  placeholder="店舗で絞込"
                  emptyText=""
                />
              </div>
            )}
            
            {/* シフト提出者フィルター（空スロットの提出者表示を絞り込む） */}
            {shiftStaffOptions.length > 0 && (
              <div className="w-36 sm:w-52">
                <MultiSelect
                  options={shiftStaffOptions}
                  selectedValues={selectedShiftStaff}
                  onSelectionChange={setSelectedShiftStaff}
                  placeholder="出勤者で絞込"
                  closeOnSelect={false}
                  useIdAsValue={true}
                />
              </div>
            )}

            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsImportModalOpen(true)}
              title="インポート"
              className="h-9 w-9"
            >
              <Upload className="h-4 w-4" />
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleFillAllSeats}
              disabled={isFillingSeats}
              title="中止以外を満席にする"
              className="h-9 text-xs"
            >
              {isFillingSeats ? '処理中...' : '全満席'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleFixAllData}
              disabled={isFixingData}
              title="予約レコードがない公演にデモ参加者を追加"
              className="h-9 text-xs"
            >
              {isFixingData ? '処理中...' : 'データ修復'}
            </Button>
          </div>

        {/* カテゴリータブ（コンパクト） */}
        <CategoryTabs
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categoryCounts={categoryCounts}
          compact
        />
        
        {/* テーブルヘッダー行（操作行に統合してstickyに） */}
        <div className="flex bg-muted border-t mt-1 -mx-[10px] px-[10px]">
          <div className="w-[32px] sm:w-[40px] md:w-[48px] shrink-0 border-r text-xs sm:text-sm font-bold py-1 text-center">
            <span className="hidden sm:inline">日付</span>
            <span className="sm:hidden">日</span>
          </div>
          <div className="w-[24px] sm:w-[28px] md:w-[32px] shrink-0 border-r text-xs sm:text-sm font-bold py-1 text-center">
            <span className="hidden sm:inline">会場</span>
            <span className="sm:hidden">店</span>
          </div>
          <div className="flex-1 border-r text-xs sm:text-sm font-bold py-1 text-center">午前</div>
          <div className="flex-1 border-r text-xs sm:text-sm font-bold py-1 text-center">午後</div>
          <div className="flex-1 border-r text-xs sm:text-sm font-bold py-1 text-center">夜間</div>
          <div className="w-[160px] shrink-0 text-sm font-bold py-1 text-center">メモ</div>
        </div>
        
        {/* スティッキー日付バー（スクロール時に現在の日付を表示） */}
        {showDateBar && currentDayInfo && (
          <div className="h-[22px] bg-slate-700 text-white flex items-center px-3 text-xs font-medium -mx-[10px] px-[10px]">
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
        onSave={modals.performanceModal.onSave as any}
        mode={modals.performanceModal.mode}
        event={modals.performanceModal.event}
        initialData={modals.performanceModal.initialData}
        stores={modals.performanceModal.stores as any}
        scenarios={modals.performanceModal.scenarios as any}
        staff={modals.performanceModal.staff}
        events={scheduleTableProps.events}
        availableStaffByScenario={modals.performanceModal.availableStaffByScenario}
        allAvailableStaff={modals.performanceModal.allAvailableStaff}
        onParticipantChange={modals.performanceModal.onParticipantChange}
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
        isRestoreDialogOpen={modals.scheduleDialogs.isRestoreDialogOpen}
        onCloseRestoreDialog={modals.scheduleDialogs.onCloseRestoreDialog}
        onConfirmRestore={modals.scheduleDialogs.onConfirmRestore}
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
              
              return [
                {
                  label: '公演を追加',
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
                  separator: true
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
                disabled: !modals.contextMenu.clipboardEvent || venue === ''
              }
            ]
          })() : []}
        />
      )}
    </AppLayout>
  )
}
