import { useOperatingSettings } from '@/hooks/useOperatingSettings'
import { usePreparationSettings } from '@/hooks/usePreparationSettings'
import { PerformanceOperatingSettings } from '@/components/settings/PerformanceOperatingSettings'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'
import '@/components/modals/ScenarioEditDialogV2.css'
import './PerformanceModal.css'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { ScenarioChangeConfirmDialog, DeleteEventConfirmDialog } from './performanceModal/dialogs/PerformanceConfirmDialogs'
import { DateLocationSection } from './performanceModal/sections/DateLocationSection'
import { PerformanceContentSection } from './performanceModal/sections/PerformanceContentSection'
import { StaffNotesSection } from './performanceModal/sections/StaffNotesSection'
import { CategorySelectSection } from './performanceModal/sections/CategorySelectSection'
import { PerformanceFooter } from './performanceModal/sections/PerformanceFooter'
import { PerformanceSummary } from './performanceModal/sections/PerformanceSummary'
import { staffApi } from '@/lib/api'
import { kitApi } from '@/lib/api/kitApi'
import { computeKitShortageForDay, countUsableKits, getUsableKitStoreIds } from '@/utils/scheduleWarnings'
import { scheduleUiApi } from '@/lib/api/scheduleUiApi'
import { scheduleApi } from '@/lib/api/scheduleApi'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { Staff as StaffType, Scenario, Store } from '@/types'
import { calcEndTime, computePlacedStartTimeWithPreparation } from '@/utils/eventOperationUtils'
import { ScheduleEvent, EventFormData, StaffParticipationReservation } from '@/types/schedule'
import { CATEGORY_TONE, PERF_TABS, getStaffTextColor, timeOptions } from './performanceModal/constants'
import { buildScenarioSelectOptions } from './performanceModal/scenarioSelectOptions'
import { findTimeConflict } from './performanceModal/timeConflict'
import { logger } from '@/utils/logger'
import { reservationApi } from '@/lib/reservationApi'
import { showToast } from '@/utils/toast'
import { toast } from 'sonner'
import { BookingDeadlineTab } from './BookingDeadlineTab'
import { ReservationList } from './modal/ReservationList'
import { EventHistoryTab } from './modal/EventHistoryTab'
import { SurveyResponsesTab } from './modal/SurveyResponsesTab'
import { getEmptySlotMemo, clearEmptySlotMemo } from './SlotMemoInput'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useOrganization } from '@/hooks/useOrganization'
import { scheduleTimeSlotToEn, timeSlotEnToSchedule } from '@/lib/timeSlot'
import { getCurrentOrganizationId } from '@/lib/organization'

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => Promise<boolean>
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, time_slot: string, suggestedStartTime?: string }  // 追加時のみ（DBカラム名に統一）
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  events?: ScheduleEvent[]  // 同じ日の他の公演（準備時間考慮のため）
  /** events が組織全体の公演か、自分の担当分だけか（ダッシュボードは担当分だけ）。キット不足は組織全体で数える */
  eventsScope?: 'organization' | 'mine'
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
  allAvailableStaff?: StaffType[]  // その日時に出勤している全GM
  onScenariosUpdate?: () => void  // シナリオ作成後の更新用コールバック
  onStaffUpdate?: () => void  // スタッフ作成後の更新用コールバック
  onParticipantChange?: (eventId: string, newCount: number) => void  // 参加者数変更時のコールバック
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>  // イベント削除時のコールバック（貸切参加者全員キャンセル時）
  /** 履歴スナップショット表示用: 全フィールド disabled・保存/削除非表示・他タブ非表示にして「その時点の見た目」だけを再現する */
  readOnly?: boolean
}

