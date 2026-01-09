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
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
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
  initialData?: { date: string, venue: string, time_slot: string }  // 追加時のみ（DBカラム名に統一）
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

        // 営業時間設定を取得
        const { data: businessHoursData, error: businessHoursError } = await supabase
          .from('business_hours_settings')
          .select('opening_hours, holidays, time_restrictions')
          .eq('store_id', storeId)
          .maybeSingle()

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
      
      console.log('📋 編集イベントデータ:', JSON.stringify({
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
      const startTime = (initialData as any).suggestedStartTime || slotDefaults.start_time
      
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
    console.log('🔍 保存データ:', JSON.stringify({ 
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
    // シナリオリストを更新
    if (onScenariosUpdate) {
      await onScenariosUpdate()
    }
    // 編集中のシナリオIDをリセット
    setEditingScenarioId(null)
  }

  const handleCreateStaff = async (newStaff: StaffType) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      const { id, created_at, updated_at, ...staffForDB } = newStaff as any
      
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
      <DialogContent size="lg" className="max-h-[90vh] sm:max-h-[min(80vh,700px)] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-3 sm:px-6 py-2 sm:py-4 border-b shrink-0">
          <DialogTitle className="text-base sm:text-lg">{modalTitle}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-3 sm:px-6 pt-2 sm:pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="edit" className="text-xs sm:text-sm">公演情報</TabsTrigger>
              <TabsTrigger value="reservations" className="text-xs sm:text-sm">
                予約者
                {event && (
                  <Badge variant="secondary" className="ml-1 sm:ml-2 h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                    {event.is_private_request || event.is_private_booking
                      ? '満席'
                      : `${localCurrentParticipants}/${event.scenarios?.player_count_max || event.max_participants || 8}名`
                    }
                    {staffParticipantsFromDB.length > 0 && (
                      <span className="text-blue-600 ml-1">
                        (+{staffParticipantsFromDB.length}スタッフ)
                      </span>
                    )}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm">更新履歴</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-6 mt-0 min-h-0">
            <div className="space-y-3 sm:space-y-4 pb-4 sm:pb-0">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <Label htmlFor="date">日付</Label>
              <SingleDatePopover
                date={formData.date}
                onDateChange={(date) => {
                  setFormData((prev: any) => ({ ...prev, date: date || '' }))
                }}
                placeholder="日付を選択してください"
              />
            </div>
            <div>
              <Label htmlFor="venue">店舗</Label>
              <Select 
                value={formData.venue} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="店舗を選択">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal" variant="secondary">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal" variant="secondary">
                          {store.name}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
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
                // このシナリオで出勤可能なGMを取得
                const scenarioAvailableGMs = allAvailableStaff.filter(gm => {
                  const specialScenarios = gm.special_scenarios || []
                  return specialScenarios.includes(scenario.id) || specialScenarios.includes(scenario.title)
                })
                
                return {
                  value: scenario.title,
                  label: scenario.title,
                  displayInfo: scenarioAvailableGMs.length > 0 
                    ? (
                        <span className="flex flex-wrap gap-x-1 items-center">
                          {scenarioAvailableGMs.map((gm, index) => (
                            <span key={gm.id}>
                              <span 
                                style={{ color: getStaffTextColor(gm), fontWeight: 500 }}
                              >
                                {gm.name}
                              </span>
                              {index < scenarioAvailableGMs.length - 1 && <span className="text-muted-foreground">,</span>}
                            </span>
                          ))}
                        </span>
                      )
                    : undefined,
                  displayInfoSearchText: scenarioAvailableGMs.map(gm => gm.name).join(', ')
                }
              })}
              placeholder="シナリオを選択"
              searchPlaceholder="シナリオ名で検索..."
              emptyText="シナリオが見つかりません"
              emptyActionLabel="シナリオを作成"
              onEmptyAction={() => setIsScenarioDialogOpen(true)}
            />
            {formData.is_private_request && (
              <p className="text-xs text-purple-600 mt-1">
                ※ 貸切リクエストのシナリオは変更できません
              </p>
            )}
            {/* 未紐付けシナリオの警告表示 */}
            {formData.scenario && !scenarios.find(s => s.title === formData.scenario) && (
              <div className="mt-1 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                <div className="flex items-center gap-1 text-orange-700">
                  <span className="font-semibold">⚠️ 未登録のシナリオ名:</span>
                </div>
                <div className="mt-1 text-orange-600 font-mono break-all">
                  {formData.scenario}
                </div>
                <p className="mt-1 text-orange-500">
                  上のプルダウンからシナリオを選択してください
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
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <Label htmlFor="timeSlot">時間帯</Label>
              <Select 
                value={timeSlot} 
                onValueChange={(value: 'morning' | 'afternoon' | 'evening') => handleTimeSlotChange(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">{timeSlotDefaults.morning.label}</SelectItem>
                  <SelectItem value="afternoon">{timeSlotDefaults.afternoon.label}</SelectItem>
                  <SelectItem value="evening">{timeSlotDefaults.evening.label}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                時間帯を選択すると開始・終了時間が自動設定されます
              </p>
            </div>

            {/* GM管理 */}
            <div>
              <Label htmlFor="gms">GM</Label>
              <MultiSelect
                options={(() => {
                  const options = staff
                    .filter(s => s.status === 'active')
                    .map(staffMember => {
                      // このシナリオの担当GMかチェック
                      const isAssignedGM = formData.scenario && 
                        (staffMember.special_scenarios?.includes(formData.scenario) ||
                         scenarios.find(sc => sc.title === formData.scenario)?.id &&
                         staffMember.special_scenarios?.includes(scenarios.find(sc => sc.title === formData.scenario)!.id))
                      
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
                          <span key="shift" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                            シフト提出済
                          </span>
                        )
                      }
                      if (isAssignedGM) {
                        badges.push(
                          <span key="gm" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            担当GM
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
                placeholder="GMを選択"
                closeOnSelect={false}
                emptyText="GMが見つかりません"
                emptyActionLabel="+ GMを作成"
                onEmptyAction={() => setIsStaffModalOpen(true)}
              />
              {/* GM選択バッジ表示 */}
              {/* メインGM/サブGM: formData.gmsから表示 */}
              {/* スタッフ参加: 予約データから動的表示（DBがシングルソース） */}
              {(formData.gms.length > 0 || staffParticipantsFromDB.length > 0) && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* メインGM/サブGM/スタッフ参加/見学 */}
                  {formData.gms
                    .map((gm: string, index: number) => {
                    const role = formData.gmRoles?.[gm] || 'main'
                    const badgeStyle = role === 'observer'
                      ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200'
                      : role === 'reception'
                        ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200'
                        : role === 'staff'
                          ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200'
                          : role === 'sub' 
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200' 
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200'
                    
                    return (
                      <Popover key={`gm-${index}`}>
                        <PopoverTrigger asChild>
                          <div 
                            className={cn(
                              badgeVariants({ variant: "outline" }),
                              "flex items-center gap-1 font-normal border cursor-pointer rounded-[4px] pr-1",
                              badgeStyle
                            )}
                            role="button"
                          >
                            <span className="flex items-center">
                              <UserCog className="h-3 w-3 mr-1 opacity-70" />
                              {gm}
                              {role === 'sub' && <span className="text-[10px] ml-1 font-bold">(サブ)</span>}
                              {role === 'reception' && <span className="text-[10px] ml-1 font-bold">(受付)</span>}
                              {role === 'staff' && <span className="text-[10px] ml-1 font-bold">(参加)</span>}
                              {role === 'observer' && <span className="text-[10px] ml-1 font-bold">(見学)</span>}
                            </span>
                            <div
                              role="button"
                              className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-black/10 ml-1"
                              onClick={(e) => {
                                e.stopPropagation()
                                const newGms = formData.gms.filter((g: string) => g !== gm)
                                const newRoles = { ...formData.gmRoles }
                                delete newRoles[gm]
                                setFormData((prev: EventFormData) => ({ ...prev, gms: newGms, gmRoles: newRoles }))
                              }}
                            >
                              <X className="h-3 w-3" />
                            </div>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-3" align="start">
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <h4 className="font-medium text-xs text-muted-foreground">役割を選択</h4>
                              <RadioGroup 
                                value={role} 
                                onValueChange={(value) => setFormData((prev: any) => ({
                                  ...prev,
                                  gmRoles: { ...prev.gmRoles, [gm]: value }
                                }))}
                              >
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="main" id={`role-main-${index}`} />
                                  <Label htmlFor={`role-main-${index}`} className="text-sm cursor-pointer">メインGM</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="sub" id={`role-sub-${index}`} />
                                  <Label htmlFor={`role-sub-${index}`} className="text-sm cursor-pointer">サブGM</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="reception" id={`role-reception-${index}`} />
                                  <Label htmlFor={`role-reception-${index}`} className="text-sm cursor-pointer">受付</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="staff" id={`role-staff-${index}`} />
                                  <Label htmlFor={`role-staff-${index}`} className="text-sm cursor-pointer">スタッフ参加</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="observer" id={`role-observer-${index}`} />
                                  <Label htmlFor={`role-observer-${index}`} className="text-sm cursor-pointer">スタッフ見学</Label>
                                </div>
                              </RadioGroup>
                            </div>
                            
                            {role === 'sub' && (
                              <p className="text-[10px] text-blue-600 bg-blue-50 p-1 rounded">
                                ※サブGM給与が適用されます
                              </p>
                            )}
                            {role === 'reception' && (
                              <p className="text-[10px] text-orange-600 bg-orange-50 p-1 rounded">
                                ※受付業務（報酬: 2,000円）
                              </p>
                            )}
                            {role === 'staff' && (
                              <p className="text-[10px] text-green-600 bg-green-50 p-1 rounded">
                                ※スタッフ参加（参加者としてカウント）
                              </p>
                            )}
                            {role === 'observer' && (
                              <p className="text-[10px] text-purple-600 bg-purple-50 p-1 rounded">
                                ※見学のみ（参加者にカウントされない）
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
                        "flex items-center gap-1 font-normal border rounded-[4px]",
                        "bg-green-100 text-green-800 border-green-200"
                      )}
                      title="予約タブで編集できます"
                    >
                      <span className="flex items-center">
                        <UserCog className="h-3 w-3 mr-1 opacity-70" />
                        {staffName}
                        <span className="text-[10px] ml-1 font-bold">(参加)</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select 
                value={formData.start_time?.slice(0, 5)} 
                onValueChange={handleStartTimeChange}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="開始時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.start_time && !formData.is_private_request && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {formData.start_time.slice(0, 5)}
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切リクエストの日時は変更できません
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="end_time">終了時間</Label>
              <Select 
                value={formData.end_time?.slice(0, 5)} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="終了時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.end_time && !formData.is_private_request && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {formData.end_time.slice(0, 5)}
                </p>
              )}
            </div>
          </div>

          {/* カテゴリと参加者数 */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <Label htmlFor="category">公演カテゴリ</Label>
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
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">オープン公演</SelectItem>
                  <SelectItem value="private">貸切公演</SelectItem>
                  <SelectItem value="gmtest">GMテスト</SelectItem>
                  <SelectItem value="testplay">テストプレイ</SelectItem>
                  <SelectItem value="offsite">出張公演</SelectItem>
                  <SelectItem value="venue_rental">場所貸し</SelectItem>
                  <SelectItem value="venue_rental_free">場所貸無料</SelectItem>
                  <SelectItem value="package">パッケージ会</SelectItem>
                  <SelectItem value="mtg">MTG</SelectItem>
                  <SelectItem value="memo">メモに変換</SelectItem>
                </SelectContent>
              </Select>
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切リクエストのため変更できません
                </p>
              )}
            </div>
            
            {/* 場所貸しの場合、公演料金フィールドを表示 */}
            {(formData.category === 'venue_rental' || formData.category === 'venue_rental_free') && (
              <div>
                <Label htmlFor="venue_rental_fee">公演料金</Label>
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
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ※ 未入力の場合は12,000円が適用されます
                </p>
              </div>
            )}
            
            <div>
              <Label htmlFor="max_participants">最大参加者数</Label>
              <Input
                id="max_participants"
                type="number"
                min="1"
                max="20"
                value={formData.max_participants}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
                disabled={formData.is_private_request}
              />
              {formData.scenario && (
                <p className="text-xs text-muted-foreground mt-1">
                  ※ シナリオから自動設定されました
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切公演は最大人数固定です
                </p>
              )}
            </div>
          </div>

          {/* 予約者名（貸切の場合のみ表示） */}
          {(formData.category === 'private' || formData.is_private_request) && (
            <div>
              <Label htmlFor="reservation_name">予約者名</Label>
              <Input
                id="reservation_name"
                value={formData.reservation_name || ''}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, reservation_name: e.target.value }))}
                placeholder="予約者名を入力"
              />
              <p className="text-xs text-muted-foreground mt-1">
                ※ MMQ予約の場合は自動で設定されます
              </p>
            </div>
          )}

          {/* 備考 */}
          <div>
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              placeholder="備考があれば入力してください"
              rows={3}
            />
          </div>
        </div>

          {/* アクションボタン削除 */}
          </TabsContent>
          
          <TabsContent value="reservations" className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-6 mt-0 min-h-0">
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

          <TabsContent value="history" className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-6 mt-0 min-h-0">
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-2 sm:p-4 border-t bg-background shrink-0">
          {/* 左側：シナリオ情報（省スペース表示） */}
          <div className="flex-1 min-w-0 hidden sm:block">
            {formData.scenario && (() => {
              const selectedScenario = scenarios.find(s => s.title === formData.scenario)
              if (selectedScenario) {
                // 参加費を取得
                const getParticipationFee = () => {
                  if (selectedScenario.participation_costs && selectedScenario.participation_costs.length > 0) {
                    const activeCosts = selectedScenario.participation_costs.filter(c => c.status === 'active' || !c.status)
                    if (activeCosts.length === 1) {
                      return `¥${activeCosts[0].amount.toLocaleString()}`
                    } else if (activeCosts.length > 1) {
                      const amounts = activeCosts.map(c => c.amount)
                      const min = Math.min(...amounts)
                      const max = Math.max(...amounts)
                      return min === max ? `¥${min.toLocaleString()}` : `¥${min.toLocaleString()}〜`
                    }
                  }
                  return selectedScenario.participation_fee ? `¥${selectedScenario.participation_fee.toLocaleString()}` : null
                }
                const fee = getParticipationFee()
                
                return (
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium">
                    <span>{selectedScenario.duration}時間</span>
                    <span className="text-muted-foreground">|</span>
                    <span>最大{selectedScenario.player_count_max}名</span>
                    {fee && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span>{fee}</span>
                      </>
                    )}
                  </div>
                )
              }
              return null
            })()}
          </div>
          
          {/* 右側：ボタン */}
          <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={onClose} className="min-w-[80px] sm:min-w-[100px] text-xs sm:text-sm h-8 sm:h-10">
              キャンセル
            </Button>
            <Button onClick={handleSave} className="min-w-[80px] sm:min-w-[100px] text-xs sm:text-sm h-8 sm:h-10">
              {mode === 'add' ? '追加' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* シナリオ編集ダイアログ */}
      <ScenarioEditDialog
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
        scenarios={scenarios as any}
      />
    </Dialog>
  )
}
