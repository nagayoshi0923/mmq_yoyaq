import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { X, ExternalLink, UserCog } from 'lucide-react'
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
import { ReservationList } from './modal/ReservationList'
import { EventHistoryTab } from './modal/EventHistoryTab'
import { getEmptySlotMemo, clearEmptySlotMemo } from './SlotMemoInput'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useOrganization } from '@/hooks/useOrganization'

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
  onParticipantChange
}: PerformanceModalProps) {
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  // 予約データから取得したスタッフ参加者（DBをシングルソースとする）
  const [staffParticipantsFromDB, setStaffParticipantsFromDB] = useState<string[]>([])
  // ローカルで参加者数を管理（リアルタイム表示用）
  const [localCurrentParticipants, setLocalCurrentParticipants] = useState<number>(0)
  const [formData, setFormData] = useState<EventFormData>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    gmRoles: {}, // 初期値
    start_time: '10:00',
    end_time: '14:00',
    category: 'private',
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

  // 営業時間制限（開始時刻・終了時刻）
  const [businessHours, setBusinessHours] = useState<{ openTime: string; closeTime: string } | null>(null)

  // 営業時間に基づいてフィルタリングされた時間選択肢
  const filteredTimeOptions = businessHours
    ? timeOptions.filter(time => time >= businessHours.openTime && time <= businessHours.closeTime)
    : timeOptions

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
    
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      // シナリオIDがない場合は、タイトルから逆引き
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
      // time_slotが存在する場合はそれを使用、なければstart_timeから判定
      let slot: 'morning' | 'afternoon' | 'evening' = 'morning'
      if (event.time_slot) {
        // time_slotが'朝'/'昼'/'夜'形式の場合
        if (event.time_slot === '朝') slot = 'morning'
        else if (event.time_slot === '昼') slot = 'afternoon'
        else if (event.time_slot === '夜') slot = 'evening'
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
        scenario_id: selectedScenario?.id,  // IDを設定
        time_slot: event.time_slot || (slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'), // time_slotを設定
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
      
      // スロットメモを取得（localStorageから）
      const slotMemo = getEmptySlotMemo(initialData.date, initialData.venue, slot)
      
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
        category: 'private',
        max_participants: DEFAULT_MAX_PARTICIPANTS,
        capacity: 0,
        notes: slotMemo,  // スロットメモを備考に引き継ぎ
        reservation_name: ''  // 予約者名（初期値は空）
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, event, initialData, getDefaultsForDate, isTimeSlotSettingsLoading])

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
    const endTime = formData.scenario ? calculateEndTime(startTime, formData.scenario) : startTime
    
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime
    }))
  }

  // 時間帯（morning/afternoon/evening）を'朝'/'昼'/'夜'にマッピング
  const getTimeSlotLabel = (slot: 'morning' | 'afternoon' | 'evening'): string => {
    return slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'
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
      scenario_id: isVenueRental ? undefined : formData.scenario_id, // 場所貸しはシナリオIDもクリア
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
      clearEmptySlotMemo(initialData.date, initialData.venue, timeSlot)
    }
    
    const success = await onSave(saveData)
    // 保存成功時のみダイアログを閉じる
    if (success) {
      onClose()
    }
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="max-h-[85vh] sm:max-h-[min(75vh,480px)] max-w-[480px] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-2 sm:px-4 py-1.5 sm:py-2 border-b shrink-0">
          <DialogTitle className="text-sm sm:text-base">{modalTitle}</DialogTitle>
          <DialogDescription className="text-[11px] sm:text-xs">
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-2 sm:px-4 pt-1.5 sm:pt-2 shrink-0">
            <TabsList className="grid w-full grid-cols-3 h-7 sm:h-8">
              <TabsTrigger value="edit" className="text-[11px] sm:text-xs h-6 sm:h-7">公演情報</TabsTrigger>
              <TabsTrigger value="reservations" className="text-[11px] sm:text-xs h-6 sm:h-7">
                予約者
                {event && (
                  <Badge variant="secondary" className="ml-1 h-3.5 sm:h-4 px-1 text-[11px] sm:text-[11px]">
                    {event.is_private_request || event.is_private_booking
                      ? '満席'
                      : `${localCurrentParticipants}/${event.scenarios?.player_count_max || event.max_participants || 8}名`
                    }
                    {staffParticipantsFromDB.length > 0 && (
                      <span className="text-blue-600 ml-1">
                        （内スタッフ{staffParticipantsFromDB.length}）
                      </span>
                    )}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="text-[11px] sm:text-xs h-6 sm:h-7">更新履歴</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <div className="space-y-2 sm:space-y-2.5 pb-2 sm:pb-0">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="date" className="text-xs">日付</Label>
              <SingleDatePopover
                date={formData.date}
                onDateChange={(date) => {
                  setFormData((prev: any) => ({ ...prev, date: date || '' }))
                }}
                placeholder="日付を選択"
                buttonClassName="h-7 text-xs"
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="venue" className="text-xs">店舗</Label>
              <Select 
                value={formData.venue} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}
              >
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
                      <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[11px] px-1 py-0" variant="secondary">
                        {store.name}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* シナリオ */}
          <div className="space-y-0.5">
            <Label htmlFor="scenario" className="text-xs">シナリオタイトル</Label>
            <SearchableSelect
              value={formData.scenario}
              onValueChange={(scenarioTitle) => {
                const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
                
                if (selectedScenario) {
                  // 準備時間を計算（基本60分 + 追加準備時間）
                  const basePreparationTime = 60
                  const extraPrepTime = selectedScenario.extra_preparation_time || 0
                  const totalPrepTime = basePreparationTime + extraPrepTime
                  
                  // 同じ日・同じ店舗の公演で、現在の開始時間より前に終了する最も遅い公演を探す
                  const currentDate = formData.date || initialData?.date
                  const currentVenue = formData.venue || initialData?.venue
                  const currentStartMinutes = formData.start_time ? 
                    parseInt(formData.start_time.split(':')[0]) * 60 + parseInt(formData.start_time.split(':')[1]) : 0
                  
                  let adjustedStartTime = formData.start_time
                  
                  if (currentDate && currentVenue && events.length > 0) {
                    // 同じ日・同じ店舗の公演を取得し、終了時間でソート
                    const sameDayVenueEvents = events
                      .filter(e => e.date === currentDate && e.venue === currentVenue && !e.is_cancelled)
                      .sort((a, b) => {
                        const aEnd = parseInt(a.end_time.split(':')[0]) * 60 + parseInt(a.end_time.split(':')[1])
                        const bEnd = parseInt(b.end_time.split(':')[0]) * 60 + parseInt(b.end_time.split(':')[1])
                        return bEnd - aEnd // 終了時間が遅い順
                      })
                    
                    // 現在の開始時間より前に終了する直前の公演を探す
                    const previousEvent = sameDayVenueEvents.find(e => {
                      const endMinutes = parseInt(e.end_time.split(':')[0]) * 60 + parseInt(e.end_time.split(':')[1])
                      return endMinutes <= currentStartMinutes
                    })
                    
                    if (previousEvent) {
                      // 前の公演の終了時間 + 準備時間
                      const prevEndMinutes = parseInt(previousEvent.end_time.split(':')[0]) * 60 + parseInt(previousEvent.end_time.split(':')[1])
                      const requiredStartMinutes = prevEndMinutes + totalPrepTime
                      
                      // 現在の開始時間より後なら調整
                      if (requiredStartMinutes > currentStartMinutes) {
                        const hours = Math.floor(requiredStartMinutes / 60)
                        const minutes = requiredStartMinutes % 60
                        adjustedStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                      }
                    }
                  }
                  
                  const endTime = calculateEndTime(adjustedStartTime, scenarioTitle)
                  
                  setFormData((prev: EventFormData) => ({
                    ...prev,
                    scenario: scenarioTitle,
                    scenario_id: selectedScenario.id,  // IDも同時に設定
                    start_time: adjustedStartTime,
                    end_time: endTime,
                    max_participants: selectedScenario.player_count_max
                  }))
                } else {
                  setFormData((prev: EventFormData) => ({
                    ...prev,
                    scenario: scenarioTitle
                  }))
                }
              }}
              options={scenarios.map(scenario => {
                // このシナリオの担当GM全員を取得（special_scenarios は scenario_master_id を格納）
                const isAssignedGM = (gm: StaffType) => {
                  const specialScenarios = gm.special_scenarios || []
                  return specialScenarios.includes(scenario.scenario_master_id || scenario.id) || 
                         specialScenarios.includes(scenario.id) ||
                         specialScenarios.includes(scenario.title)
                }
                
                // 出勤中かどうかをチェック
                const isAvailableGM = (gm: StaffType) => allAvailableStaff.some(a => a.id === gm.id)
                
                // 担当GMを取得
                const scenarioAssignedGMs = staff.filter(gm => gm.status === 'active' && isAssignedGM(gm))
                
                // 出勤中だが担当でないGM（シナリオ習得の可能性あり）
                const availableNonAssignedGMs = allAvailableStaff.filter(gm => 
                  gm.status === 'active' && !isAssignedGM(gm)
                )
                
                // 表示用にマージ：担当GMを先に、次に出勤中の非担当GM
                const displayGMs = [
                  ...scenarioAssignedGMs.map(gm => ({ gm, isAssigned: true, isAvailable: isAvailableGM(gm) })),
                  ...availableNonAssignedGMs.map(gm => ({ gm, isAssigned: false, isAvailable: true }))
                ]
                
                return {
                  value: scenario.title,
                  label: scenario.title,
                  displayInfo: displayGMs.length > 0 
                    ? (
                        <span className="flex flex-wrap gap-x-1 items-center">
                          {displayGMs.map(({ gm, isAssigned, isAvailable }, index) => (
                            <span key={gm.id} className="inline-flex items-center">
                              <span 
                                style={{ 
                                  color: isAssigned ? getStaffTextColor(gm) : '#9CA3AF',
                                  fontWeight: isAssigned ? 500 : 400,
                                  opacity: isAssigned ? 1 : 0.8
                                }}
                              >
                                {gm.name}
                              </span>
                              {isAvailable && (
                                <span className="text-green-600 text-[10px] ml-0.5" title="シフト済">✓</span>
                              )}
                              {index < displayGMs.length - 1 && <span className="text-muted-foreground">,</span>}
                            </span>
                          ))}
                        </span>
                      )
                    : undefined,
                  displayInfoSearchText: displayGMs.map(({ gm }) => gm.name).join(', ')
                }
              })}
              placeholder="シナリオ"
              searchPlaceholder="検索..."
              emptyText="シナリオが見つかりません"
              emptyActionLabel="シナリオを作成"
              onEmptyAction={() => setIsScenarioDialogOpen(true)}
              className="h-7 text-xs"
            />
            {formData.is_private_request && (
              <p className="text-[11px] text-purple-600 mt-0.5">
                ※ 貸切のシナリオ変更不可
              </p>
            )}
            {/* 未紐付けシナリオの警告表示 */}
            {formData.scenario && !scenarios.find(s => s.title === formData.scenario) && (
              <div className="mt-0.5 p-1.5 bg-orange-50 border border-orange-200 rounded text-[11px]">
                <div className="flex items-center gap-1 text-orange-700">
                  <span className="font-semibold">⚠️ 未登録:</span>
                  <span className="font-mono break-all">{formData.scenario}</span>
                </div>
                <p className="mt-0.5 text-orange-500">
                  プルダウンから選択してください
                </p>
              </div>
            )}
            {/* シナリオ編集へのリンク */}
            {formData.scenario && (() => {
              const selectedScenario = scenarios.find(s => s.title === formData.scenario)
              if (selectedScenario) {
                return (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => {
                      setEditingScenarioId(selectedScenario.id)
                      setIsScenarioDialogOpen(true)
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    シナリオを編集
                  </Button>
                )
              }
              return null
            })()}
          </div>

          {/* 時間帯選択とGM選択 */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="timeSlot" className="text-xs">時間帯</Label>
              <Select 
                value={timeSlot} 
                onValueChange={(value: 'morning' | 'afternoon' | 'evening') => handleTimeSlotChange(value)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning" className="text-xs py-1">{timeSlotDefaults.morning.label}</SelectItem>
                  <SelectItem value="afternoon" className="text-xs py-1">{timeSlotDefaults.afternoon.label}</SelectItem>
                  <SelectItem value="evening" className="text-xs py-1">{timeSlotDefaults.evening.label}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                時間帯で開始・終了時間を自動設定
              </p>
            </div>

            {/* GM管理 */}
            <div className="space-y-0.5">
              <Label htmlFor="gms" className="text-xs">GM</Label>
              <MultiSelect
                options={(() => {
                  const options = staff
                    .filter(s => s.status === 'active')
                    .map(staffMember => {
                      // このシナリオの担当GMかチェック（special_scenarios は scenario_master_id を格納）
                      const matchedScenario = formData.scenario ? scenarios.find(sc => sc.title === formData.scenario) : null
                      const isAssignedGM = formData.scenario && matchedScenario && 
                        (staffMember.special_scenarios?.includes(matchedScenario.scenario_master_id || matchedScenario.id) ||
                         staffMember.special_scenarios?.includes(matchedScenario.id))
                      
                      // 出勤可能かチェック（シフト提出済み）
                      // シナリオが選択されている場合: そのシナリオで出勤可能か
                      // シナリオ未選択の場合: その日時に出勤しているか
                      let isAvailable = false
                      if (formData.scenario) {
                        const availableGMs = availableStaffByScenario?.[formData.scenario] || []
                        isAvailable = availableGMs.some(gm => gm.id === staffMember.id)
                      } else {
                        // シナリオ未選択時は、その日時に出勤している全GMから判定
                        isAvailable = allAvailableStaff.some(gm => gm.id === staffMember.id)
                      }
                      
                      // バッジ形式で表示情報を構築
                      const badges: React.ReactNode[] = []
                      if (isAvailable) {
                        badges.push(
                          <span key="shift" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">
                            シフト済
                          </span>
                        )
                      }
                      if (isAssignedGM) {
                        badges.push(
                          <span key="gm" className="inline-flex items-center px-1 py-0 rounded text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            担当
                          </span>
                        )
                      }
                      
                      // 検索用テキスト
                      const searchText = [
                        isAvailable ? 'シフト提出済' : '',
                        isAssignedGM ? '担当GM' : ''
                      ].filter(Boolean).join(' ')
                      
                      return {
                        id: staffMember.id,
                        name: staffMember.name,
                        displayInfo: badges.length > 0 ? (
                          <span className="flex gap-1">{badges}</span>
                        ) : undefined,
                        displayInfoSearchText: searchText || undefined,
                        sortOrder: isAvailable ? 0 : isAssignedGM ? 1 : 2
                      }
                    })
                    .sort((a, b) => {
                      // sortOrderで優先順位を決定（シフト提出済みを上に）
                      if (a.sortOrder !== b.sortOrder) {
                        return a.sortOrder - b.sortOrder
                      }
                      // 同じ優先順位の場合は名前順
                      return a.name.localeCompare(b.name, 'ja')
                    })
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
              {/* GM選択バッジ表示 */}
              {/* メインGM/サブGM: formData.gmsから表示 */}
              {/* スタッフ参加: 予約データから動的表示（DBがシングルソース） */}
              {(formData.gms.length > 0 || staffParticipantsFromDB.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {/* メインGM/サブGM/スタッフ参加/見学 */}
                  {formData.gms
                    .map((gm: string, index: number) => {
                    const role = formData.gmRoles?.[gm] || 'main'
                    const isBackedByStaffReservation =
                      role === 'staff' && staffParticipantsFromDB.includes(gm)

                    const badgeStyle = role === 'observer'
                      ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-200'
                      : role === 'reception'
                        ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200'
                        : role === 'staff'
                          ? (isBackedByStaffReservation
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200'
                              : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200')
                          : role === 'sub' 
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200' 
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200'
                    
                    return (
                      <Popover key={`gm-${index}`}>
                        <PopoverTrigger asChild>
                          <div 
                            className={cn(
                              badgeVariants({ variant: "outline" }),
                              "flex items-center gap-0.5 font-normal border cursor-pointer rounded-[3px] pr-0.5 text-[11px] py-0 h-5",
                              badgeStyle
                            )}
                            role="button"
                          >
                            <span className="flex items-center">
                              <UserCog className="h-2.5 w-2.5 mr-0.5 opacity-70" />
                              {gm}
                              {role === 'sub' && <span className="text-[11px] ml-0.5 font-bold">(サブ)</span>}
                              {role === 'reception' && <span className="text-[11px] ml-0.5 font-bold">(受付)</span>}
                              {role === 'staff' && (
                                <span className="text-[11px] ml-0.5 font-bold">
                                  {isBackedByStaffReservation ? '(参加)' : '(参加予定)'}
                                </span>
                              )}
                              {role === 'observer' && <span className="text-[11px] ml-0.5 font-bold">(見学)</span>}
                            </span>
                            <div
                              role="button"
                              className="h-3 w-3 flex items-center justify-center rounded-full hover:bg-black/10 ml-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
                                const newGms = formData.gms.filter((g: string) => g !== gm)
                                const newRoles = { ...formData.gmRoles }
                                delete newRoles[gm]
                                setFormData((prev: EventFormData) => ({ ...prev, gms: newGms, gmRoles: newRoles }))
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
                                onValueChange={(value) => setFormData((prev: any) => ({
                                  ...prev,
                                  gmRoles: { ...prev.gmRoles, [gm]: value }
                                }))}
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
                            
                            {role === 'sub' && (
                              <p className="text-[11px] text-blue-600 bg-blue-50 p-0.5 rounded">
                                ※サブGM給与適用
                              </p>
                            )}
                            {role === 'reception' && (
                              <p className="text-[11px] text-orange-600 bg-orange-50 p-0.5 rounded">
                                ※受付（2,000円）
                              </p>
                            )}
                            {role === 'staff' && (
                              <p
                                className={cn(
                                  'text-[11px] p-0.5 rounded',
                                  isBackedByStaffReservation
                                    ? 'text-green-600 bg-green-50'
                                    : 'text-yellow-700 bg-yellow-50'
                                )}
                              >
                                {isBackedByStaffReservation
                                  ? '※ 予約タブ（スタッフ予約）に紐づく参加'
                                  : '※ GM欄で「スタッフ参加」として設定されているだけ（予約タブに実体がない）'}
                              </p>
                            )}
                            {role === 'observer' && (
                              <p className="text-[11px] text-indigo-600 bg-indigo-50 p-0.5 rounded">
                                ※見学のみ
                              </p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )
                  })}
                  
                  {/* スタッフ参加者（予約データから動的表示・読み取り専用） */}
                  {/* GM欄でスタッフ参加として設定されているスタッフは除外（重複防止） */}
                  {staffParticipantsFromDB
                    .filter((staffName: string) => !formData.gms.includes(staffName) || formData.gmRoles?.[staffName] !== 'staff')
                    .map((staffName: string, index: number) => (
                    <div 
                      key={`staff-${index}`}
                      className={cn(
                        badgeVariants({ variant: "outline" }),
                        "flex items-center gap-0.5 font-normal border rounded-[3px] text-[11px] py-0 h-5",
                        "bg-green-100 text-green-800 border-green-200"
                      )}
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

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="start_time" className="text-xs">開始時間</Label>
              <Select 
                value={formData.start_time?.slice(0, 5)} 
                onValueChange={handleStartTimeChange}
                disabled={formData.is_private_request}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="開始時間" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.start_time && !formData.is_private_request && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  現在: {formData.start_time.slice(0, 5)}
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-[11px] text-purple-600 mt-0.5">
                  ※ 貸切の日時変更不可
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="end_time" className="text-xs">終了時間</Label>
              <Select 
                value={formData.end_time?.slice(0, 5)} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
                disabled={formData.is_private_request}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="終了時間" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time} className="text-xs py-1">{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.end_time && !formData.is_private_request && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  現在: {formData.end_time.slice(0, 5)}
                </p>
              )}
            </div>
          </div>

          {/* カテゴリと参加者数 */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="category" className="text-xs">公演カテゴリ</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: string) => {
                  // カテゴリ変更時もシナリオを維持
                  setFormData((prev: EventFormData) => ({ 
                    ...prev, 
                    category: value,
                    // 既存のシナリオ選択を明示的に保持
                    scenario: prev.scenario,
                    gms: prev.gms,
                    gmRoles: prev.gmRoles
                  }))
                }}
                disabled={formData.is_private_request}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="カテゴリ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open" className="text-xs py-1">オープン公演</SelectItem>
                  <SelectItem value="private" className="text-xs py-1">貸切公演</SelectItem>
                  <SelectItem value="gmtest" className="text-xs py-1">GMテスト</SelectItem>
                  <SelectItem value="testplay" className="text-xs py-1">テストプレイ</SelectItem>
                  <SelectItem value="offsite" className="text-xs py-1">出張公演</SelectItem>
                  <SelectItem value="venue_rental" className="text-xs py-1">場所貸し</SelectItem>
                  <SelectItem value="venue_rental_free" className="text-xs py-1">場所貸無料</SelectItem>
                  <SelectItem value="package" className="text-xs py-1">パッケージ会</SelectItem>
                  <SelectItem value="mtg" className="text-xs py-1">MTG</SelectItem>
                  <SelectItem value="memo" className="text-xs py-1">メモに変換</SelectItem>
                </SelectContent>
              </Select>
              {formData.is_private_request && (
                <p className="text-[11px] text-purple-600 mt-0.5">
                  ※ 貸切のため変更不可
                </p>
              )}
            </div>
            
            {/* 場所貸しの場合、公演料金フィールドを表示 */}
            {(formData.category === 'venue_rental' || formData.category === 'venue_rental_free') && (
              <div className="space-y-0.5">
                <Label htmlFor="venue_rental_fee" className="text-xs">公演料金</Label>
                <Input
                  id="venue_rental_fee"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="12000"
                  value={formData.venue_rental_fee ?? ''}
                  onChange={(e) => setFormData((prev: any) => ({ 
                    ...prev, 
                    venue_rental_fee: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                  className="h-7 text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  ※ 未入力時は12,000円
                </p>
              </div>
            )}
            
            <div className="space-y-0.5">
              <Label htmlFor="max_participants" className="text-xs">最大参加者数</Label>
              <Input
                id="max_participants"
                type="number"
                min="1"
                max="20"
                value={formData.max_participants}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
                disabled={formData.is_private_request}
                className="h-7 text-xs"
              />
              {formData.scenario && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  ※ シナリオから自動設定
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-[11px] text-purple-600 mt-0.5">
                  ※ 貸切は固定
                </p>
              )}
            </div>
          </div>

          {/* 予約者名（貸切の場合のみ表示） */}
          {(formData.category === 'private' || formData.is_private_request) && (
            <div className="space-y-0.5">
              <Label htmlFor="reservation_name" className="text-xs">予約者名</Label>
              <Input
                id="reservation_name"
                value={formData.reservation_name || ''}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, reservation_name: e.target.value }))}
                placeholder="予約者名"
                className="h-7 text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">
                ※ MMQ予約は自動設定
              </p>
            </div>
          )}

          {/* 備考 */}
          <div className="space-y-0.5">
            <Label htmlFor="notes" className="text-xs">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              placeholder="備考"
              rows={2}
              className="text-xs min-h-[40px] py-1"
            />
          </div>
        </div>

          {/* アクションボタン削除 */}
          </TabsContent>
          
          <TabsContent value="reservations" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <ReservationList
              event={event || null}
              currentEventData={formData}
              mode={mode}
              stores={stores}
              scenarios={scenarios}
              staff={staff}
              onParticipantChange={(eventId, newCount) => {
                setLocalCurrentParticipants(newCount)
                onParticipantChange?.(eventId, newCount)
              }}
              onGmsChange={(gms, gmRoles) => setFormData(prev => ({ ...prev, gms, gmRoles }))}
              onStaffParticipantsChange={setStaffParticipantsFromDB}
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <EventHistoryTab 
              eventId={event?.id} 
              cellInfo={formData.date && formData.venue ? {
                date: formData.date,
                storeId: formData.venue,
                timeSlot: formData.time_slot || (timeSlot === 'morning' ? '朝' : timeSlot === 'afternoon' ? '昼' : '夜')
              } : undefined}
              organizationId={organizationId || undefined}
            />
          </TabsContent>
        </Tabs>

        {/* フッターアクションボタン */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 p-1.5 sm:p-2 border-t bg-background shrink-0">
          {/* 左側：シナリオ情報（省スペース表示） */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {(() => {
              const category = formData.category
              
              // シナリオの通常参加費（1名あたり）を取得するヘルパー
              const getNormalFeeAmount = (scenario: Scenario): number | null => {
                if (scenario.participation_costs && scenario.participation_costs.length > 0) {
                  const normalCosts = scenario.participation_costs.filter(
                    c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
                  )
                  if (normalCosts.length >= 1) {
                    return normalCosts[0].amount
                  }
                }
                return scenario.participation_fee || null
              }

              // カテゴリに準じた料金を取得
              const getCategoryFee = (): { label: string; fee: string } | null => {
                // MTG・メモは料金表示なし
                if (category === 'mtg' || category === 'memo') return null
                
                // 場所貸し：formData の venue_rental_fee を使用
                if (category === 'venue_rental') {
                  const fee = formData.venue_rental_fee ?? 12000
                  return { label: '場所貸し', fee: `¥${fee.toLocaleString()}` }
                }
                
                // 場所貸無料
                if (category === 'venue_rental_free') {
                  return { label: '場所貸し', fee: '¥0' }
                }
                
                // テストプレイ：無料
                if (category === 'testplay') {
                  return { label: 'テストプレイ', fee: '¥0' }
                }
                
                // シナリオが選択されていない場合はここで終了
                const selectedScenario = scenarios.find(s => s.title === formData.scenario)
                if (!formData.scenario || !selectedScenario) return null
                
                // GMテスト：GMテスト用料金を使用
                if (category === 'gmtest') {
                  if (selectedScenario.participation_costs && selectedScenario.participation_costs.length > 0) {
                    const gmtestCost = selectedScenario.participation_costs.find(
                      c => c.time_slot === 'gmtest' && (c.status === 'active' || !c.status)
                    )
                    if (gmtestCost) {
                      return { label: 'GMテスト', fee: `¥${gmtestCost.amount.toLocaleString()}` }
                    }
                  }
                  if (selectedScenario.gm_test_participation_fee) {
                    return { label: 'GMテスト', fee: `¥${selectedScenario.gm_test_participation_fee.toLocaleString()}` }
                  }
                  return { label: 'GMテスト', fee: '¥0' }
                }
                
                // 貸切公演：1名あたり × 最大人数 = 合計金額
                if (category === 'private') {
                  const perPerson = getNormalFeeAmount(selectedScenario)
                  if (perPerson) {
                    const maxP = selectedScenario.player_count_max || formData.max_participants || 1
                    const total = perPerson * maxP
                    return { label: '貸切', fee: `¥${perPerson.toLocaleString()}×${maxP}名=¥${total.toLocaleString()}` }
                  }
                  return null
                }
                
                // open, offsite, package, その他：通常料金（1名あたり）
                if (selectedScenario.participation_costs && selectedScenario.participation_costs.length > 0) {
                  const normalCosts = selectedScenario.participation_costs.filter(
                    c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
                  )
                  if (normalCosts.length === 1) {
                    return { label: '', fee: `¥${normalCosts[0].amount.toLocaleString()}` }
                  } else if (normalCosts.length > 1) {
                    const amounts = normalCosts.map(c => c.amount)
                    const min = Math.min(...amounts)
                    const max = Math.max(...amounts)
                    const feeStr = min === max ? `¥${min.toLocaleString()}` : `¥${min.toLocaleString()}〜`
                    return { label: '', fee: feeStr }
                  }
                }
                if (selectedScenario.participation_fee) {
                  return { label: '', fee: `¥${selectedScenario.participation_fee.toLocaleString()}` }
                }
                return null
              }
              
              const selectedScenario = formData.scenario ? scenarios.find(s => s.title === formData.scenario) : null
              const categoryFee = getCategoryFee()
              
              // シナリオ情報がある場合はシナリオ情報＋料金を表示
              if (selectedScenario) {
                return (
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium">
                    <span>{selectedScenario.duration}h</span>
                    <span className="text-muted-foreground">|</span>
                    <span>最大{selectedScenario.player_count_max}名</span>
                    {categoryFee && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span>{categoryFee.label ? `${categoryFee.label} ` : ''}{categoryFee.fee}</span>
                      </>
                    )}
                  </div>
                )
              }
              
              // シナリオなしでも料金表示があるカテゴリ（場所貸しなど）
              if (categoryFee) {
                return (
                  <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium">
                    <span>{categoryFee.label ? `${categoryFee.label} ` : ''}{categoryFee.fee}</span>
                  </div>
                )
              }
              
              return null
            })()}
          </div>
          
          {/* 右側：ボタン */}
          <div className="flex gap-1.5 shrink-0 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={onClose} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
              キャンセル
            </Button>
            <Button onClick={handleSave} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
              {mode === 'add' ? '追加' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>

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
