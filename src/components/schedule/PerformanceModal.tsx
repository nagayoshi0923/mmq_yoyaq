import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { X, ExternalLink, UserCog, Calendar, Clock, BookOpen, Users } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { staffApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import { cn } from '@/lib/utils'
import type { Staff as StaffType, Scenario, Store } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { toast } from 'sonner'
import { ReservationList } from './modal/ReservationList'
import { EventHistoryTab } from './modal/EventHistoryTab'
import { SurveyResponsesTab } from './modal/SurveyResponsesTab'
import { getEmptySlotMemo, clearEmptySlotMemo } from './SlotMemoInput'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useOrganization } from '@/hooks/useOrganization'
import { scheduleTimeSlotToEn, timeSlotEnToSchedule } from '@/lib/timeSlot'
import { getCurrentOrganizationId } from '@/lib/organization'

// ============================================================================
// スタッフ参加予約 同期ヘルパー (edit mode 用)
//
// GM 役割を「スタッフ参加 (staff)」にした瞬間に reservations へ 1 件 INSERT、
// 役割を外したり名前を消した時に対応する予約を DELETE する。
// add mode (event 未保存) では使えないため、handleSave で別途同期する。
// ============================================================================
async function ensureStaffReservation(params: {
  eventId: string
  staffName: string
  organizationId: string | null
  scenarioTitle: string
  scenarioMasterId: string | null | undefined
  storeId: string | null
}): Promise<void> {
  const { eventId, staffName, organizationId, scenarioTitle, scenarioMasterId, storeId } = params
  // 既に staff_participation の予約が存在するかチェック
  const { data: existing } = await supabase
    .from('reservations')
    .select('id, participant_names')
    .eq('schedule_event_id', eventId)
    .eq('reservation_source', 'staff_participation')
  if (existing?.some(r => Array.isArray(r.participant_names) && r.participant_names.includes(staffName))) {
    return // すでに同名で staff_participation があるので何もしない
  }

  // 顧客検索 (staff の name 一致)
  let customerId: string | null = null
  try {
    let q = supabase.from('customers').select('id').eq('name', staffName)
    if (organizationId) q = q.or(`organization_id.eq.${organizationId},organization_id.is.null`)
    const { data: cust } = await q.limit(1).maybeSingle()
    if (cust) customerId = cust.id
  } catch {/* 顧客なくても予約は作る */}

  const now = new Date()
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
  const reservationNumber = `${dateStr}-${randomStr}`

  await supabase.from('reservations').insert({
    reservation_number: reservationNumber,
    schedule_event_id: eventId,
    organization_id: organizationId,
    title: scenarioTitle || '',
    scenario_master_id: scenarioMasterId ?? null,
    store_id: storeId,
    customer_id: customerId,
    customer_name: staffName,
    participant_names: [staffName],
    participant_count: 1,
    base_price: 0,
    unit_price: 0,
    total_price: 0,
    final_price: 0,
    discount_amount: 0,
    duration: 240,
    requested_datetime: new Date().toISOString(),
    payment_method: 'staff',
    payment_status: 'paid',
    status: 'confirmed',
    reservation_source: 'staff_participation',
  })
}

async function removeStaffReservation(eventId: string, staffName: string): Promise<void> {
  const { data: existing } = await supabase
    .from('reservations')
    .select('id, participant_names')
    .eq('schedule_event_id', eventId)
    .eq('reservation_source', 'staff_participation')
  const target = existing?.find(r =>
    Array.isArray(r.participant_names) && r.participant_names.includes(staffName)
  )
  if (target) {
    await supabase.from('reservations').delete().eq('id', target.id)
  }
}

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
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
  allAvailableStaff?: StaffType[]  // その日時に出勤している全GM
  onScenariosUpdate?: () => void  // シナリオ作成後の更新用コールバック
  onStaffUpdate?: () => void  // スタッフ作成後の更新用コールバック
  onParticipantChange?: (eventId: string, newCount: number) => void  // 参加者数変更時のコールバック
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>  // イベント削除時のコールバック（貸切参加者全員キャンセル時）
  /** 履歴スナップショット表示用: 全フィールド disabled・保存/削除非表示・他タブ非表示にして「その時点の見た目」だけを再現する */
  readOnly?: boolean
}

