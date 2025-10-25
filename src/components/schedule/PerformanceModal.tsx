import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { X, ChevronDown, ChevronUp, Mail, ExternalLink } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { ScenarioEditModal } from '@/components/modals/ScenarioEditModal'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { scenarioApi, staffApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { sendEmail } from '@/lib/emailApi'
import { supabase } from '@/lib/supabase'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { Staff as StaffType, Scenario, Store, Reservation } from '@/types'
import { logger } from '@/utils/logger'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
  reservation_info?: string
}


interface EventFormData {
  date: string
  venue: string
  scenario: string
  scenario_id?: string
  category: string
  start_time: string
  end_time: string
  max_participants: number
  capacity: number
  gms: string[]
  notes?: string
  id?: string
  is_private_request?: boolean
  reservation_id?: string
}

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => void
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, timeSlot: string }  // 追加時のみ
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
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
  availableStaffByScenario = {},
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange
}: PerformanceModalProps) {
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite' as 'onsite' | 'online',
    notes: ''
  })
  const [customerNames, setCustomerNames] = useState<string[]>([])
  const [formData, setFormData] = useState<any>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    start_time: '10:00',
    end_time: '14:00',
    category: 'private',
    participant_count: 0,
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    notes: ''
  })

  // 時間帯のデフォルト設定（設定から動的に取得）
  const [timeSlotDefaults, setTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 時間帯が変更されたときに開始・終了時間を自動設定
  const handleTimeSlotChange = (slot: 'morning' | 'afternoon' | 'evening') => {
    setTimeSlot(slot)
    const defaults = timeSlotDefaults[slot]
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: defaults.start_time,
      end_time: defaults.end_time
    }))
  }

  // 公演スケジュール設定と営業時間設定を読み込む
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storeId = formData.venue || stores[0]?.id
        if (!storeId) return

        // 公演スケジュール設定を取得
        const { data: performanceData, error: performanceError } = await supabase
          .from('performance_schedule_settings')
          .select('performance_times, default_duration')
          .eq('store_id', storeId)
          .maybeSingle()

        if (performanceError && performanceError.code !== 'PGRST116') {
          logger.error('公演スケジュール設定取得エラー:', performanceError)
        }

        // 営業時間設定を取得
        const { data: businessHoursData, error: businessHoursError } = await supabase
          .from('business_hours_settings')
          .select('opening_hours, holidays, time_restrictions')
          .eq('store_id', storeId)
          .maybeSingle()

        if (businessHoursError && businessHoursError.code !== 'PGRST116') {
          logger.error('営業時間設定取得エラー:', businessHoursError)
        }

        // 公演スケジュール設定の適用
        if (performanceData?.performance_times) {
          const newDefaults = {
            morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
            afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
            evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
          }

          // 設定された時間に基づいて更新
          performanceData.performance_times.forEach((time: any, index: number) => {
            const slotKey = time.slot as keyof typeof newDefaults
            if (slotKey && newDefaults[slotKey]) {
              const duration = performanceData.default_duration || 240 // デフォルト4時間
              const startTime = time.start_time
              const endTime = new Date(`2000-01-01T${startTime}`)
              endTime.setMinutes(endTime.getMinutes() + duration)
              const endTimeStr = endTime.toTimeString().slice(0, 5)
              
              newDefaults[slotKey] = {
                start_time: startTime,
                end_time: endTimeStr,
                label: newDefaults[slotKey].label
              }
            }
          })

          setTimeSlotDefaults(newDefaults)
        }

        // 営業時間制限の適用（時間選択肢の制限）
        if (businessHoursData?.opening_hours) {
          // TODO: 営業時間制限を時間選択肢に適用
          logger.log('営業時間設定を読み込みました:', businessHoursData)
        }

      } catch (error) {
        logger.error('設定読み込みエラー:', error)
      }
    }

    if (formData.venue || stores.length > 0) {
      loadSettings()
    }
  }, [formData.venue, stores])

  // 予約データを読み込む
  useEffect(() => {
    const loadReservations = async () => {
      if (mode === 'edit' && event?.id) {
        setLoadingReservations(true)
        try {
          const data = await reservationApi.getByScheduleEvent(event.id)
          setReservations(data)
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
          setReservations([])
        } finally {
          setLoadingReservations(false)
        }
      } else {
        setReservations([])
      }
    }
    
    loadReservations()
  }, [mode, event?.id])

  // 予約ステータスを更新する関数
  const handleUpdateReservationStatus = async (reservationId: string, newStatus: string) => {
    try {
      // 変更前のステータスを取得
      const reservation = reservations.find(r => r.id === reservationId)
      if (!reservation) return
      
      const oldStatus = reservation.status
      
      await reservationApi.update(reservationId, { status: newStatus })
      
      // ローカルステートを更新
      setReservations(prev => 
        prev.map(r => r.id === reservationId ? { ...r, status: newStatus } : r)
      )
      
      // schedule_eventsのcurrent_participantsを更新
      // confirmed/pending → cancelled: 参加者数を減らす
      // cancelled → confirmed/pending: 参加者数を増やす
      if (event?.id) {
        const wasActive = oldStatus === 'confirmed' || oldStatus === 'pending'
        const isActive = newStatus === 'confirmed' || newStatus === 'pending'
        
        if (wasActive !== isActive) {
          try {
            const { data: eventData } = await supabase
              .from('schedule_events')
              .select('current_participants')
              .eq('id', event.id)
              .single()
            
            const currentCount = eventData?.current_participants || 0
            const change = isActive ? reservation.participant_count : -reservation.participant_count
            const newCount = Math.max(0, currentCount + change)
            
            await supabase
              .from('schedule_events')
              .update({ current_participants: newCount })
              .eq('id', event.id)
            
            logger.log('公演参加者数を更新:', { 
              eventId: event.id, 
              oldCount: currentCount, 
              newCount,
              change,
              reason: `${oldStatus} → ${newStatus}`
            })
            
            // 親コンポーネントに参加者数変更を通知
            if (onParticipantChange) {
              onParticipantChange(event.id, newCount)
            }
          } catch (error) {
            logger.error('公演参加者数の更新に失敗:', error)
          }
        }
      }
      
      logger.log('予約ステータス更新成功:', { id: reservationId, oldStatus, newStatus })
    } catch (error) {
      logger.error('予約ステータス更新エラー:', error)
      alert('ステータスの更新に失敗しました')
    }
  }

  // 顧客名を取得する関数
  const fetchCustomerNames = async () => {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('customer_notes, participant_names')
        .not('customer_notes', 'is', null)
        .not('customer_notes', 'eq', '')
      
      if (error) throw error
      
      const names = new Set<string>()
      
      // customer_notesから名前を抽出
      data?.forEach(reservation => {
        if (reservation.customer_notes) {
          // 「様」を除去して名前を抽出
          const name = reservation.customer_notes.replace(/様$/, '').trim()
          if (name) names.add(name)
        }
        
        // participant_namesからも名前を抽出
        if (reservation.participant_names && Array.isArray(reservation.participant_names)) {
          reservation.participant_names.forEach(name => {
            if (name && name.trim()) names.add(name.trim())
          })
        }
      })
      
      setCustomerNames(Array.from(names).sort())
    } catch (error) {
      console.error('顧客名の取得に失敗:', error)
    }
  }

  // モーダルが開かれた時に顧客名を取得
  useEffect(() => {
    if (isOpen) {
      fetchCustomerNames()
    }
  }, [isOpen])

  // 参加者を追加する関数
  const handleAddParticipant = async () => {
    if (!newParticipant.customer_name.trim()) {
      alert('参加者名を入力してください')
      return
    }

    if (!event?.id) {
      alert('公演情報が不正です')
      return
    }

    try {
      // シナリオと店舗のIDを取得
      const scenarioObj = scenarios.find(s => s.title === formData.scenario)
      const storeObj = stores.find(s => s.id === formData.venue)
      
      const reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'> = {
        schedule_event_id: event.id,
        title: formData.scenario || '',
        scenario_id: scenarioObj?.id || null,
        store_id: storeObj?.id || null,
        customer_id: null, // 匿名参加者として扱う（NULLを許可）
        customer_notes: newParticipant.customer_name,
        requested_datetime: `${formData.date}T${formData.start_time}+09:00`,
        duration: scenarioObj?.duration || 120,
        participant_count: newParticipant.participant_count,
        participant_names: [newParticipant.customer_name],
        assigned_staff: formData.gms || [],
        base_price: 0,
        options_price: 0,
        total_price: 0,
        discount_amount: 0,
        final_price: 0,
        payment_method: newParticipant.payment_method,
        payment_status: newParticipant.payment_method === 'online' ? 'paid' : 'pending',
        status: 'confirmed',
        reservation_source: 'admin'
      }

      const createdReservation = await reservationApi.create(reservation)
      logger.log('参加者追加成功:', createdReservation)
      
      // schedule_eventsのcurrent_participantsを更新
      if (event.id) {
        try {
          // 現在の参加者数を計算
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('current_participants')
            .eq('id', event.id)
            .single()
          
          const currentCount = eventData?.current_participants || 0
          const newCount = currentCount + newParticipant.participant_count
          
          // 更新
          await supabase
            .from('schedule_events')
            .update({ current_participants: newCount })
            .eq('id', event.id)
          
          logger.log('公演参加者数を更新:', { eventId: event.id, oldCount: currentCount, newCount })
          
          // 親コンポーネントに参加者数変更を通知
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('公演参加者数の更新に失敗:', error)
        }
      }
      
      // 楽観的更新: 作成した予約を即座にリストに追加
      if (createdReservation) {
        setReservations(prev => [...prev, createdReservation])
        logger.log('予約リストに追加しました:', createdReservation)
      }
      
      // さらに念のため、サーバーから最新データを再取得
      if (event.id) {
        try {
          const data = await reservationApi.getByScheduleEvent(event.id)
          logger.log('予約リスト再読み込み:', data)
          setReservations(data)
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
        }
      }
      
      // フォームをリセット
      setNewParticipant({
        customer_name: '',
        participant_count: 1,
        payment_method: 'onsite',
        notes: ''
      })
      setIsAddingParticipant(false)
      
      alert('参加者を追加しました')
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      alert('参加者の追加に失敗しました')
    }
  }

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      setFormData(event)
      // 既存の開始時間から時間帯を判定
      const startHour = parseInt(event.start_time.split(':')[0])
      if (startHour < 12) {
        setTimeSlot('morning')
      } else if (startHour < 17) {
        setTimeSlot('afternoon')
      } else {
        setTimeSlot('evening')
      }
    } else if (mode === 'add' && initialData) {
      // 追加モード：初期データで初期化
      const slot = initialData.timeSlot as 'morning' | 'afternoon' | 'evening'
      setTimeSlot(slot)
      
      const defaults = timeSlotDefaults[slot] || timeSlotDefaults.morning
      
      setFormData({
        id: Date.now().toString(),
        date: initialData.date,
        venue: initialData.venue,
        scenario: '',
        gms: [],
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        category: 'private',
        participant_count: 0,
        max_participants: DEFAULT_MAX_PARTICIPANTS,
        notes: ''
      })
    }
  }, [mode, event, initialData])

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
  const handleStartTimeChange = (startTime: string) => {
    const endTime = formData.scenario ? calculateEndTime(startTime, formData.scenario) : startTime
    
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime
    }))
  }

  const handleSave = () => {
    onSave(formData)
    onClose()
  }

  const handleCreateScenario = async (newScenario: Scenario) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      const { 
        id, 
        created_at, 
        updated_at, 
        production_costs, 
        available_gms, 
        play_count, 
        required_props,
        flexible_pricing,
        ...scenarioForDB 
      } = newScenario as any
      
      logger.log('シナリオ作成リクエスト:', scenarioForDB)
      const createdScenario = await scenarioApi.create(scenarioForDB)
      logger.log('シナリオ作成成功:', createdScenario)
      setIsScenarioModalOpen(false)
      // 親コンポーネントにシナリオリストの更新を通知
      if (onScenariosUpdate) {
        await onScenariosUpdate()
      }
      // 新しく作成したシナリオを選択
      setFormData((prev: EventFormData) => ({ ...prev, scenario: newScenario.title }))
    } catch (error: unknown) {
      logger.error('シナリオ作成エラー:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      alert(`シナリオの作成に失敗しました: ${message}`)
    }
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
        gms: [...prev.gms, newStaff.name] 
      }))
    } catch (error: unknown) {
      logger.error('スタッフ作成エラー:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      alert(`スタッフの作成に失敗しました: ${message}`)
    }
  }



  // 店舗名を取得
  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    return store ? store.name : storeId
  }

  // 店舗カラーを取得
  const getStoreColor = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    const storeColors: { [key: string]: string } = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      purple: 'bg-purple-100 text-purple-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
      amber: 'bg-amber-100 text-amber-800'
    }
    return store ? storeColors[store.color] || 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'
  }

  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" className="overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">公演情報</TabsTrigger>
            <TabsTrigger value="reservations">予約者</TabsTrigger>
          </TabsList>
          
          <TabsContent value="edit" className="mt-4 overflow-y-auto flex-1">
            <div className="space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))}
              />
              {mode === 'edit' && formData.date && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {new Date(formData.date + 'T00:00:00').toLocaleDateString('ja-JP', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    weekday: 'short'
                  })}
                </p>
              )}
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
                      <Badge className={getStoreColor(formData.venue)} variant="static">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      <div className="flex items-center gap-2">
                        <Badge className={getStoreColor(store.id)} variant="static">
                          {store.name}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 時間帯選択 */}
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

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select 
                value={formData.start_time} 
                onValueChange={handleStartTimeChange}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="開始時間を選択">
                    {formData.start_time ? formData.start_time.slice(0, 5) : "開始時間を選択"}
                  </SelectValue>
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
                value={formData.end_time} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="終了時間を選択">
                    {formData.end_time ? formData.end_time.slice(0, 5) : "終了時間を選択"}
                  </SelectValue>
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
          <div className="grid grid-cols-2 gap-4">
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
                    gms: prev.gms
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
                </SelectContent>
              </Select>
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切リクエストのため変更できません
                </p>
              )}
            </div>
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

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
            <Select
              value={formData.scenario}
              onValueChange={(scenarioTitle) => {
                const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
                
                if (selectedScenario) {
                  const endTime = calculateEndTime(formData.start_time, scenarioTitle)
                  
                  setFormData((prev: EventFormData) => ({
                    ...prev,
                    scenario: scenarioTitle,
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
            >
              <SelectTrigger>
                <SelectValue placeholder="シナリオを選択" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map(scenario => (
                  <SelectItem key={scenario.id} value={scenario.title}>
                    {scenario.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.is_private_request && (
              <p className="text-xs text-purple-600 mt-1">
                ※ 貸切リクエストのシナリオは変更できません
              </p>
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
                    onClick={() => window.location.hash = `scenarios/edit/${selectedScenario.id}`}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    シナリオを編集
                  </Button>
                )
              }
              return null
            })()}
          </div>

          {/* GM管理 */}
          <div>
            <Label htmlFor="gms">GM</Label>
            <MultiSelect
              options={staff
                .filter(s => s.status === 'active')
                .map(staffMember => {
                  // このシナリオの担当GMかチェック
                  const isAssignedGM = formData.scenario && 
                    (staffMember.special_scenarios?.includes(formData.scenario) ||
                     scenarios.find(sc => sc.title === formData.scenario)?.id &&
                     staffMember.special_scenarios?.includes(scenarios.find(sc => sc.title === formData.scenario)!.id))
                  
                  return {
                    id: staffMember.id,
                    name: staffMember.name,
                    displayInfo: isAssignedGM ? '担当GM' : undefined,
                    isAssignedGM
                  }
                })
                .sort((a, b) => {
                  // 担当GMを上に表示
                  if (a.isAssignedGM && !b.isAssignedGM) return -1
                  if (!a.isAssignedGM && b.isAssignedGM) return 1
                  // 両方とも担当GMまたは両方とも非担当GMの場合は名前順
                  return a.name.localeCompare(b.name, 'ja')
                })}
              selectedValues={formData.gms}
              onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
              placeholder="GMを選択"
              closeOnSelect={true}
              emptyText="GMが見つかりません"
              emptyActionLabel="+ GMを作成"
              onEmptyAction={() => setIsStaffModalOpen(true)}
            />
            {formData.gms.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.gms.map((gm: string, index: number) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1 font-normal">
                    {gm}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-red-100"
                      onClick={() => {
                        const newGms = formData.gms.filter((g: string) => g !== gm)
                        setFormData((prev: EventFormData) => ({ ...prev, gms: newGms }))
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

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

        {/* アクションボタン */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>
            {mode === 'add' ? '追加' : '保存'}
          </Button>
        </div>
          </TabsContent>
          
          <TabsContent value="reservations" className="mt-4 overflow-y-auto flex-1">
            {loadingReservations ? (
              <div className="text-center py-8 text-muted-foreground">
                読み込み中...
              </div>
            ) : (
              <div>
                {/* 参加者追加ボタン */}
                <div className="mb-4">
                  {!isAddingParticipant ? (
                    <Button
                      onClick={() => setIsAddingParticipant(true)}
                      size="sm"
                    >
                      + 参加者を追加
                    </Button>
                  ) : (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <h4 className="font-medium mb-3">新しい参加者を追加</h4>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="customer_name">参加者名 *</Label>
                          <AutocompleteInput
                            value={newParticipant.customer_name}
                            onChange={(value) => setNewParticipant(prev => ({ ...prev, customer_name: value }))}
                            placeholder="参加者名を入力"
                            staffOptions={staff.map(s => ({ value: s.name, label: s.name, type: 'staff' as const }))}
                            customerOptions={customerNames.map(name => ({ value: name, label: name, type: 'customer' as const }))}
                            showStaffOnFocus={true}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="participant_count">人数</Label>
                            <Input
                              id="participant_count"
                              type="number"
                              min="1"
                              value={newParticipant.participant_count}
                              onChange={(e) => setNewParticipant(prev => ({ ...prev, participant_count: parseInt(e.target.value) || 1 }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor="payment_method">支払い方法</Label>
                            <Select
                              value={newParticipant.payment_method}
                              onValueChange={(value: 'onsite' | 'online') => setNewParticipant(prev => ({ ...prev, payment_method: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="onsite">現地決済</SelectItem>
                                <SelectItem value="online">事前決済</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="notes">メモ</Label>
                          <Textarea
                            id="notes"
                            value={newParticipant.notes}
                            onChange={(e) => setNewParticipant(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="特記事項があれば入力"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsAddingParticipant(false)
                              setNewParticipant({
                                customer_name: '',
                                participant_count: 1,
                                payment_method: 'onsite',
                                notes: ''
                              })
                            }}
                          >
                            キャンセル
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleAddParticipant}
                          >
                            追加
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {reservations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    予約はありません
                  </div>
                ) : (
                  <div>
                    {selectedReservations.size > 0 && (
                  <div className="mb-3 p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {selectedReservations.size}件選択中
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        const selectedEmails = reservations
                          .filter(r => selectedReservations.has(r.id))
                          .map(r => r.customer_id) // TODO: customer_idからemailを取得する必要がある
                          .filter(Boolean)
                        if (selectedEmails.length > 0) {
                          setIsEmailModalOpen(true)
                        } else {
                          alert('選択した予約にメールアドレスが設定されていません')
                        }
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      メール送信
                    </Button>
                  </div>
                )}
                <div>
                {/* ヘッダー */}
                <div className="border rounded-t-lg bg-muted/30 p-3 h-[50px] flex items-center justify-between font-medium text-sm">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-[40px] flex items-center justify-center">
                      <Checkbox
                        checked={selectedReservations.size === reservations.length && reservations.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedReservations(new Set(reservations.map(r => r.id)))
                          } else {
                            setSelectedReservations(new Set())
                          }
                        }}
                      />
                    </div>
                    <span className="w-[100px]">顧客名</span>
                    <span className="w-[60px]">人数</span>
                    <span className="w-[100px]">支払い</span>
                    <span className="w-[140px]">申し込み日時</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-[100px]">ステータス</span>
                    <span className="w-[80px]"></span>
                  </div>
                </div>
                
                {/* データ行 */}
                <div className="border-l border-r border-b rounded-b-lg">
                  {reservations.map((reservation, index) => {
                  const isExpanded = expandedReservation === reservation.id
                  const isLast = index === reservations.length - 1
                  return (
                    <div key={reservation.id} className={isLast ? '' : 'border-b'}>
                      {/* メイン行 */}
                      <div className="p-3 h-[60px] flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-[40px] flex items-center justify-center">
                            <Checkbox
                              checked={selectedReservations.has(reservation.id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedReservations)
                                if (checked) {
                                  newSelected.add(reservation.id)
                                } else {
                                  newSelected.delete(reservation.id)
                                }
                                setSelectedReservations(newSelected)
                              }}
                            />
                          </div>
                          <span className="font-medium truncate w-[100px]">{reservation.customer_notes || '顧客名なし'}</span>
                          <span className="text-sm text-muted-foreground flex-shrink-0 w-[60px]">
                            {reservation.participant_count ? `${reservation.participant_count}名` : '-'}
                          </span>
                          <Badge 
                            variant={
                              reservation.payment_method === 'onsite' ? 'outline' : 
                              reservation.payment_method === 'online' ? 'default' : 
                              'secondary'
                            } 
                            className="flex-shrink-0 w-[100px] justify-center"
                          >
                            {reservation.payment_method === 'onsite' ? '現地決済' : 
                             reservation.payment_method === 'online' ? '事前決済' : 
                             '未設定'}
                          </Badge>
                          <span className="text-sm text-muted-foreground w-[140px]">
                            {reservation.created_at ? new Date(reservation.created_at).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Select 
                            value={reservation.status} 
                            onValueChange={(value) => handleUpdateReservationStatus(reservation.id, value)}
                          >
                            <SelectTrigger className="w-[100px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed">確定</SelectItem>
                              <SelectItem value="cancelled">キャンセル</SelectItem>
                              <SelectItem value="pending">保留中</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                          >
                            詳細
                            {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      {/* 詳細エリア */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t">
                          <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                            {/* TODO: customer_emailは別途実装が必要 */}
                            {/* TODO: customer_phoneは別途実装が必要 */}
                          </div>
                          {/* TODO: notesは別途実装が必要 */}
                        </div>
                      )}
                    </div>
                  )
                  })}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* シナリオ作成モーダル */}
      <ScenarioEditModal
        scenario={null}
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        onSave={handleCreateScenario}
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

      {/* メール送信モーダル */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>メール送信</DialogTitle>
            <DialogDescription>
              選択した{selectedReservations.size}件の予約者にメールを送信します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email-subject">件名</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="例: 公演のご案内"
              />
            </div>

            <div>
              <Label htmlFor="email-body">本文</Label>
              <Textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="メール本文を入力してください..."
                rows={10}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">送信先:</p>
              <ul className="list-disc list-inside space-y-1">
                {reservations
                  .filter(r => selectedReservations.has(r.id))
                  .map(r => (
                    <li key={r.id}>
                      {r.customer_notes || '顧客名なし'} ({r.customer_id})
                    </li>
                  ))}
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEmailModalOpen(false)
                  setEmailSubject('')
                  setEmailBody('')
                }}
                disabled={sendingEmail}
              >
                キャンセル
              </Button>
              <Button
                onClick={async () => {
                  if (!emailSubject.trim() || !emailBody.trim()) {
                    alert('件名と本文を入力してください')
                    return
                  }

                  setSendingEmail(true)
                  try {
                    // TODO: メール送信API実装
                    const selectedEmails = reservations
                      .filter(r => selectedReservations.has(r.id))
                      .map(r => r.customer_id) // TODO: customer_idからemailを取得する必要がある
                      .filter(Boolean)
                    
                    logger.log('メール送信:', {
                      to: selectedEmails,
                      subject: emailSubject,
                      body: emailBody
                    })
                    
                    // Google Apps Script でメール送信
                    const result = await sendEmail({
                      to: selectedEmails,
                      subject: emailSubject,
                      body: emailBody,
                    })
                    
                    if (result.success) {
                      alert('メールを送信しました')
                      setIsEmailModalOpen(false)
                      setEmailSubject('')
                      setEmailBody('')
                      setSelectedReservations(new Set())
                    } else {
                      alert(`メール送信に失敗しました: ${result.error}`)
                    }
                  } catch (error) {
                    logger.error('メール送信エラー:', error)
                    alert('メール送信に失敗しました')
                  } finally {
                    setSendingEmail(false)
                  }
                }}
                disabled={sendingEmail}
              >
                {sendingEmail ? '送信中...' : '送信'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
