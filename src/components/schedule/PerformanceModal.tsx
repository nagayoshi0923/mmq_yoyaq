// 公演編集モーダル（リファクタリング＋モバイル対応版）

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { scenarioApi, staffApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'

// 型定義とユーティリティ
import type { PerformanceModalProps, EventFormData, NewParticipant } from './PerformanceModal/types'
import type { Reservation, Scenario } from '@/types'
import { timeOptions } from './PerformanceModal/utils/timeOptions'

// コンポーネント
import { PerformanceFormTab } from './PerformanceModal/components/PerformanceFormTab'
import { ReservationsTab } from './PerformanceModal/components/ReservationsTab'

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
  availableStaffByScenario,
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange
}: PerformanceModalProps) {
  // タブ管理
  const [activeTab, setActiveTab] = useState<'edit' | 'reservations'>('edit')
  
  // フォームデータ
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

  // 時間帯デフォルト値
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [timeSlotDefaults, setTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 予約データ
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())

  // シナリオ・スタッフ編集モーダル
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)

  // イベントデータまたは初期データからフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
      setFormData({
        id: event.id,
        date: event.date,
        venue: event.venue,
        scenario: event.scenario,
        scenario_id: selectedScenario?.id || '',
        gms: event.gms || [],
        start_time: event.start_time,
        end_time: event.end_time,
        category: event.category || 'private',
        participant_count: event.participant_count || 0,
        max_participants: event.max_participants || selectedScenario?.max_participants || DEFAULT_MAX_PARTICIPANTS,
        notes: event.notes || '',
        is_private_request: event.is_private_request || false,
        reservation_id: event.reservation_id
      })
    } else if (mode === 'add' && initialData) {
      const { date, venue, timeSlot: initialTimeSlot } = initialData
      const slotKey = initialTimeSlot as keyof typeof timeSlotDefaults
      const timeDefaults = timeSlotDefaults[slotKey] || timeSlotDefaults.morning
      
      setFormData((prev: any) => ({
        ...prev,
        date,
        venue,
        start_time: timeDefaults.start_time,
        end_time: timeDefaults.end_time
      }))
      
      setTimeSlot(slotKey)
    }
  }, [mode, event, initialData, scenarios, timeSlotDefaults])

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

        // 公演スケジュール設定の適用
        if (performanceData?.performance_times) {
          const newDefaults = {
            morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
            afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
            evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
          }

          // 設定された時間に基づいて更新
          performanceData.performance_times.forEach((time: any) => {
            const slotKey = time.slot as keyof typeof newDefaults
            if (slotKey && newDefaults[slotKey]) {
              const duration = performanceData.default_duration || 240
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
          // 貸切予約の場合
          if (event.is_private_request && event.reservation_id) {
            const isVirtualId = event.id.startsWith('private-') || 
                               !event.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
                               event.id.split('-').length > 5
            
            if (isVirtualId) {
              const { data, error } = await supabase
                .from('reservations')
                .select('*, customers(*)')
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed'])
              
              if (error) {
                logger.error('貸切予約データの取得に失敗:', error)
                setReservations([])
              } else {
                setReservations(data || [])
              }
            } else {
              let reservations = await reservationApi.getByScheduleEvent(event.id)
              
              if (reservations.length === 0) {
                const { data, error } = await supabase
                  .from('reservations')
                  .select('*, customers(*)')
                  .eq('id', event.reservation_id)
                  .in('status', ['pending', 'confirmed', 'gm_confirmed'])
                
                if (!error) {
                  setReservations(data || [])
                } else {
                  setReservations([])
                }
              } else {
                setReservations(reservations)
              }
            }
          } else {
            const data = await reservationApi.getByScheduleEvent(event.id)
            setReservations(data)
          }
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
  }, [mode, event?.id, event?.is_private_request, event?.reservation_id])

  // 時間帯が変更されたときに開始・終了時間を自動設定
  const handleTimeSlotChange = (slot: 'morning' | 'afternoon' | 'evening') => {
    setTimeSlot(slot)
    const defaults = timeSlotDefaults[slot]
    setFormData((prev: any) => ({
      ...prev,
      start_time: defaults.start_time,
      end_time: defaults.end_time
    }))
  }

  // 開始時間変更時に終了時間を自動計算
  const handleStartTimeChange = (time: string) => {
    setFormData((prev: any) => {
      const newFormData = { ...prev, start_time: time }
      
      if (prev.scenario) {
        const selectedScenario = scenarios.find(s => s.title === prev.scenario)
        if (selectedScenario) {
          const duration = selectedScenario.duration || 240
          const [hours, minutes] = time.split(':').map(Number)
          const endDate = new Date(2000, 0, 1, hours, minutes + duration)
          const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
          newFormData.end_time = endTime
        }
      }
      
      return newFormData
    })
  }

  // シナリオ編集保存
  const handleScenarioSaved = async () => {
    if (onScenariosUpdate) {
      onScenariosUpdate()
    }
  }

  // スタッフ作成
  const handleCreateStaff = async (newStaff: any) => {
    try {
      await staffApi.create(newStaff)
      if (onStaffUpdate) {
        onStaffUpdate()
      }
      setIsStaffModalOpen(false)
    } catch (error) {
      logger.error('スタッフ作成エラー:', error)
      throw error
    }
  }

  // 参加者追加
  const handleAddParticipant = async (participant: NewParticipant) => {
    if (!event?.id) return

    try {
      // 顧客を検索または作成
      let customerId: string | null = null
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('name', participant.customer_name)
        .maybeSingle()

      if (existingCustomer) {
        customerId = existingCustomer.id
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({ name: participant.customer_name })
          .select('id')
          .single()
        
        customerId = newCustomer?.id || null
      }

      // シナリオと店舗の情報を取得
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      const selectedStore = stores.find(s => s.id === event.venue)

      // 料金計算
      const basePrice = selectedScenario?.participation_fee || 0
      const participantCount = participant.participant_count
      const totalPrice = participant.payment_method === 'staff' ? 0 : basePrice * participantCount

      // タイムスタンプの形式を整える（HH:MMまたはHH:MM:SSに対応）
      const startTime = event.start_time.length === 5 
        ? `${event.start_time}:00` 
        : event.start_time.slice(0, 8)
      const requestedDatetime = `${event.date}T${startTime}+09:00`

      // 予約を作成
      const newReservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'> = {
        customer_id: customerId,
        customer_name: participant.customer_name,
        schedule_event_id: event.id,
        title: event.scenario,
        scenario_id: selectedScenario?.id || null,
        store_id: selectedStore?.id || null,
        requested_datetime: requestedDatetime,
        duration: selectedScenario?.duration || 240,
        participant_count: participantCount,
        participant_names: [participant.customer_name],
        assigned_staff: event.gms,
        base_price: basePrice,
        options_price: 0,
        total_price: totalPrice,
        discount_amount: 0,
        final_price: totalPrice,
        payment_status: participant.payment_method === 'online' ? 'paid' : 'pending',
        payment_method: participant.payment_method,
        status: 'confirmed',
        customer_notes: participant.notes || null,
        reservation_source: 'walk_in'
      }

      await reservationApi.create(newReservation)

      // 予約リストを再読み込み
      const data = await reservationApi.getByScheduleEvent(event.id)
      setReservations(data)

      // 参加者数を更新
      if (onParticipantChange) {
        const newTotal = data.reduce((sum, r) => sum + (r.participant_count || 0), 0)
        onParticipantChange(event.id, newTotal)
      }
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      throw error
    }
  }

  // 予約ステータス更新
  const handleUpdateReservationStatus = async (reservationId: string, newStatus: Reservation['status']) => {
    try {
      const reservation = reservations.find(r => r.id === reservationId)
      if (!reservation) return
      
      const oldStatus = reservation.status
      
      await reservationApi.update(reservationId, { status: newStatus })
      
      // ローカルステートを更新
      setReservations(prev => 
        prev.map(r => r.id === reservationId ? { ...r, status: newStatus } : r)
      )
      
      // schedule_eventsのcurrent_participantsを更新
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
            const change = isActive ? reservation.participant_count || 0 : -(reservation.participant_count || 0)
            const newCount = Math.max(0, currentCount + change)
            
            await supabase
              .from('schedule_events')
              .update({ current_participants: newCount })
              .eq('id', event.id)
            
            if (onParticipantChange) {
              onParticipantChange(event.id, newCount)
            }
          } catch (error) {
            logger.error('公演参加者数の更新に失敗:', error)
          }
        }
      }
    } catch (error) {
      logger.error('予約ステータス更新エラー:', error)
      throw error
    }
  }

  // フォーム保存
  const handleSave = () => {
    if (!formData.date || !formData.venue || !formData.scenario) {
      alert('必須項目を入力してください')
      return
    }
    if (!formData.start_time || !formData.end_time) {
      alert('開始時間と終了時間を入力してください')
      return
    }
    if (formData.start_time >= formData.end_time) {
      alert('終了時間は開始時間より後にしてください')
      return
    }

    const selectedScenario = scenarios.find(s => s.title === formData.scenario)
    
    const eventData: EventFormData = {
      id: formData.id,
      date: formData.date,
      venue: formData.venue,
      scenario: formData.scenario,
      scenario_id: selectedScenario?.id,
      category: formData.category,
      start_time: formData.start_time,
      end_time: formData.end_time,
      max_participants: formData.max_participants,
      capacity: formData.max_participants,
      gms: formData.gms,
      notes: formData.notes,
      is_private_request: formData.is_private_request,
      reservation_id: formData.reservation_id
    }

    onSave(eventData)
    onClose()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          size="xl" 
          className="max-w-[95vw] md:max-w-[90vw] xl:max-w-[1200px] max-h-[90vh] flex flex-col"
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-sm md:text-base xl:text-lg">
              {mode === 'add' ? '公演を追加' : '公演を編集'}
            </DialogTitle>
            {event?.is_private_request && (
              <DialogDescription className="text-xs md:text-sm">
                <span className="text-purple-600 font-medium">貸切リクエストから作成された公演です</span>
              </DialogDescription>
            )}
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'edit' | 'reservations')} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
              <TabsTrigger value="edit" className="text-xs md:text-sm">公演情報</TabsTrigger>
              <TabsTrigger value="reservations" disabled={mode === 'add'} className="text-xs md:text-sm">
                予約者一覧 {mode === 'edit' && reservations.length > 0 && `(${reservations.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-3 md:mt-4 overflow-y-auto flex-1">
              <PerformanceFormTab
                mode={mode}
                formData={formData}
                setFormData={setFormData}
                stores={stores}
                scenarios={scenarios}
                staff={staff}
                timeSlot={timeSlot}
                timeSlotDefaults={timeSlotDefaults}
                onTimeSlotChange={handleTimeSlotChange}
                onStartTimeChange={handleStartTimeChange}
                onScenarioEditClick={(scenarioId) => {
                  setEditingScenarioId(scenarioId)
                  setIsScenarioDialogOpen(true)
                }}
                onStaffCreateClick={() => setIsStaffModalOpen(true)}
                onSave={handleSave}
                onClose={onClose}
              />
            </TabsContent>
            
            <TabsContent value="reservations" className="mt-3 md:mt-4 overflow-y-auto flex-1">
              <ReservationsTab
                reservations={reservations}
                loadingReservations={loadingReservations}
                selectedReservations={selectedReservations}
                setSelectedReservations={setSelectedReservations}
                expandedReservation={expandedReservation}
                setExpandedReservation={setExpandedReservation}
                staff={staff}
                onAddParticipant={handleAddParticipant}
                onUpdateStatus={handleUpdateReservationStatus}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