export function PerformanceModal({
  isOpen,
  onClose,
  onSave,
  mode,
  event,
  initialData,
  stores,
  scenarios,
  staff,
  events = [],
  eventsScope = 'organization',
  availableStaffByScenario = {},
  allAvailableStaff = [],
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange,
  onDeleteEvent,
  readOnly = false
}: PerformanceModalProps) {
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  // タブの状態管理（再レンダリング時にリセットされないように）
  const [activeTab, setActiveTab] = useState<string>('edit')
  // 予約データから取得したスタッフ参加者（DBをシングルソースとする）
  const [participationReservations, setParticipationReservations] = useState<StaffParticipationReservation[]>([])
  const [participationLoadError, setParticipationLoadError] = useState(false)
  const [staffParticipantsFromDB, setStaffParticipantsFromDB] = useState<string[]>([])
  // add モードで「+ 参加者を追加」した時のバッファ (event 未保存のため DB INSERT できないので一時保持)
  // 保存時に handleSave で一括 INSERT する
  type PendingParticipant = { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([])
  // 選択中シナリオの使用可能なキットの配置店舗。null=取得中、[]=使用可能な配置なし
  const [kitStoreIds, setKitStoreIds] = useState<string[] | null>(null)
  // 選択中シナリオの使用可能なキットの数（その日のキット不足の判定用、#376）
  const [usableKitCount, setUsableKitCount] = useState(0)
  // シナリオ変更確認ダイアログ（参加者がいる場合）
  const [pendingScenarioTitle, setPendingScenarioTitle] = useState<string | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  // ローカルで参加者数を管理（リアルタイム表示用）
  const [localCurrentParticipants, setLocalCurrentParticipants] = useState<number>(event?.current_participants || 0)
  // initForm の非同期初期化が完了するまで true。完了前の保存を防ぐガード（B7: 初期化未完了レース対策）
  const [isFormInitializing, setIsFormInitializing] = useState(true)
  // 保存処理の二重送信ガード（B7）。常時マウントのため initForm 実行時（モーダルを開くたび）にリセットする
  const isSavingRef = useRef(false)
  const initializationGeneration = useRef(0)
  const [formData, setFormData] = useState<EventFormData>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    gmRoles: {},
    staffParticipation: { entries: [], expected: [], expectedStaff: {gms: [], gm_roles: {}} }, // 初期値
    start_time: '10:00',
    end_time: '14:00',
    category: 'open',
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    capacity: 0,
    notes: ''
  })

  // 組織の時間帯設定を取得（平日/休日を考慮）
  const { getDefaultsForDate, isLoading: isTimeSlotSettingsLoading } = useTimeSlotSettings()
  
  // 組織IDを取得（履歴表示用）
  const { organizationId } = useOrganization()
  const { data: preparationData, resolve: resolvePreparation } = usePreparationSettings()

  // 時間帯のデフォルト設定（設定から動的に取得）
  const [timeSlotDefaults, setTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 店舗のデフォルト公演時間（分）- performance_schedule_settings から取得
  const durationSettings = useOperatingSettings('store', stores.find(store => store.id === formData.venue || store.name === formData.venue)?.id || stores[0]?.id)
  const defaultDuration = Number(durationSettings.resolve('default_performance_duration', 180).value)

  // 営業時間制限（開始時刻・終了時刻）
  const [businessHours, setBusinessHours] = useState<{ openTime: string; closeTime: string } | null>(null)

  // 営業時間に基づいてフィルタリングされた時間選択肢
  const filteredTimeOptions = businessHours
    ? timeOptions.filter(time => time >= businessHours.openTime && time <= businessHours.closeTime)
    : timeOptions

  // シナリオが選択中の店舗で公演可能かどうかをチェック
  const isScenarioAvailableAtVenue = (scenario: Scenario) => {
    if (!formData.venue) return true
    // available_storesが未設定または空の場合は全店舗対応
    if (!scenario.available_stores || scenario.available_stores.length === 0) {
      return true
    }
    // 選択中の店舗がavailable_storesに含まれているかチェック
    return scenario.available_stores.includes(formData.venue)
  }

  // シナリオ選択用オプションをメモ化（検索パフォーマンス改善）
  // ソート順: 担当+出勤GM有 > 担当GM有 > 出勤GM有 > その他（タイトル順）
  const scenarioOptions = useMemo(() => buildScenarioSelectOptions(scenarios, formData.venue, staff, allAvailableStaff), [scenarios, formData.venue, staff, allAvailableStaff])

  /** アンケートタブ用 scenario_master_id（レンダー内 IIFE + logger だと毎回ログが爆発するため useMemo） */
  const surveyTabScenarioId = useMemo(() => {
    const selectedScenario = scenarios.find(s => s.title === event?.scenario)
    return selectedScenario?.scenario_master_id || selectedScenario?.id || undefined
  }, [scenarios, event?.scenario])

  // 閉店時刻選択肢（開始時刻より後の時間のみ）
  const getEndTimeOptions = (startTime: string) => {
    const options = businessHours
      ? timeOptions.filter(time => time > startTime && time <= businessHours.closeTime)
      : timeOptions.filter(time => time > startTime)
    return options.length > 0 ? options : timeOptions.filter(time => time > startTime)
  }

  // 使用されない一時変数（型推論用）
  const [_unusedTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 日付が変わったら平日/休日に応じてデフォルト時間を更新
  useEffect(() => {
    if (!formData.date || isTimeSlotSettingsLoading) return

    const dayDefaults = getDefaultsForDate(formData.date)
    setTimeSlotDefaults({
      morning: { ...dayDefaults.morning, label: '朝公演' },
      afternoon: { ...dayDefaults.afternoon, label: '昼公演' },
      evening: { ...dayDefaults.evening, label: '夜公演' }
    })
  }, [formData.date, getDefaultsForDate, isTimeSlotSettingsLoading])

  // 時間帯が変更されたときに開始・終了時間を自動設定（平日/休日を考慮）
  const handleTimeSlotChange = (slot: 'morning' | 'afternoon' | 'evening') => {
    setTimeSlot(slot)
    // 現在の日付に応じたデフォルト時間を取得
    const dayDefaults = formData.date ? getDefaultsForDate(formData.date) : null
    // デフォルト値が正しく設定されていることを確認
    const DEFAULT_FALLBACK = {
      morning: { start_time: '10:00', end_time: '14:00' },
      afternoon: { start_time: '14:30', end_time: '18:30' },
      evening: { start_time: '19:00', end_time: '23:00' }
    }
    // 設定値を検証（start_timeとend_timeが存在し、かつ開始時間が終了時間より前であることを確認）
    const validateTimeSlot = (settings: { start_time?: string; end_time?: string } | undefined) => {
      if (!settings?.start_time || !settings?.end_time) return false
      // 開始時間が終了時間より前であることを確認（日をまたぐ場合を除く）
      const [startH, startM] = settings.start_time.split(':').map(Number)
      const [endH, endM] = settings.end_time.split(':').map(Number)
      const startMinutes = startH * 60 + startM
      const endMinutes = endH * 60 + endM
      return endMinutes > startMinutes
    }
    
    let slotDefaults = dayDefaults?.[slot]
    if (!validateTimeSlot(slotDefaults)) {
      slotDefaults = timeSlotDefaults[slot]
    }
    if (!validateTimeSlot(slotDefaults)) {
      slotDefaults = DEFAULT_FALLBACK[slot]
    }
    
    if (slotDefaults) {
      setFormData((prev: EventFormData) => ({
        ...prev,
        start_time: slotDefaults.start_time,
        end_time: slotDefaults.end_time
      }))
    }
  }

  // 店舗IDを取得（名前またはIDから）- useEffect内で使用するためにここで定義
  const resolveStoreId = (venueValue: string): string | null => {
    // 既にUUID形式の場合はそのまま返す
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(venueValue)) {
      return venueValue
    }
    // 店舗名から検索
    const store = stores.find(s => s.name === venueValue)
    return store?.id || null
  }

  // 営業時間設定を読み込む（公演時間設定は useTimeSlotSettings で取得）
  useEffect(() => {
    const loadBusinessHoursSettings = async () => {
      try {
        // venueが店舗名の場合はIDに変換
        const venueValue = formData.venue || ''
        const storeId = resolveStoreId(venueValue) || stores[0]?.id
        if (!storeId) return

        // 営業時間設定を取得（組織でフィルタ）
        const { data: businessHoursData, error: businessHoursError } = await scheduleUiApi.getBusinessHours(storeId, organizationId)

        if (businessHoursError && businessHoursError.code !== 'PGRST116') {
          logger.error('営業時間設定取得エラー:', businessHoursError)
        }

        // 営業時間制限の適用（時間選択肢の制限）
        if (businessHoursData?.opening_hours) {
          const openingHours = businessHoursData.opening_hours
          // 営業時間設定が配列形式（曜日別）か単純なオブジェクト形式かで処理を分ける
          if (Array.isArray(openingHours) && openingHours.length > 0) {
            // 曜日別設定の場合は、共通の開店・閉店時刻を取得（最も広い範囲）
            const allOpenTimes = openingHours.map((h) => h.open_time).filter(Boolean)
            const allCloseTimes = openingHours.map((h) => h.close_time).filter(Boolean)
            if (allOpenTimes.length > 0 && allCloseTimes.length > 0) {
              const openTime = allOpenTimes.sort()[0] // 最も早い開店時刻
              const closeTime = allCloseTimes.sort().reverse()[0] // 最も遅い閉店時刻
              setBusinessHours({ openTime, closeTime })
              logger.log('営業時間設定を適用:', { openTime, closeTime })
            }
          } else if (openingHours.open_time && openingHours.close_time) {
            // 単純なオブジェクト形式
            setBusinessHours({
              openTime: openingHours.open_time,
              closeTime: openingHours.close_time
            })
            logger.log('営業時間設定を適用:', openingHours)
          }
        } else {
          // 設定がない場合はデフォルト（制限なし）
          setBusinessHours(null)
        }

      } catch (error) {
        logger.error('設定読み込みエラー:', error)
      }
    }

    if (formData.venue || stores.length > 0) {
      loadBusinessHoursSettings()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.venue, stores])

  // デフォルト時間設定のフォールバック（設定がロードされていない場合に使用）
  const DEFAULT_TIME_SLOTS = {
    morning: { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening: { start_time: '19:00', end_time: '23:00' }
  }

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (!isOpen) return
    // 設定がロード中の場合は待機（追加モードの場合のみ）
    if (mode === 'add' && isTimeSlotSettingsLoading) {
      return
    }
    void initForm()
    return () => { initializationGeneration.current += 1 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, event, initialData, getDefaultsForDate, isTimeSlotSettingsLoading])

  // 自分の担当分だけを受け取る画面では、キット不足を数えるためにその日の組織全体の公演を取り直す。null は取得中・失敗（警告しない）
  const [orgDayEvents, setOrgDayEvents] = useState<ScheduleEvent[] | null>(null)
  useEffect(() => {
    if (!isOpen || eventsScope !== 'mine' || !formData.date) { setOrgDayEvents(null); return }
    let cancelled = false
    setOrgDayEvents(null)
    scheduleApi.getByDateRange(formData.date, formData.date)
      .then(rows => { if (!cancelled) setOrgDayEvents(rows as unknown as ScheduleEvent[]) })
      .catch(error => { logger.error('キット不足判定の公演取得エラー:', error); if (!cancelled) setOrgDayEvents(null) })
    return () => { cancelled = true }
  }, [isOpen, eventsScope, formData.date])
  const kitDemandEvents = eventsScope === 'mine' ? orgDayEvents : events

  // シナリオ変更時にキット配置店舗を取得
  // scenario_master_id 直叩きだと org_scenario_id のみの行を取りこぼすため、
  // kitApi（org_scenario_id 解決）経由で全キット配置を取る
  useEffect(() => {
    if (!isOpen) return
    const selectedScenario = scenarios.find(s => s.title === formData.scenario)
    // organization_scenarios.id があれば優先（API が org_scenario_id で確実に解決できる）
    const scenarioKey =
      selectedScenario?.id ||
      selectedScenario?.scenario_master_id ||
      null
    if (!scenarioKey) {
      setKitStoreIds([])
      return
    }
    let cancelled = false
    setKitStoreIds(null) // 取得完了まで警告を出さない
    setUsableKitCount(0) // 前の作品の個数を残さない
    ;(async () => {
      try {
        const locations = await kitApi.getKitLocationsByScenario(scenarioKey)
        if (cancelled) return
        setKitStoreIds(getUsableKitStoreIds(locations || []))
        setUsableKitCount(countUsableKits(locations || []))
      } catch (err) {
        logger.error('キット配置店舗の取得エラー:', err)
        // 取得失敗時も空扱いにして未配置警告を出す（表と揃える）
        if (!cancelled) { setKitStoreIds([]); setUsableKitCount(0) }
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, formData.scenario, scenarios])

  const initForm = async () => {
    const generation = ++initializationGeneration.current
    setIsFormInitializing(true)
    // 常時マウントのため、次にモーダルを開いた時に前回の保存中フラグが残留しないようリセット
    isSavingRef.current = false
    setParticipationLoadError(false)
    setParticipationReservations([])
    try {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      // シナリオIDがない場合は、タイトルから逆引き。
      // タイトル完全一致を優先し、一致しない場合は scenario_master_id で照合する
      // （同一シナリオでもマスタ名と組織側の表示名が食い違うと「未登録」誤表示になるため）。
      const eventMasterId = (event as { scenario_master_id?: string }).scenario_master_id
      const selectedScenario =
        scenarios.find(s => s.title === event.scenario) ||
        (eventMasterId
          ? scenarios.find(s => s.scenario_master_id === eventMasterId || s.id === eventMasterId)
          : undefined)

      // time_slotが存在する場合はそれを使用、なければstart_timeから判定
      let slot: 'morning' | 'afternoon' | 'evening' = 'morning'
      if (event.time_slot) {
        slot = scheduleTimeSlotToEn(event.time_slot) ?? 'morning'
      } else {
        // start_timeから判定（フォールバック）
        const startHour = parseInt(event.start_time.split(':')[0])
        if (startHour < 12) {
          slot = 'morning'
        } else if (startHour < 17) {
          slot = 'afternoon'
        } else {
          slot = 'evening'
        }
      }
      setTimeSlot(slot)
      
      logger.log('📋 編集イベントデータ:', JSON.stringify({
        is_private_request: event.is_private_request,
        reservation_id: event.reservation_id,
        reservation_name: event.reservation_name,
        id: event.id
      }))
      let participation = { entries: [], reservations: [], assignment: {gms:event.gms ?? [],gm_roles:event.gm_roles ?? {}} } as Awaited<ReturnType<typeof reservationApi.getStaffParticipation>>
      if (!event.is_private_request) {
        try { participation = await reservationApi.getStaffParticipation(event.id) }
        catch (error) { if (generation !== initializationGeneration.current) return; setParticipationLoadError(true); logger.error('スタッフ参加方法の取得失敗', error) }
      }
      if (generation !== initializationGeneration.current) return
      setParticipationReservations(participation.reservations)
      setFormData({
        ...event,
        gms: participation.assignment.gms,
        staffParticipation: { entries: participation.entries.filter(entry => !entry.needs_confirmation), expected: participation.entries, expectedStaff: participation.assignment },
        // master_id で照合できた場合は登録済みの表示名にそろえる（「未登録」警告の誤表示を防ぐ）
        scenario: selectedScenario?.title ?? event.scenario,
        scenario_master_id: selectedScenario?.id,  // scenario_masters.id
        time_slot: event.time_slot || timeSlotEnToSchedule(slot), // time_slotを設定
        max_participants: selectedScenario?.player_count_max ?? event.max_participants ?? DEFAULT_MAX_PARTICIPANTS, // シナリオの参加人数を反映
        gmRoles: participation.assignment.gm_roles, // 既存の役割があれば設定
        capacity: event.max_participants || 0, // capacityを追加
        is_private_request: event.is_private_request, // 貸切リクエストフラグを明示的に引き継ぎ
        reservation_id: event.reservation_id, // 予約IDを明示的に引き継ぎ
        reservation_name: event.reservation_name || '' // 予約者名を明示的に引き継ぎ
      })
      // ローカル参加者数を初期化
      setLocalCurrentParticipants(event.current_participants || 0)
    } else if (mode === 'add' && initialData) {
      // 追加モード：初期データで初期化
      const slot = initialData.time_slot as 'morning' | 'afternoon' | 'evening'
      setTimeSlot(slot)
      
      // 日付に応じたデフォルト時間を取得（平日/休日を考慮）
      // 設定が正しくロードされていることを確認
      const dayDefaults = getDefaultsForDate(initialData.date)
      // スロットのデフォルト値を取得（設定が不完全な場合はフォールバックを使用）
      const slotDefaults = (dayDefaults?.[slot]?.start_time && dayDefaults?.[slot]?.end_time) 
        ? dayDefaults[slot] 
        : DEFAULT_TIME_SLOTS[slot]
      
      // スロットメモを取得（DB から非同期で取得）
      const slotMemo = await getEmptySlotMemo(initialData.date, initialData.venue, slot)
      if (generation !== initializationGeneration.current) return

      // 前の公演がある場合は推奨開始時間を使用、なければスロットのデフォルトを使用
      const startTime = initialData.suggestedStartTime || slotDefaults.start_time
      
      // 終了時間を計算：開始時間 + 4時間（デフォルト公演時間）
      // ただし、スロットのデフォルト終了時間が開始時間より後ならそちらを使用
      let endTime = slotDefaults.end_time
      const [startHour, startMinute] = startTime.split(':').map(Number)
      const [defaultEndHour, defaultEndMinute] = slotDefaults.end_time.split(':').map(Number)
      const startMinutes = startHour * 60 + startMinute
      const defaultEndMinutes = defaultEndHour * 60 + defaultEndMinute
      
      // 終了時間が開始時間より前になる場合は、開始時間 + 4時間に設定
      if (defaultEndMinutes <= startMinutes) {
        const newEndMinutes = startMinutes + 240 // 4時間 = 240分
        const newEndHour = Math.floor(newEndMinutes / 60)
        const newEndMinute = newEndMinutes % 60
        endTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMinute).padStart(2, '0')}`
      }
      
      setFormData({
        id: Date.now().toString(),
        date: initialData.date,
        venue: initialData.venue,
        scenario: '',
        gms: [],
        gmRoles: {},
        staffParticipation: { entries: [], expected: [], expectedStaff: {gms: [], gm_roles: {}} },
        start_time: startTime,
        end_time: endTime,
        category: 'open',
        max_participants: DEFAULT_MAX_PARTICIPANTS,
        capacity: 0,
        notes: slotMemo,  // スロットメモを備考に引き継ぎ
        reservation_name: ''  // 予約者名（初期値は空）
      })
    }
    } finally {
      if (generation === initializationGeneration.current) setIsFormInitializing(false)
    }
  }

  // 終了時間を自動計算する関数
  const calculateEndTime = (startTime: string, scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    if (!selectedScenario) return startTime
    // 時刻計算は共通の純関数 calcEndTime を再利用（重複排除）
    return calcEndTime(startTime, selectedScenario.duration)
  }

  // 開始時間変更時の自動設定
  // ※開始時間を変更しても時間帯（朝/昼/夜）は変更されない
  const handleStartTimeChange = (startTime: string) => {
    // シナリオが選択されている場合はシナリオのdurationで計算
    // 未選択の場合は公演スケジュール設定のdefault_durationで計算
    if (!formData.scenario && (durationSettings.loading || !durationSettings.data)) {
      showToast.error('公演時間の設定を読み込んでから変更してください')
      return
    }
    let endTime: string
    if (formData.scenario) {
      endTime = calculateEndTime(startTime, formData.scenario)
    } else {
      endTime = calcEndTime(startTime, defaultDuration)
    }
    
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime
    }))
  }

  // 時間帯（morning/afternoon/evening）を'朝'/'昼'/'夜'にマッピング
  const getTimeSlotLabel = (slot: 'morning' | 'afternoon' | 'evening'): string => {
    return timeSlotEnToSchedule(slot)
  }

  // シナリオ変更を実際に formData に適用する
  const applyScenarioChange = (scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    if (!selectedScenario) {
      setFormData((prev: EventFormData) => ({ ...prev, scenario: scenarioTitle }))
      return
    }
    const preparation = resolvePreparation({ storeId: formData.venue, scenarioId: selectedScenario.id, eventId: mode === 'edit' ? event?.id : undefined })
    if (preparation === undefined) { showToast.error('準備時間の設定を読み込んでから変更してください'); return }
    const priorEvents = (events || []).filter(candidate => candidate.id !== event?.id && !candidate.is_cancelled && candidate.date === formData.date && candidate.venue === formData.venue)
    const adjustedStartTime = computePlacedStartTimeWithPreparation(formData.start_time, priorEvents, preparation)
    const endTime = calculateEndTime(adjustedStartTime, scenarioTitle)
    setFormData((prev: EventFormData) => ({
      ...prev,
      scenario: scenarioTitle,
      scenario_master_id: selectedScenario.id,
      start_time: adjustedStartTime,
      end_time: endTime,
      max_participants: selectedScenario.player_count_max
    }))
  }

  // 入力中の時間が同店舗・同日の既存公演と「重複/間隔不足」かを即時判定（保存前の見える化）。
  // 保存時の useEventSave と同じ checkTimeOverlap を使い、時間プルダウンをハイライトする。
  // overlap=時間が完全に重複 / interval=前後の間隔が短い（推奨60分未満）。削除はしない。
  const timeConflict = useMemo(() => findTimeConflict({
    form: { is_private_request: formData.is_private_request, start_time: formData.start_time, end_time: formData.end_time, date: formData.date, venue: formData.venue, scenario: formData.scenario },
    events: events || [], scenarios, editingEventId: mode === 'edit' ? event?.id : undefined,
    preparationReady: Boolean(preparationData), resolvePreparation,
  }), [formData.is_private_request, formData.start_time, formData.end_time, formData.date, formData.venue, formData.scenario, events, scenarios, mode, event?.id, preparationData, resolvePreparation])

  // 時間プルダウンのハイライト色（overlap=赤 / interval=黄）
  const timeConflictTriggerClass = timeConflict
    ? (timeConflict.kind === 'overlap'
        ? 'border-red-400 ring-1 ring-red-300 bg-red-50'
        : 'border-amber-400 ring-1 ring-amber-300 bg-amber-50')
    : ''

  const handleSave = async () => {
    // 二重送信ガード（B7）: 保存処理中の再クリックを無視する
    if (isSavingRef.current) return
    // 時間帯を'朝'/'昼'/'夜'形式で保存
    if (participationLoadError) { showToast.error('スタッフ参加方法を取得できません。公演を開き直してください。'); return }
    const participantStaff = formData.gms.filter(name => formData.gmRoles?.[name] === 'staff').map(name => staff.find(member => member.name === name))
    const participationEntries = (formData.staffParticipation?.entries ?? []).filter(entry => participantStaff.some(member => member?.id === entry.staff_id))
    if (participantStaff.some(member => !member || !participationEntries.some(entry => entry.staff_id === member.id && (entry.mode === 'additional' || entry.reservation_id)))) {
      showToast.error('スタッフ参加ごとに「予約人数内」または「追加の1席」を選択してください。'); return
    }
    isSavingRef.current = true
    // gmRoles (camelCase) を gm_roles (snake_case) に変換してAPIに渡す
    // スタッフ参加/見学もGMリストに保持する（除外しない）

    let scenario = formData.scenario || ''
    let notes = formData.notes || ''
    
    // 場所貸しの場合、シナリオ欄の内容を備考に移動
    const isVenueRental = formData.category === 'venue_rental' || formData.category === 'venue_rental_free'
    if (isVenueRental && scenario) {
      // 備考に既存の内容があれば改行して追加、なければそのまま設定
      notes = notes ? `${scenario}\n${notes}` : scenario
      scenario = '' // シナリオ欄はクリア
    }
    
    // 場所貸しの公演料金（未設定の場合はデフォルト12,000円）
    const venueRentalFee = isVenueRental 
      ? (formData.venue_rental_fee ?? 12000) 
      : undefined
    
    const saveData = {
      ...formData,
      staffParticipation: { entries: participationEntries, expected: formData.staffParticipation?.expected ?? [], expectedStaff: formData.staffParticipation?.expectedStaff ?? {gms:[],gm_roles:{}} },
      scenario,
      scenario_master_id: isVenueRental ? undefined : formData.scenario_master_id, // 場所貸しはシナリオIDもクリア
      notes,
      venue_rental_fee: venueRentalFee,
      gms: formData.gms,
      time_slot: getTimeSlotLabel(timeSlot),
      gm_roles: formData.gmRoles || {},
      reservation_name: formData.reservation_name || '', // 予約者名
      is_private_request: formData.is_private_request, // 貸切リクエストフラグを明示的に含める
      reservation_id: formData.reservation_id // 予約IDを明示的に含める
    }
    logger.log('🔍 保存データ:', JSON.stringify({ 
      is_private_request: saveData.is_private_request,
      reservation_id: saveData.reservation_id,
      reservation_name: saveData.reservation_name,
      id: saveData.id
    }))
    
    // 追加モードの場合、スロットメモをクリア（備考に引き継いだので不要）
    if (mode === 'add' && initialData) {
      void clearEmptySlotMemo(initialData.date, initialData.venue, timeSlot)
    }
    
    // 保存失敗時は入力を保持し、その場で予約・スタッフ参加を修正できるようにする。
    const loadingToastId = toast.loading('保存中...')
    let success: boolean
    try {
      success = await onSave(saveData)
    } catch (error) {
      logger.error('公演保存エラー:', error)
      showToast.error('保存できませんでした。入力内容を確認してもう一度お試しください。')
      return
    } finally {
      isSavingRef.current = false
      toast.dismiss(loadingToastId)
    }
    if (!success) return
    onClose()

    // 保存成功後に、バッファされた参加者を登録する。
    void (async () => {
      // バッファされた一般参加者 (+ 参加者を追加で追加された分) を並列 INSERT
      try {
        if (pendingParticipants.length > 0) {
          const orgId = await getCurrentOrganizationId()
          let targetEventId: string | undefined = event?.id
          if (!targetEventId) {
            const { data: matched } = await scheduleUiApi.findLatestEventAt(orgId, saveData.date, saveData.start_time)
            if (matched) targetEventId = matched.id
          }
          if (targetEventId) {
            const scenarioObj = scenarios.find(s => s.title === saveData.scenario)
            const storeId = event?.store_id ?? (stores.find(s => s.id === saveData.venue || s.name === saveData.venue)?.id ?? null)
            const isGmTest = saveData.category === 'gmtest'
            const baseFee = isGmTest
              ? (scenarioObj?.gm_test_participation_fee ?? scenarioObj?.participation_fee ?? 0)
              : (scenarioObj?.participation_fee ?? 0)
            await Promise.all(pendingParticipants.map((p) => {
              const isStaffPay = p.paymentMethod === 'staff'
              const unitPrice = isStaffPay ? 0 : baseFee
              const total = unitPrice * p.count
              const now = new Date()
              const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
              const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
              const reservationNumber = `${dateStr}-${randomStr}`
              return reservationApi.insertDirect({
                reservation_number: reservationNumber,
                schedule_event_id: targetEventId,
                organization_id: orgId,
                title: saveData.scenario || '',
                scenario_master_id: scenarioObj?.id ?? null,
                store_id: storeId,
                customer_name: p.name,
                participant_names: [p.name],
                participant_count: p.count,
                base_price: unitPrice * p.count,
                unit_price: unitPrice,
                total_price: total,
                final_price: total,
                discount_amount: 0,
                duration: 240,
                requested_datetime: new Date().toISOString(),
                payment_method: p.paymentMethod,
                payment_status: (p.paymentMethod === 'online' || isStaffPay) ? 'paid' : 'pending',
                status: 'confirmed',
                reservation_source: isStaffPay ? 'staff_participation' : 'walk_in',
              })
            }))
            setPendingParticipants([])
          }
        }
      } catch (err) {
        logger.error('保存後の参加者バッファ同期に失敗:', err)
      }
    })()
  }

  const handleScenarioSaved = async () => {
    // シナリオリストを更新（ダイアログは開いたままなので editingScenarioId はリセットしない）
    // editingScenarioId のリセットは onClose 時に行う
    if (onScenariosUpdate) {
      await onScenariosUpdate()
    }
  }

  const handleCreateStaff = async (newStaff: StaffType) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      // StaffTypeにはcreated_at/updated_atがないが、フォームから渡される可能性があるため除外
      const staffWithTimestamps = newStaff as StaffType & { id?: string; created_at?: string; updated_at?: string }
      const { id, created_at, updated_at, ...staffForDB } = staffWithTimestamps
      
      logger.log('スタッフ作成リクエスト:', staffForDB)
      const createdStaff = await staffApi.create(staffForDB)
      logger.log('スタッフ作成成功:', createdStaff)
      
      setIsStaffModalOpen(false)
      
      // 親コンポーネントにスタッフリストの更新を通知
      if (onStaffUpdate) {
        await onStaffUpdate()
      }
      
      // 新しく作成したスタッフをGMとして選択
      setFormData((prev: EventFormData) => ({ 
        ...prev, 
        gms: [...prev.gms, newStaff.name],
        gmRoles: { ...prev.gmRoles, [newStaff.name]: 'main' }
      }))
    } catch (error: unknown) {
      logger.error('スタッフ作成エラー:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      showToast.error('スタッフの作成に失敗しました', message)
    }
  }

  // 店舗名を取得
  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    return store ? store.name : storeId
  }

  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'
  const confirmedStaffParticipants = [...new Set([...staffParticipantsFromDB, ...(formData.staffParticipation?.expected ?? []).filter(entry => !entry.needs_confirmation).flatMap(entry => { const member = staff.find(s => s.id === entry.staff_id); return member ? [member.name] : [] })])]
  const categoryTone = CATEGORY_TONE[formData.category]
  const activeTabLabel = PERF_TABS.find((tab) => tab.id === activeTab)?.label ?? '公演情報'

  const reservationsBadgeText = event
    ? [
        event.is_private_request || event.is_private_booking
          ? '満席'
          : `${localCurrentParticipants}/${event.scenarios?.player_count_max || event.max_participants || 8}名`,
        event.is_cancelled && (event.current_participants ?? 0) > 0
          ? `中止前${event.current_participants}名`
          : null,
        !event.is_cancelled && confirmedStaffParticipants.length > 0
          ? `内スタッフ${confirmedStaffParticipants.length}`
          : null,
      ].filter(Boolean).join(' / ')
    : null

  const renderTabBody = () => {
    if (activeTab === 'operating-settings') return <PerformanceOperatingSettings eventId={event?.id} />
    if (activeTab === 'deadlines') return <BookingDeadlineTab eventId={event?.id} />
    if (activeTab === 'reservations') {
      return (
        <ReservationList
          event={event || null}
          currentEventData={formData}
          mode={mode}
          stores={stores}
          scenarios={scenarios}
          staff={staff}
          onLocalParticipantUpdate={(count) => {
            setLocalCurrentParticipants(count)
          }}
          onParticipantChange={(eventId, newCount) => {
            setLocalCurrentParticipants(newCount)
            onParticipantChange?.(eventId, newCount)
          }}
          onGmsChange={(gms, gmRoles) => setFormData(prev => ({ ...prev, gms, gmRoles }))}
          onStaffParticipantsChange={setStaffParticipantsFromDB}
          pendingParticipants={pendingParticipants}
          onPendingAdd={(p) => setPendingParticipants(prev => [...prev, p])}
          onPendingRemove={(idx) => setPendingParticipants(prev => prev.filter((_, i) => i !== idx))}
          pendingStaffGmNames={(formData.gms || []).filter(n => { const member = staff.find(s => s.name === n); const choice = formData.staffParticipation?.entries.find(e => e.staff_id === member?.id); return formData.gmRoles?.[n] === 'staff' && choice?.mode === 'additional' && !choice.reservation_id })}
          onPendingStaffGmRemove={(name) => {
            setFormData((prev: EventFormData) => {
              const newGms = (prev.gms || []).filter(g => g !== name)
              const newRoles = { ...prev.gmRoles }
              delete newRoles[name]
              return { ...prev, gms: newGms, gmRoles: newRoles }
            })
          }}
          onDeleteEvent={event && onDeleteEvent ? async () => {
            await onDeleteEvent(event)
            onClose()
          } : undefined}
        />
      )
    }

    if (activeTab === 'survey') {
      return (
        <SurveyResponsesTab
          reservationId={event?.reservation_id}
          scenarioId={surveyTabScenarioId}
        />
      )
    }

    if (activeTab === 'history') {
      return (
        <EventHistoryTab
          cellInfo={formData.date && formData.venue ? {
            date: formData.date,
            storeId: event?.store_id || formData.venue,
            timeSlot: formData.time_slot || timeSlotEnToSchedule(timeSlot)
          } : undefined}
          organizationId={organizationId || undefined}
          stores={stores}
          scenarios={scenarios}
          staff={staff}
        />
      )
    }

    return (
      <fieldset disabled={readOnly} className="min-w-0 p-0 m-0 border-0" style={readOnly ? { display: 'contents' } : undefined}>
        <div className="space-y-3 pb-2 sm:pb-0">
          <CategorySelectSection formData={formData} setFormData={setFormData} />
          <DateLocationSection
            formData={formData}
            setFormData={setFormData}
            CATEGORY_TONE={CATEGORY_TONE}
            getStoreName={getStoreName}
            stores={stores}
            timeSlot={timeSlot}
            handleTimeSlotChange={handleTimeSlotChange}
            timeSlotDefaults={timeSlotDefaults}
            handleStartTimeChange={handleStartTimeChange}
            timeConflictTriggerClass={timeConflictTriggerClass}
            timeOptions={timeOptions}
            timeConflict={timeConflict}
          />
          <PerformanceContentSection
            kitShortage={kitStoreIds === null ? null : (() => {
              const selectedScenario = scenarios.find(s => s.title === formData.scenario)
              const scenarioId = selectedScenario?.scenario_master_id || selectedScenario?.id
              if (!scenarioId || !kitDemandEvents) return null
              return computeKitShortageForDay(
                { date: formData.date, venueId: formData.venue, scenarioId, category: formData.category, eventId: mode === 'edit' ? event?.id : undefined },
                kitDemandEvents, usableKitCount, stores,
              )
            })()}
            CATEGORY_TONE={CATEGORY_TONE}
            formData={formData}
            setFormData={setFormData}
            localCurrentParticipants={localCurrentParticipants}
            mode={mode}
            setPendingScenarioTitle={setPendingScenarioTitle}
            applyScenarioChange={applyScenarioChange}
            scenarioOptions={scenarioOptions}
            setIsScenarioDialogOpen={setIsScenarioDialogOpen}
            scenarios={scenarios}
            isScenarioAvailableAtVenue={isScenarioAvailableAtVenue}
            stores={stores}
            kitStoreIds={kitStoreIds}
            setEditingScenarioId={setEditingScenarioId}
          />
          <StaffNotesSection
            CATEGORY_TONE={CATEGORY_TONE}
            formData={formData}
            setFormData={setFormData}
            staff={staff}
            scenarios={scenarios}
            allAvailableStaff={allAvailableStaff}
            staffParticipantsFromDB={confirmedStaffParticipants}
            participationReservations={participationReservations}
            setIsStaffModalOpen={setIsStaffModalOpen}
          />
        </div>
      </fieldset>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setActiveTab('edit') // タブをリセット
        onClose()
      }
    }}>
      <DialogContent
        size="xl"
        data-perf-modal=""
        overlayClassName="scenario-edit-dialog-overlay"
        className="scenario-edit-dialog-host [&>button]:hidden"
        style={categoryTone
          ? ({
              ['--perf-tone-bg' as string]: categoryTone.bg,
              ['--perf-tone-section' as string]: categoryTone.section,
              ['--perf-tone-border' as string]: categoryTone.border,
              ['--input-bg' as string]: categoryTone.bg,
              backgroundColor: categoryTone.bg,
              borderColor: categoryTone.border,
            } as React.CSSProperties)
          : undefined}
        // 保存後、events 再フェッチでトリガー要素が一時的に消えると Radix の focus
        // 復元先がなくなり body にフォールバックしてページ最上部までスクロールするため、
        // close 時の auto-focus 復元を無効化する。
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{modalTitle}</DialogTitle>
        <DialogDescription className="sr-only">{modalDescription}</DialogDescription>

        <header className="scenario-edit-dialog__header">
          <div className="scenario-edit-dialog__header-left">
            <span className="scenario-edit-dialog__title">{modalTitle}</span>
            {formData.scenario ? (
              <span className="scenario-edit-dialog__scenario">{formData.scenario}</span>
            ) : null}
          </div>
          <button type="button" className="scenario-edit-dialog__close" onClick={onClose}>
            閉じる
          </button>
        </header>

        <div className="scenario-edit-dialog__body">
          <nav
            className={`scenario-edit-dialog__nav${readOnly ? ' hidden' : ''}`}
            aria-label="公演編集セクション"
          >
            {PERF_TABS.map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={selected ? 'scenario-edit-dialog__nav-item is-selected' : 'scenario-edit-dialog__nav-item'}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'reservations' && reservationsBadgeText ? (
                    <span className="scenario-edit-dialog__nav-item-badge" title={reservationsBadgeText}>
                      {reservationsBadgeText}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <div key={activeTab} className="scenario-edit-dialog__content">
            <h2 className="scenario-edit-dialog__page-title">{activeTabLabel}</h2>
            {renderTabBody()}
          </div>
        </div>

        <footer className="scenario-edit-dialog__footer">
          <div className="scenario-edit-dialog__meta">
            <PerformanceSummary
              formData={formData}
              scenarios={scenarios}
              staffParticipantsFromDB={confirmedStaffParticipants}
              CATEGORY_TONE={CATEGORY_TONE}
              mode={mode}
              event={event}
              localCurrentParticipants={localCurrentParticipants}
            />
          </div>
          <PerformanceFooter
            readOnly={readOnly}
            mode={mode}
            onDeleteEvent={onDeleteEvent}
            setDeleteConfirming={setDeleteConfirming}
            onClose={onClose}
            handleSave={handleSave}
            isFormInitializing={isFormInitializing}
          />
        </footer>
      </DialogContent>

      {/* シナリオ変更確認ダイアログ（参加者がいる場合） */}
      <ScenarioChangeConfirmDialog
        pendingScenarioTitle={pendingScenarioTitle}
        localCurrentParticipants={localCurrentParticipants}
        setPendingScenarioTitle={setPendingScenarioTitle}
        applyScenarioChange={applyScenarioChange}
      />

      {/* 公演削除確認ダイアログ */}
      <DeleteEventConfirmDialog
        deleteConfirming={deleteConfirming}
        setDeleteConfirming={setDeleteConfirming}
        event={event}
        onDeleteEvent={onDeleteEvent}
        onClose={onClose}
      />

      {/* シナリオ編集ダイアログ（V2: タブ形式の新しいUI） */}
      <ScenarioEditDialogV2
        isOpen={isScenarioDialogOpen}
        onClose={() => {
          setIsScenarioDialogOpen(false)
          setEditingScenarioId(null)
        }}
        scenarioId={editingScenarioId}
        onSaved={handleScenarioSaved}
      />

      {/* スタッフ(GM)作成モーダル */}
      <StaffEditModal
        staff={null}
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSave={handleCreateStaff}
        stores={stores}
        scenarios={scenarios}
      />
    </Dialog>
  )
}