// 30分間隔の時間オプションを生成
const generateTimeOptions = () => {
  const options = []
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

const timeOptions = generateTimeOptions()

// 公演カテゴリ別のトーン（bg=ダイアログ背景, section=内側カード/フッター/タブ, border=枠線）
// イベント枠の categoryConfig と同じ系統だが、内側に階調をつけるため 3 段階で持つ
const CATEGORY_TONE: Record<string, { bg: string; section: string; border: string }> = {
  open:              { bg: '#eff6ff', section: '#dbeafe', border: '#bfdbfe' }, // blue-50/100/200
  private:           { bg: '#faf5ff', section: '#f3e8ff', border: '#e9d5ff' }, // purple
  gmtest:            { bg: '#fff7ed', section: '#ffedd5', border: '#fed7aa' }, // orange
  testplay:          { bg: '#fefce8', section: '#fef9c3', border: '#fef08a' }, // yellow
  offsite:           { bg: '#f0fdf4', section: '#dcfce7', border: '#bbf7d0' }, // green
  venue_rental:      { bg: '#ecfeff', section: '#cffafe', border: '#a5f3fc' }, // cyan
  venue_rental_free: { bg: '#f0fdfa', section: '#ccfbf1', border: '#99f6e4' }, // teal
  package:           { bg: '#fdf2f8', section: '#fce7f3', border: '#fbcfe8' }, // pink
  mtg:               { bg: '#ecfeff', section: '#cffafe', border: '#a5f3fc' }, // cyan
  memo:              { bg: '#f9fafb', section: '#f3f4f6', border: '#e5e7eb' }, // gray
}

// スタッフの背景色から文字色を取得するマッピング
const COLOR_MAP: Record<string, string> = {
  '#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A',
  '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626',
  '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777',
  '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D',
}

// アバターの文字色
const AVATAR_TEXT_COLORS = [
  '#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'
]

// スタッフの文字色を取得
const getStaffTextColor = (staff: StaffType): string => {
  if (staff.avatar_color) {
    return COLOR_MAP[staff.avatar_color] || '#374151'
  }
  // avatar_color未設定の場合は名前からハッシュ値を計算して色を決定
  const name = staff.name
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colorIndex = hash % AVATAR_TEXT_COLORS.length
  return AVATAR_TEXT_COLORS[colorIndex]
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
  const [staffParticipantsFromDB, setStaffParticipantsFromDB] = useState<string[]>([])
  // add モードで「+ 参加者を追加」した時のバッファ (event 未保存のため DB INSERT できないので一時保持)
  // 保存時に handleSave で一括 INSERT する
  type PendingParticipant = { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([])
  // 選択中シナリオのキット配置店舗一覧 (scenario_master_id 単位)
  const [kitStoreIds, setKitStoreIds] = useState<string[]>([])
  // シナリオ変更確認ダイアログ（参加者がいる場合）
  const [pendingScenarioTitle, setPendingScenarioTitle] = useState<string | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  // ローカルで参加者数を管理（リアルタイム表示用）
  const [localCurrentParticipants, setLocalCurrentParticipants] = useState<number>(event?.current_participants || 0)
  const [formData, setFormData] = useState<EventFormData>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    gmRoles: {}, // 初期値
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

  // 時間帯のデフォルト設定（設定から動的に取得）
  const [timeSlotDefaults, setTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 店舗のデフォルト公演時間（分）- performance_schedule_settings から取得
  const [defaultDuration, setDefaultDuration] = useState(180)

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
  const scenarioOptions = useMemo(() => {
    return scenarios.map(scenario => {
      // この店舗で公演可能かチェック
      const isAvailableAtCurrentVenue = !formData.venue || 
        !scenario.available_stores || 
        scenario.available_stores.length === 0 ||
        scenario.available_stores.includes(formData.venue)
      
      // このシナリオの担当GM全員を取得（special_scenarios は scenario_master_id を格納）
      const isAssignedGM = (gm: StaffType) => {
        const specialScenarios = gm.special_scenarios || []
        return specialScenarios.includes(scenario.scenario_master_id || scenario.id) || 
               specialScenarios.includes(scenario.id) ||
               specialScenarios.includes(scenario.title)
      }
      
      // 出勤中かどうかをチェック
      const isAvailableGM = (gm: StaffType) => allAvailableStaff.some(a => a.id === gm.id)
      
      // 担当または出勤のスタッフのみ表示（その他は除外）
      const filteredDisplayGMs = staff
        .filter(gm => gm.status === 'active')
        .map(gm => ({
          gm,
          isAssigned: isAssignedGM(gm),
          isAvailable: isAvailableGM(gm)
        }))
        // 担当または出勤のみ表示
        .filter(({ isAssigned, isAvailable }) => isAssigned || isAvailable)
        // ソート: 担当+出勤 > 担当のみ > 出勤のみ
        .sort((a, b) => {
          const scoreA = (a.isAssigned ? 2 : 0) + (a.isAvailable ? 1 : 0)
          const scoreB = (b.isAssigned ? 2 : 0) + (b.isAvailable ? 1 : 0)
          return scoreB - scoreA
        })
      
      // シナリオのソート優先度を計算
      // 担当かつ出勤のGMがいる: 最優先(0)、担当のみ: 次(1)、出勤のみ: その次(2)、なし: 最後(3)
      const hasAssignedAndAvailable = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && isAvailable)
      const hasAssignedOnly = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => isAssigned && !isAvailable)
      const hasAvailableOnly = filteredDisplayGMs.some(({ isAssigned, isAvailable }) => !isAssigned && isAvailable)
      
      let sortPriority = 3
      if (hasAssignedAndAvailable) sortPriority = 0
      else if (hasAssignedOnly) sortPriority = 1
      else if (hasAvailableOnly) sortPriority = 2
      
      // 担当GM情報のJSX
      const gmDisplayInfo = filteredDisplayGMs.length > 0 
        ? (
            <span className="flex flex-wrap gap-0.5 items-center">
              {filteredDisplayGMs.map(({ gm, isAssigned, isAvailable }) => {
                // 担当かつ出勤 → 緑背景
                if (isAssigned && isAvailable) {
                  return (
                    <span 
                      key={gm.id}
                      className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-green-100 text-green-800 border border-green-300"
                    >
                      {gm.name}
                    </span>
                  )
                }
                // 担当だが出勤なし → 青背景
                if (isAssigned && !isAvailable) {
                  return (
                    <span 
                      key={gm.id}
                      className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-300"
                    >
                      {gm.name}
                    </span>
                  )
                }
                // 担当でないが出勤中 → 白背景・灰色文字
                return (
                  <span 
                    key={gm.id}
                    className="inline-flex items-center px-1 py-0 rounded text-[11px] bg-white text-gray-400 border border-gray-200"
                  >
                    {gm.name}
                  </span>
                )
              })}
            </span>
          )
        : null
      
      const renderedContent = (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate">{scenario.title}</span>
            {scenario.player_count_max && (
              <span className="text-[10px] text-muted-foreground shrink-0">{scenario.player_count_max}名</span>
            )}
            {!isAvailableAtCurrentVenue && (
              <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-300 flex-shrink-0">
                公演不可
              </span>
            )}
          </div>
          {gmDisplayInfo && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {gmDisplayInfo}
            </div>
          )}
        </div>
      )

      return {
        value: scenario.title,
        label: scenario.title + (!isAvailableAtCurrentVenue ? ' [公演不可]' : ''),
        renderedContent,
        displayInfo: gmDisplayInfo,
        // 検索用テキストは「出勤かつ担当」のGMのみ
        displayInfoSearchText: filteredDisplayGMs
          .filter(({ isAssigned, isAvailable }) => isAssigned && isAvailable)
          .map(({ gm }) => gm.name).join(', '),
        // ソート用の優先度
        sortPriority,
        scenarioTitle: scenario.title,
        playCount: scenario.play_count ?? 0
      }
    })
    // ソート: 優先度順 → 同一優先度内は公演数の多い順
    .sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) {
        return a.sortPriority - b.sortPriority
      }
      return b.playCount - a.playCount
    })
    // ソート後、不要なプロパティを除去
    .map(({ sortPriority, scenarioTitle, playCount, ...rest }) => rest)
  }, [scenarios, formData.venue, staff, allAvailableStaff])

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

  // デフォルト公演時間を読み込む（performance_schedule_settings から）
  useEffect(() => {
    const loadDefaultDuration = async () => {
      try {
        const venueValue = formData.venue || ''
        const storeId = resolveStoreId(venueValue) || stores[0]?.id
        if (!storeId) return
        const { data } = await supabase
          .from('performance_schedule_settings')
          .select('default_duration')
          .eq('store_id', storeId)
          .maybeSingle()
        if (data?.default_duration) {
          setDefaultDuration(data.default_duration)
        }
      } catch { /* ignore */ }
    }
    loadDefaultDuration()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.venue, stores])

  // 営業時間設定を読み込む（公演時間設定は useTimeSlotSettings で取得）
  useEffect(() => {
    const loadBusinessHoursSettings = async () => {
      try {
        // venueが店舗名の場合はIDに変換
        const venueValue = formData.venue || ''
        const storeId = resolveStoreId(venueValue) || stores[0]?.id
        if (!storeId) return

        // 営業時間設定を取得（組織でフィルタ）
        let businessHoursQuery = supabase
          .from('business_hours_settings')
          .select('opening_hours, holidays, time_restrictions')
          .eq('store_id', storeId)
        
        if (organizationId) {
          businessHoursQuery = businessHoursQuery.eq('organization_id', organizationId)
        }
        
        const { data: businessHoursData, error: businessHoursError } = await businessHoursQuery.maybeSingle()

        if (businessHoursError && businessHoursError.code !== 'PGRST116') {
          logger.error('営業時間設定取得エラー:', businessHoursError)
        }

        // 営業時間制限の適用（時間選択肢の制限）
        if (businessHoursData?.opening_hours) {
          const openingHours = businessHoursData.opening_hours
          // 営業時間設定が配列形式（曜日別）か単純なオブジェクト形式かで処理を分ける
          if (Array.isArray(openingHours) && openingHours.length > 0) {
            // 曜日別設定の場合は、共通の開店・閉店時刻を取得（最も広い範囲）
            const allOpenTimes = openingHours.map((h: any) => h.open_time).filter(Boolean)
            const allCloseTimes = openingHours.map((h: any) => h.close_time).filter(Boolean)
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
    // 設定がロード中の場合は待機（追加モードの場合のみ）
    if (mode === 'add' && isTimeSlotSettingsLoading) {
      return
    }
    void initForm()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, event, initialData, getDefaultsForDate, isTimeSlotSettingsLoading])

  // シナリオ変更時にキット配置店舗を取得
  useEffect(() => {
    const selectedScenario = scenarios.find(s => s.title === formData.scenario)
    const masterId = selectedScenario?.scenario_master_id || selectedScenario?.id
    if (!masterId) {
      setKitStoreIds([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        if (!orgId) return
        const { data, error } = await supabase
          .from('scenario_kit_locations')
          .select('store_id')
          .eq('scenario_master_id', masterId)
          .eq('organization_id', orgId)
        if (error || cancelled) return
        const ids = Array.from(new Set((data || []).map(r => r.store_id).filter(Boolean) as string[]))
        setKitStoreIds(ids)
      } catch (err) {
        logger.error('キット配置店舗の取得エラー:', err)
      }
    })()
    return () => { cancelled = true }
  }, [formData.scenario, scenarios])

  const initForm = async () => {
    
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      // シナリオIDがない場合は、タイトルから逆引き
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
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
      setFormData({
        ...event,
        scenario_master_id: selectedScenario?.id,  // scenario_masters.id
        time_slot: event.time_slot || timeSlotEnToSchedule(slot), // time_slotを設定
        max_participants: selectedScenario?.player_count_max ?? event.max_participants ?? DEFAULT_MAX_PARTICIPANTS, // シナリオの参加人数を反映
        gmRoles: event.gm_roles || {}, // 既存の役割があれば設定
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
        start_time: startTime,
        end_time: endTime,
        category: 'open',
        max_participants: DEFAULT_MAX_PARTICIPANTS,
        capacity: 0,
        notes: slotMemo,  // スロットメモを備考に引き継ぎ
        reservation_name: ''  // 予約者名（初期値は空）
      })
    }
  }

  // 終了時間を自動計算する関数
  const calculateEndTime = (startTime: string, scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    if (!selectedScenario) return startTime
    
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = startMinutes + selectedScenario.duration
    const endHour = Math.floor(endMinutes / 60)
    const endMinute = endMinutes % 60
    return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
  }

  // 開始時間変更時の自動設定
  // ※開始時間を変更しても時間帯（朝/昼/夜）は変更されない
  const handleStartTimeChange = (startTime: string) => {
    // シナリオが選択されている場合はシナリオのdurationで計算
    // 未選択の場合は公演スケジュール設定のdefault_durationで計算
    let endTime: string
    if (formData.scenario) {
      endTime = calculateEndTime(startTime, formData.scenario)
    } else {
      const [h, m] = startTime.split(':').map(Number)
      const totalMinutes = h * 60 + m + defaultDuration
      const endH = Math.floor(totalMinutes / 60)
      const endM = totalMinutes % 60
      endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
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
    // 終了時間の自動計算
    const currentStartMinutes = parseInt(formData.start_time.split(':')[0]) * 60 + parseInt(formData.start_time.split(':')[1])
    const prepMinutes = selectedScenario.extra_preparation_time ?? 0
    const requiredStartMinutes = currentStartMinutes + prepMinutes
    let adjustedStartTime = formData.start_time
    if (requiredStartMinutes > currentStartMinutes) {
      const hours = Math.floor(requiredStartMinutes / 60)
      const minutes = requiredStartMinutes % 60
      adjustedStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
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

  const handleSave = async () => {
    // 時間帯を'朝'/'昼'/'夜'形式で保存
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
    
    // 楽観的クローズ: onSave の完了を待たずにダイアログを閉じて体感速度を上げる。
    // 重複/通信エラー時は useEventOperations 側で toast 表示されるので、ユーザは
    // toast を見て必要に応じてモーダルを開き直す。
    // 保存中の体感フィードバックとして loading toast を出し、完了で dismiss する。
    const loadingToastId = toast.loading('保存中...')
    const savePromise = onSave(saveData)
    onClose()

    // 残りの post-save 処理 (pending 参加者 INSERT) はバックグラウンドで実行
    void (async () => {
      const success = await savePromise
      toast.dismiss(loadingToastId)
      if (!success) return // error toast は useEventOperations 側で出る

      // バッファされた一般参加者 (+ 参加者を追加で追加された分) を並列 INSERT
      try {
        if (pendingParticipants.length > 0) {
          const orgId = await getCurrentOrganizationId()
          let targetEventId: string | undefined = event?.id
          if (!targetEventId) {
            const { data: matched } = await supabase
              .from('schedule_events')
              .select('id')
              .eq('organization_id', orgId)
              .eq('date', saveData.date)
              .eq('start_time', saveData.start_time)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
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
              return supabase.from('reservations').insert({
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

  // ヘッダー右側に出すサマリー (旧フッターの内容)
  const renderPerformanceSummary = () => {
    const category = formData.category

    // シナリオの通常参加費（1名あたり）を取得するヘルパー
    const getNormalFeeAmount = (scenario: Scenario): number | null => {
      if (scenario.participation_costs && scenario.participation_costs.length > 0) {
        const normalCosts = scenario.participation_costs.filter(
          c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
        )
        if (normalCosts.length >= 1) return normalCosts[0].amount
      }
      return scenario.participation_fee || null
    }

    // 「¥per / ¥total」形式で返す (total は per × player_count_max を満員想定で計算)
    const formatFee = (per: number, max: number): string =>
      `¥${per.toLocaleString()} / ¥${(per * max).toLocaleString()}`

    const getCategoryFee = (): { label: string; fee: string } | null => {
      if (category === 'mtg' || category === 'memo') return null
      if (category === 'venue_rental') {
        const fee = formData.venue_rental_fee ?? 12000
        return { label: '場所貸し', fee: `¥${fee.toLocaleString()}` }
      }
      if (category === 'venue_rental_free') return { label: '場所貸し', fee: '¥0' }
      if (category === 'testplay') return { label: 'テストプレイ', fee: '¥0' }
      const selectedScenario = scenarios.find(s => s.title === formData.scenario)
      if (!formData.scenario || !selectedScenario) return null
      const maxP = selectedScenario.player_count_max || formData.max_participants || 1
      if (category === 'gmtest') {
        let per = 0
        if (selectedScenario.participation_costs && selectedScenario.participation_costs.length > 0) {
          const gmtestCost = selectedScenario.participation_costs.find(
            c => c.time_slot === 'gmtest' && (c.status === 'active' || !c.status)
          )
          if (gmtestCost) per = gmtestCost.amount
        }
        if (!per && selectedScenario.gm_test_participation_fee) per = selectedScenario.gm_test_participation_fee
        return { label: 'GMテスト', fee: per > 0 ? formatFee(per, maxP) : '¥0' }
      }
      if (category === 'private') {
        const perPerson = getNormalFeeAmount(selectedScenario)
        if (perPerson) return { label: '貸切', fee: formatFee(perPerson, maxP) }
        return null
      }
      // open / offsite / package など
      if (selectedScenario.participation_costs && selectedScenario.participation_costs.length > 0) {
        const normalCosts = selectedScenario.participation_costs.filter(
          c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
        )
        if (normalCosts.length === 1) return { label: '', fee: formatFee(normalCosts[0].amount, maxP) }
        if (normalCosts.length > 1) {
          const amounts = normalCosts.map(c => c.amount)
          const min = Math.min(...amounts)
          const max = Math.max(...amounts)
          if (min === max) return { label: '', fee: formatFee(min, maxP) }
          return { label: '', fee: `¥${min.toLocaleString()}〜 / ¥${(max * maxP).toLocaleString()}` }
        }
      }
      if (selectedScenario.participation_fee) {
        return { label: '', fee: formatFee(selectedScenario.participation_fee, maxP) }
      }
      return null
    }

    const selectedScenario = formData.scenario ? scenarios.find(s => s.title === formData.scenario) : null
    const categoryFee = getCategoryFee()
    const hasGms = formData.gms && formData.gms.length > 0
    const CATEGORY_LABEL_MAP: Record<string, string> = {
      open: 'オープン', private: '貸切', offsite: '出張', testplay: 'テストプレイ',
      gmtest: 'GMテスト', venue_rental: '場所貸し', venue_rental_free: '場所貸無料',
      package: 'パッケージ', mtg: 'MTG', memo: 'メモ',
    }
    const categoryLabel = CATEGORY_LABEL_MAP[category] || category
    const tone = CATEGORY_TONE[category]

    const getRoleBadge = (name: string): { label: string; bg: string; text: string } => {
      const role = formData.gmRoles?.[name] || 'main'
      if (role === 'observer') return { label: '見学', bg: '#e0e7ff', text: '#3730a3' }
      if (role === 'reception') return { label: '受付', bg: '#ffedd5', text: '#9a3412' }
      if (role === 'staff') {
        const isBacked = staffParticipantsFromDB.includes(name)
        return { label: isBacked ? '参加' : '参加予定', bg: '#dcfce7', text: '#166534' }
      }
      if (role === 'sub') return { label: 'サブ', bg: '#dbeafe', text: '#1e40af' }
      // main: カテゴリ色 (CATEGORY_TONE) を使用
      return { label: 'メイン', bg: tone?.section ?? '#f3f4f6', text: '#1f2937' }
    }

    const categoryBadge = categoryLabel ? (
      <span
        className="inline-flex items-center shrink-0 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm whitespace-nowrap"
        style={tone ? { backgroundColor: tone.border, color: '#1f2937' } : { backgroundColor: '#f3f4f6', color: '#374151' }}
      >
        {categoryLabel}
      </span>
    ) : null

    const gmList = hasGms ? (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {formData.gms.map((name, idx) => {
          const badge = getRoleBadge(name)
          return (
            <span
              key={`${name}-${idx}`}
              className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: badge.bg, color: badge.text }}
              title={badge.label}
            >
              {name}
            </span>
          )
        })}
      </span>
    ) : null

    if (selectedScenario) {
      const playerMax = selectedScenario.player_count_max || formData.max_participants || 8
      const showParticipants = mode === 'edit' && event && !event.is_private_request && !event.is_private_booking
      return (
        <div className="flex flex-col items-end gap-1 min-w-0 max-w-[260px] sm:max-w-[340px]">
          <div className="flex items-center gap-2 min-w-0 w-full justify-end text-xs">
            {categoryBadge}
            <span className="font-semibold truncate min-w-0" title={selectedScenario.title}>{selectedScenario.title}</span>
            {categoryFee && (
              <span className="shrink-0 font-bold whitespace-nowrap pl-2 border-l border-muted-foreground/20">
                {categoryFee.fee}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground justify-end w-full">
            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{selectedScenario.duration}h</span>
            <span className="flex items-center gap-0.5">
              <Users className="w-3 h-3" />
              {showParticipants ? `${localCurrentParticipants}/${playerMax}` : `最大${playerMax}`}
            </span>
            {gmList && (<span className="flex items-center gap-1"><UserCog className="w-3 h-3" />{gmList}</span>)}
          </div>
        </div>
      )
    }

    if (categoryFee || hasGms || categoryLabel) {
      return (
        <div className="flex items-center gap-2 flex-wrap text-[11px] sm:text-xs justify-end max-w-[260px] sm:max-w-[320px]">
          {categoryBadge}
          {categoryFee && <span className="text-xs font-bold pl-2 border-l border-muted-foreground/20">{categoryFee.fee}</span>}
          {gmList && (
            <span className="flex items-center gap-1 ml-1">
              <UserCog className="w-3 h-3 text-muted-foreground" />
              {gmList}
            </span>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setActiveTab('edit') // タブをリセット
        onClose()
      }
    }}>
      <DialogContent
        size="md"
        data-perf-modal=""
        className="h-[85vh] sm:h-[80vh] max-w-[480px] overflow-hidden flex flex-col p-0 gap-0 transition-colors"
        // 編集中のカテゴリ把握用に、ダイアログ全体の背景・枠を該当カテゴリ色で着色
        style={(() => {
          const tone = CATEGORY_TONE[formData.category]
          return tone
            ? ({ backgroundColor: tone.bg, borderColor: tone.border, ['--input-bg' as string]: tone.bg } as React.CSSProperties)
            : undefined
        })()}
        // 保存後、events 再フェッチでトリガー要素が一時的に消えると Radix の focus
        // 復元先がなくなり body にフォールバックしてページ最上部までスクロールするため、
        // close 時の auto-focus 復元を無効化する。
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* カテゴリ別 tone.bg を Select/Input/Textarea/PopoverTrigger/タブ/白系ボタン に適用 */}
        {CATEGORY_TONE[formData.category] && (
          <style>{`
            [data-perf-modal] [role="combobox"],
            [data-perf-modal] button[aria-haspopup="dialog"],
            [data-perf-modal] input:not([type="checkbox"]):not([type="radio"]),
            [data-perf-modal] textarea,
            [data-perf-modal] button.bg-white,
            [data-perf-modal] button.bg-background {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
              border-color: ${CATEGORY_TONE[formData.category].border} !important;
            }
            [data-perf-modal] [role="combobox"]:focus,
            [data-perf-modal] input:not([type="checkbox"]):not([type="radio"]):focus,
            [data-perf-modal] textarea:focus {
              background-color: #ffffff !important;
            }
            /* アクティブタブの白背景を tone.bg に上書き (shadcn デフォルトは bg-background) */
            [data-perf-modal] [role="tab"][data-state="active"] {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
            }
            /* outline 系の Button (キャンセル等) も tone.bg に */
            [data-perf-modal] button[class*="border-input"]:not([data-state="active"]):not(.bg-slate-900):not(.bg-primary) {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
              border-color: ${CATEGORY_TONE[formData.category].border} !important;
            }
            /* Badge 系 (bg-gray-100 等) は tone.section で内側に少し色がつくように */
            [data-perf-modal] .bg-gray-100 {
              background-color: ${CATEGORY_TONE[formData.category].section} !important;
            }
          `}</style>
        )}
        <DialogHeader className="px-2 sm:px-4 py-1.5 sm:py-2 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6 sm:pr-8">
            <div className="flex flex-col min-w-0 shrink-0">
              <DialogTitle className="text-sm sm:text-base">{modalTitle}</DialogTitle>
              <DialogDescription className="text-[11px] sm:text-xs">
                {modalDescription}
              </DialogDescription>
            </div>
            {/* 公演情報サマリー (右上、旧フッターから移動) */}
            <div className="ml-auto">
              {renderPerformanceSummary()}
            </div>
          </div>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
          <div className={`px-2 sm:px-4 pt-1.5 sm:pt-2 shrink-0 ${readOnly ? 'hidden' : ''}`}>
            <TabsList
              className="grid w-full grid-cols-4 h-7 sm:h-8"
              style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section } : undefined}
            >
              <TabsTrigger value="edit" className="text-[11px] sm:text-xs h-6 sm:h-7">公演情報</TabsTrigger>
              <TabsTrigger value="reservations" className="text-[11px] sm:text-xs h-6 sm:h-7">
                予約者
                {event && (
                  <Badge variant="secondary" className="ml-1 h-3.5 sm:h-4 px-1 text-[11px] sm:text-[11px]">
                    {event.is_private_request || event.is_private_booking
                      ? '満席'
                      : `${localCurrentParticipants}/${event.scenarios?.player_count_max || event.max_participants || 8}名`
                    }
                    {event.is_cancelled && (event.current_participants ?? 0) > 0 && (
                      <span className="text-red-500 ml-1">
                        （中止前{event.current_participants}名）
                      </span>
                    )}
                    {!event.is_cancelled && staffParticipantsFromDB.length > 0 && (
                      <span className="text-blue-600 ml-1">
                        （内スタッフ{staffParticipantsFromDB.length}）
                      </span>
                    )}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="survey" className="text-[11px] sm:text-xs h-6 sm:h-7">アンケート</TabsTrigger>
              <TabsTrigger value="history" className="text-[11px] sm:text-xs h-6 sm:h-7">更新履歴</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <fieldset disabled={readOnly} className="min-w-0 p-0 m-0 border-0" style={readOnly ? { display: 'contents' } : undefined}>
            <div className="space-y-3 pb-2 sm:pb-0">

          {/* ── カテゴリ（クイック選択） ── */}
          {(() => {
            const PRIMARY_CATS: { value: string; label: string }[] = [
              { value: 'open',     label: 'オープン' },
              { value: 'private',  label: '貸切' },
              { value: 'gmtest',   label: 'GMテスト' },
              { value: 'testplay', label: 'テストプレイ' },
              { value: 'offsite',  label: '出張' },
            ]
            const OTHER_CATS: { value: string; label: string }[] = [
              { value: 'venue_rental',      label: '場所貸し' },
              { value: 'venue_rental_free', label: '場所貸無料' },
              { value: 'package',           label: 'パッケージ会' },
              { value: 'mtg',               label: 'MTG' },
              { value: 'memo',              label: 'メモに変換' },
              { value: '__custom__',       label: 'カスタム…' },
            ]
            const isPrimary = PRIMARY_CATS.some(c => c.value === formData.category)
            const otherMatch = OTHER_CATS.find(c => c.value === formData.category)
            const otherTriggerLabel = otherMatch?.label
              ?? (formData.category && !isPrimary ? formData.category : 'その他')
            return (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRIMARY_CATS.map(c => {
                    const active = formData.category === c.value
                    return (
                      <button
                        key={c.value}
                        type="button"
                        disabled={formData.is_private_request}
                        onClick={() => setFormData((prev: EventFormData) => ({ ...prev, category: c.value }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                  <Select
                    value={isPrimary ? '' : (formData.category || '')}
                    onValueChange={(value: string) => setFormData((prev: EventFormData) => ({ ...prev, category: value }))}
                    disabled={formData.is_private_request}
                  >
                    <SelectTrigger
                      className={`h-7 w-auto px-2.5 text-xs rounded-full gap-1 bg-white ${
                        isPrimary
                          ? 'text-gray-700 border-gray-300'
                          : 'text-slate-900 border-slate-900 border-2 font-medium'
                      }`}
                    >
                      <SelectValue placeholder="その他">{otherTriggerLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {OTHER_CATS.map(c => (
                        <SelectItem key={c.value} value={c.value} className="text-xs py-1">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(formData.category === '__custom__' || (formData.category && !isPrimary && !otherMatch)) && !formData.is_private_request && (
                  <Input
                    value={formData.category === '__custom__' ? '' : formData.category}
                    onChange={(e) => setFormData((prev: EventFormData) => ({ ...prev, category: e.target.value || '__custom__' }))}
                    placeholder="カスタム種別名（例: 体験公演）"
                    className="h-7 text-xs"
                  />
                )}
                {formData.is_private_request && <p className="text-[11px] text-purple-600">※ 貸切のためカテゴリ変更不可</p>}
              </div>
            )
          })()}

          {/* ── セクション1: 日時・場所 ── */}
          <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Calendar className="h-3.5 w-3.5" />日時・場所
            </p>

            {/* 日付 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">日付</Label>
              <div className="flex-1">
                <SingleDatePopover
                  date={formData.date}
                  onDateChange={(date) => setFormData((prev: any) => ({ ...prev, date: date || '' }))}
                  placeholder="日付を選択"
                  buttonClassName="h-7 text-xs w-full"
                />
              </div>
            </div>

            {/* 店舗 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">店舗</Label>
              <div className="flex-1">
                <Select value={formData.venue} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="店舗を選択">
                      <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[11px] px-1 py-0" variant="secondary">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(store => (
                      <SelectItem key={store.id} value={store.id} className="text-xs py-1">
                        <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[11px] px-1 py-0" variant="secondary">{store.name}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 時間帯 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">時間帯</Label>
              <div className="flex-1">
                <Select value={timeSlot} onValueChange={(value: 'morning' | 'afternoon' | 'evening') => handleTimeSlotChange(value)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning" className="text-xs py-1">{timeSlotDefaults.morning.label}</SelectItem>
                    <SelectItem value="afternoon" className="text-xs py-1">{timeSlotDefaults.afternoon.label}</SelectItem>
                    <SelectItem value="evening" className="text-xs py-1">{timeSlotDefaults.evening.label}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 開始〜終了 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">開始〜終了</Label>
              <div className="flex items-center gap-2 flex-1">
                <Select value={formData.start_time?.slice(0, 5)} onValueChange={handleStartTimeChange} disabled={formData.is_private_request}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="開始" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground shrink-0">〜</span>
                <Select value={formData.end_time?.slice(0, 5)} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))} disabled={formData.is_private_request}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="終了" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map(time => <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.is_private_request && (
              <p className="text-[11px] text-purple-600 pl-[84px]">※ 貸切の日時変更不可</p>
            )}
          </div>{/* /セクション1 */}

          {/* ── セクション2: 公演内容 ── */}
          <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <BookOpen className="h-3.5 w-3.5" />公演内容
            </p>

            {/* シナリオ */}
            <div className="flex items-start gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">シナリオ</Label>
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  value={formData.scenario}
                  onValueChange={(scenarioTitle) => {
                    const hasParticipants = localCurrentParticipants > 0
                    const isScenarioChanged = scenarioTitle !== formData.scenario
                    if (mode === 'edit' && hasParticipants && isScenarioChanged) {
                      setPendingScenarioTitle(scenarioTitle)
                      return
                    }
                    applyScenarioChange(scenarioTitle)
                  }}
                  options={scenarioOptions}
                  placeholder="シナリオ"
                  searchPlaceholder="検索..."
                  emptyText="シナリオが見つかりません"
                  emptyActionLabel="シナリオを作成"
                  onEmptyAction={() => setIsScenarioDialogOpen(true)}
                  className="h-7 text-xs"
                  allowClear={!formData.is_private_request}
                  headerContent={
                    <span className="flex gap-1 text-[9px] text-muted-foreground">
                      <span className="inline-flex items-center px-1 rounded bg-green-100 text-green-700 border border-green-300">担当+出勤</span>
                      <span className="inline-flex items-center px-1 rounded bg-blue-100 text-blue-700 border border-blue-300">担当</span>
                      <span className="inline-flex items-center px-1 rounded bg-white text-gray-400 border border-gray-200">出勤</span>
                    </span>
                  }
                />
                {formData.is_private_request && <p className="text-[11px] text-purple-600 mt-0.5">※ 貸切のシナリオ変更不可</p>}
                {formData.scenario && !scenarios.find(s => s.title === formData.scenario) && (
                  <div className="mt-0.5 p-1.5 bg-orange-50 border border-orange-200 rounded text-[11px]">
                    <div className="flex items-center gap-1 text-orange-700">
                      <span className="font-semibold">⚠️ 未登録:</span>
                      <span className="font-mono break-all">{formData.scenario}</span>
                    </div>
                    <p className="mt-0.5 text-orange-500">プルダウンから選択してください</p>
                  </div>
                )}
                {formData.scenario && formData.venue && (() => {
                  const selectedScenario = scenarios.find(s => s.title === formData.scenario)
                  if (selectedScenario && !isScenarioAvailableAtVenue(selectedScenario)) {
                    const storeName = stores.find(s => s.id === formData.venue)?.name || formData.venue
                    return (
                      <div className="mt-0.5 p-1.5 bg-orange-50 border border-orange-200 rounded text-[11px]">
                        <div className="flex items-center gap-1 text-orange-700">
                          <span className="font-semibold">⚠️ 公演不可店舗:</span>
                          <span>{storeName}</span>
                        </div>
                        <p className="mt-0.5 text-orange-500">このシナリオは選択中の店舗では公演できません</p>
                      </div>
                    )
                  }
                  return null
                })()}
                {/* キット配置警告: シナリオに紐づくキットが選択中の店舗に無い時に出す
                   (kitStoreIds が空 = キット未登録のシナリオは判定スキップ) */}
                {formData.scenario && formData.venue && kitStoreIds.length > 0 && !kitStoreIds.includes(formData.venue) && (() => {
                  const storeName = stores.find(s => s.id === formData.venue)?.name || formData.venue
                  const kitStoreNames = kitStoreIds
                    .map(id => stores.find(s => s.id === id)?.short_name || stores.find(s => s.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="mt-0.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px]">
                      <div className="flex items-center gap-1 text-amber-700">
                        <span className="font-semibold">⚠️ キット未配置:</span>
                        <span>{storeName}</span>
                      </div>
                      <p className="mt-0.5 text-amber-600">
                        この店舗には{kitStoreNames ? `キットが置かれていません (現在の配置: ${kitStoreNames})` : 'キットが置かれていません'}
                      </p>
                    </div>
                  )
                })()}
                {formData.scenario && (() => {
                  const selectedScenario = scenarios.find(s => s.title === formData.scenario)
                  if (selectedScenario) {
                    return (
                      <Button type="button" variant="link" size="sm" className="mt-0.5 h-auto p-0 text-xs"
                        onClick={() => { setEditingScenarioId(selectedScenario.id); setIsScenarioDialogOpen(true) }}>
                        <ExternalLink className="h-3 w-3 mr-1" />シナリオを編集
                      </Button>
                    )
                  }
                  return null
                })()}
              </div>
            </div>

            {/* 最大参加者数 */}
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">最大定員</Label>
              <div className="w-24">
                <Input id="max_participants" type="number" min="1" max="20"
                  value={formData.max_participants}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
                  disabled={formData.is_private_request} className="h-7 text-xs" />
              </div>
              {formData.scenario && <span className="text-[11px] text-muted-foreground">※ シナリオから自動設定</span>}
            </div>

            {/* 公演料金（場所貸しのみ） */}
            {(formData.category === 'venue_rental' || formData.category === 'venue_rental_free') && (
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">公演料金</Label>
                <div className="w-32">
                  <Input id="venue_rental_fee" type="number" min="0" step="1000" placeholder="12000"
                    value={formData.venue_rental_fee ?? ''}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, venue_rental_fee: e.target.value ? parseInt(e.target.value) : undefined }))}
                    className="h-7 text-xs" />
                </div>
                <span className="text-[11px] text-muted-foreground">※ 未入力時は12,000円</span>
              </div>
            )}
          </div>{/* /セクション2 */}

          {/* ── セクション3: スタッフ・備考 ── */}
          <div className="rounded-lg border p-3 space-y-2" style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section, borderColor: CATEGORY_TONE[formData.category].border } : { backgroundColor: "rgb(248 250 252 / 0.7)" }}>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5" />スタッフ・備考
            </p>

          {/* GM */}
          <div className="flex items-start gap-3">
            <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">GM</Label>
            <div className="flex-1 min-w-0">
            <MultiSelect
              options={(() => {
                const options = staff
                  .filter(s => s.status === 'active')
                  .map(staffMember => {
                    const matchedScenario = formData.scenario ? scenarios.find(sc => sc.title === formData.scenario) : null
                    const isAssignedGM = formData.scenario && matchedScenario &&
                      (staffMember.special_scenarios?.includes(matchedScenario.scenario_master_id || matchedScenario.id) ||
                       staffMember.special_scenarios?.includes(matchedScenario.id))
                    const isAvailable = allAvailableStaff.some(gm => gm.id === staffMember.id)
                    const badges: React.ReactNode[] = []
                    if (isAvailable) {
                      badges.push(
                        <span key="shift" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">シフト済</span>
                      )
                    }
                    if (isAssignedGM) {
                      badges.push(
                        <span key="gm" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">担当</span>
                      )
                    }
                    const searchText = (isAvailable && isAssignedGM) ? 'シフト提出済 担当GM' : ''
                    let sortOrder = 3
                    if (isAvailable && isAssignedGM) sortOrder = 0
                    else if (isAssignedGM) sortOrder = 1
                    else if (isAvailable) sortOrder = 2
                    return {
                      id: staffMember.id,
                      name: staffMember.name,
                      displayInfo: badges.length > 0 ? <span className="flex gap-1">{badges}</span> : undefined,
                      displayInfoSearchText: searchText || undefined,
                      sortOrder
                    }
                  })
                  .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name, 'ja'))
                  .map(({ id, name, displayInfo, displayInfoSearchText }) => ({ id, name, displayInfo, displayInfoSearchText }))
                return options
              })()}
              selectedValues={formData.gms}
              onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
              placeholder="GM"
              closeOnSelect={false}
              emptyText="GMが見つかりません"
              emptyActionLabel="+ GMを作成"
              onEmptyAction={() => setIsStaffModalOpen(true)}
              className="h-7 text-xs"
            />
            {(formData.gms.length > 0 || staffParticipantsFromDB.length > 0) && (
              <div className="flex flex-wrap gap-1 mt-1">
                {formData.gms.map((gm: string, index: number) => {
                  const role = formData.gmRoles?.[gm] || 'main'
                  // staff 役割は常に「参加 (緑)」に統一 (保存時 or role 変更時に予約も自動同期される)
                  // ボーダーは -400 系で背景 (薄色 dialog tone) からはっきり浮き上がるようにする
                  // main 役割はカテゴリ色 (CATEGORY_TONE) を inline style で適用
                  const catTone = CATEGORY_TONE[formData.category]
                  const badgeStyle = role === 'observer'
                    ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-400'
                    : role === 'reception'
                      ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-400'
                      : role === 'staff'
                        ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-400'
                        : role === 'sub'
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-400'
                          : '' // main はインライン style で適用
                  const badgeInlineStyle = role === 'main' && catTone
                    ? { backgroundColor: catTone.section, borderColor: catTone.border, color: '#1f2937' }
                    : undefined
                  return (
                    <Popover key={`gm-${index}`}>
                      <PopoverTrigger asChild>
                        <div
                          className={cn(badgeVariants({ variant: "outline" }), "flex items-center gap-0.5 font-normal border cursor-pointer rounded-[3px] pr-0.5 text-[11px] py-0 h-5", badgeStyle)}
                          style={badgeInlineStyle}
                          role="button"
                        >
                          <span className="flex items-center">
                            <UserCog className="h-2.5 w-2.5 mr-0.5 opacity-70" />
                            {gm}
                            {role === 'sub' && <span className="text-[11px] ml-0.5 font-bold">(サブ)</span>}
                            {role === 'reception' && <span className="text-[11px] ml-0.5 font-bold">(受付)</span>}
                            {role === 'staff' && <span className="text-[11px] ml-0.5 font-bold">{staffParticipantsFromDB.includes(gm) ? '(参加)' : '(参加予定)'}</span>}
                            {role === 'observer' && <span className="text-[11px] ml-0.5 font-bold">(見学)</span>}
                          </span>
                          <div
                            role="button"
                            className="h-3 w-3 flex items-center justify-center rounded-full hover:bg-black/10 ml-0.5"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const removedGm = gm
                              const removedRole = formData.gmRoles?.[removedGm]
                              const newGms = formData.gms.filter((g: string) => g !== removedGm)
                              const newRoles = { ...formData.gmRoles }
                              delete newRoles[removedGm]
                              setFormData((prev: EventFormData) => ({ ...prev, gms: newGms, gmRoles: newRoles }))
                              // role が staff だったなら、対応する予約を削除
                              if (mode === 'edit' && event?.id && removedRole === 'staff') {
                                try {
                                  await removeStaffReservation(event.id, removedGm)
                                  setStaffParticipantsFromDB(prev => prev.filter(n => n !== removedGm))
                                } catch (err) {
                                  logger.error('スタッフ参加予約の削除に失敗:', err)
                                }
                              }
                            }}
                          >
                            <X className="h-2.5 w-2.5" />
                          </div>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-2" align="start">
                        <div className="space-y-1.5">
                          <div className="space-y-0.5">
                            <h4 className="font-medium text-[11px] text-muted-foreground">役割を選択</h4>
                            <RadioGroup
                              value={role}
                              onValueChange={async (value) => {
                                const prevRole = formData.gmRoles?.[gm] || 'main'
                                setFormData((prev: any) => ({ ...prev, gmRoles: { ...prev.gmRoles, [gm]: value } }))
                                // 役割が staff になった瞬間に reservations へ INSERT
                                // 役割が staff から外れた瞬間に対応する予約を DELETE
                                if (mode === 'edit' && event?.id) {
                                  try {
                                    const orgId = await getCurrentOrganizationId()
                                    const scenarioObj = scenarios.find(s => s.title === formData.scenario)
                                    if (value === 'staff' && prevRole !== 'staff') {
                                      await ensureStaffReservation({
                                        eventId: event.id,
                                        staffName: gm,
                                        organizationId: orgId,
                                        scenarioTitle: formData.scenario || '',
                                        scenarioMasterId: scenarioObj?.id ?? null,
                                        storeId: event.store_id ?? null,
                                      })
                                      setStaffParticipantsFromDB(prev => prev.includes(gm) ? prev : [...prev, gm])
                                    } else if (prevRole === 'staff' && value !== 'staff') {
                                      await removeStaffReservation(event.id, gm)
                                      setStaffParticipantsFromDB(prev => prev.filter(n => n !== gm))
                                    }
                                  } catch (err) {
                                    logger.error('スタッフ参加予約の同期に失敗:', err)
                                  }
                                }
                              }}
                              className="gap-0.5"
                            >
                              <div className="flex items-center space-x-1.5 py-0.5">
                                <RadioGroupItem value="main" id={`role-main-${index}`} className="h-3 w-3" />
                                <Label htmlFor={`role-main-${index}`} className="text-xs cursor-pointer">メインGM</Label>
                              </div>
                              <div className="flex items-center space-x-1.5 py-0.5">
                                <RadioGroupItem value="sub" id={`role-sub-${index}`} className="h-3 w-3" />
                                <Label htmlFor={`role-sub-${index}`} className="text-xs cursor-pointer">サブGM</Label>
                              </div>
                              <div className="flex items-center space-x-1.5 py-0.5">
                                <RadioGroupItem value="reception" id={`role-reception-${index}`} className="h-3 w-3" />
                                <Label htmlFor={`role-reception-${index}`} className="text-xs cursor-pointer">受付</Label>
                              </div>
                              <div className="flex items-center space-x-1.5 py-0.5">
                                <RadioGroupItem value="staff" id={`role-staff-${index}`} className="h-3 w-3" />
                                <Label htmlFor={`role-staff-${index}`} className="text-xs cursor-pointer">スタッフ参加</Label>
                              </div>
                              <div className="flex items-center space-x-1.5 py-0.5">
                                <RadioGroupItem value="observer" id={`role-observer-${index}`} className="h-3 w-3" />
                                <Label htmlFor={`role-observer-${index}`} className="text-xs cursor-pointer">スタッフ見学</Label>
                              </div>
                            </RadioGroup>
                          </div>
                          {role === 'sub' && <p className="text-[11px] text-blue-600 bg-blue-50 p-0.5 rounded">※サブGM給与適用</p>}
                          {role === 'reception' && <p className="text-[11px] text-orange-600 bg-orange-50 p-0.5 rounded">※受付（2,000円）</p>}
                          {role === 'staff' && (
                            <p className="text-[11px] p-0.5 rounded text-green-600 bg-green-50">
                              ※ 予約タブのスタッフ予約として自動追加されます
                            </p>
                          )}
                          {role === 'observer' && <p className="text-[11px] text-indigo-600 bg-indigo-50 p-0.5 rounded">※見学のみ</p>}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )
                })}
                {staffParticipantsFromDB
                  .filter((staffName: string) => !formData.gms.includes(staffName) || formData.gmRoles?.[staffName] !== 'staff')
                  .map((staffName: string, index: number) => (
                  <div
                    key={`staff-${index}`}
                    className={cn(badgeVariants({ variant: "outline" }), "flex items-center gap-0.5 font-normal border rounded-[3px] text-[11px] py-0 h-5", "bg-green-100 text-green-800 border-green-200")}
                    title="予約タブで編集できます"
                  >
                    <span className="flex items-center">
                      <UserCog className="h-2.5 w-2.5 mr-0.5 opacity-70" />
                      {staffName}
                      <span className="text-[11px] ml-0.5 font-bold">(参加)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* 予約者名（貸切の場合のみ表示） */}
          {(formData.category === 'private' || formData.is_private_request) && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">予約者名</Label>
              <div className="flex-1">
                <Input id="reservation_name" value={formData.reservation_name || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, reservation_name: e.target.value }))}
                  placeholder="予約者名（MMQ予約は自動設定）" className="h-7 text-xs" />
              </div>
            </div>
          )}

          {/* 備考 */}
          <div className="flex items-start gap-3">
            <Label className="text-xs text-muted-foreground w-[72px] shrink-0 text-right pt-1.5">備考</Label>
            <div className="flex-1">
              <Textarea id="notes" value={formData.notes}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
                placeholder="備考" rows={2} className="text-xs min-h-[40px] py-1" />
            </div>
          </div>
          </div>{/* /セクション3 */}
        </div>

          {/* アクションボタン削除 */}
            </fieldset>
          </TabsContent>
          
          <TabsContent value="reservations" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
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
              // GM タブで「スタッフ参加」役割を付けたが、まだ DB 予約として未登録の名前
              pendingStaffGmNames={(formData.gms || []).filter(n => (formData.gmRoles?.[n] === 'staff') && !staffParticipantsFromDB.includes(n))}
              onPendingStaffGmRemove={(name) => {
                // 予約者タブから消すと、GM 側からも完全削除 (gms と gmRoles の両方)
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
          </TabsContent>

          <TabsContent value="survey" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <SurveyResponsesTab
              reservationId={event?.reservation_id}
              scenarioId={surveyTabScenarioId}
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
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
          </TabsContent>
        </Tabs>

        {/* フッターアクションボタン */}
        <div
          className="flex items-center justify-end gap-1.5 p-1.5 sm:p-2 border-t shrink-0"
          style={CATEGORY_TONE[formData.category]
            ? { backgroundColor: CATEGORY_TONE[formData.category].bg, borderTopColor: CATEGORY_TONE[formData.category].border }
            : undefined}
        >
          <div className="flex gap-1.5 shrink-0 w-full sm:w-auto justify-end">
            {!readOnly && mode === 'edit' && onDeleteEvent && (
              <Button
                variant="outline"
                onClick={() => setDeleteConfirming(true)}
                className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground mr-auto"
              >
                この予定を削除
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
              {readOnly ? '閉じる' : 'キャンセル'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                {mode === 'add' ? '追加' : '保存'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* シナリオ変更確認ダイアログ（参加者がいる場合） */}
      <Dialog open={pendingScenarioTitle !== null} onOpenChange={(open) => { if (!open) setPendingScenarioTitle(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">シナリオを変更しますか？</DialogTitle>
            <DialogDescription className="text-sm pt-1">
              現在 <span className="font-semibold text-foreground">{localCurrentParticipants}名</span> の予約者がいます。<br />
              シナリオを <span className="font-semibold text-foreground">「{pendingScenarioTitle}」</span> に変更すると、既存の予約情報（参加人数上限など）に影響する可能性があります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="text-sm"
              onClick={() => setPendingScenarioTitle(null)}
            >
              キャンセル
            </Button>
            <Button
              className="text-sm"
              onClick={() => {
                if (pendingScenarioTitle) applyScenarioChange(pendingScenarioTitle)
                setPendingScenarioTitle(null)
              }}
            >
              変更する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 公演削除確認ダイアログ */}
      <Dialog open={deleteConfirming} onOpenChange={setDeleteConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">この予定を削除しますか？</DialogTitle>
            <DialogDescription className="text-sm pt-1">
              削除すると元に戻せません。関連する予約もすべて削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="text-sm" onClick={() => setDeleteConfirming(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              className="text-sm"
              onClick={async () => {
                setDeleteConfirming(false)
                if (event && onDeleteEvent) {
                  await onDeleteEvent(event)
                  onClose()
                }
              }}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
