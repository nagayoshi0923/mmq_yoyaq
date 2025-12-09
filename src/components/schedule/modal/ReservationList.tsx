import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Mail, ChevronDown, ChevronUp } from 'lucide-react'
import { reservationApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { findMatchingStaff } from '@/utils/staffUtils'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { EmailPreview } from './EmailPreview'

interface ReservationListProps {
  event: ScheduleEvent | null
  currentEventData: EventFormData
  mode: 'add' | 'edit'
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  onParticipantChange?: (eventId: string, newCount: number) => void
}

export function ReservationList({
  event,
  currentEventData,
  mode,
  stores,
  scenarios,
  staff,
  onParticipantChange
}: ReservationListProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [expandedReservation, setExpandedReservation] = useState<string | null>(null)
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set())
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isEmailConfirmOpen, setIsEmailConfirmOpen] = useState(false)
  const [emailContent, setEmailContent] = useState({
    customerEmail: '',
    customerName: '',
    cancellationReason: '店舗都合によるキャンセル',
    scenarioTitle: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    storeName: '',
    participantCount: 0,
    totalPrice: 0,
    reservationNumber: '',
    cancellationFee: 0
  })
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite' as 'onsite' | 'online' | 'staff',
    notes: ''
  })
  const [customerNames, setCustomerNames] = useState<string[]>([])

  // 予約データを読み込む
  useEffect(() => {
    const loadReservations = async () => {
      if (mode === 'edit' && event?.id) {
        setLoadingReservations(true)
        try {
          // 貸切予約の場合
          if (event.is_private_request && event.reservation_id) {
            logger.log('貸切予約を取得:', { reservationId: event.reservation_id, eventId: event.id })
            
            // event.idが仮想ID（UUID形式でない、または`private-`プレフィックス、または複合ID形式）の場合は、reservation_idから直接取得
            const isVirtualId = event.id.startsWith('private-') || 
                               !event.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
                               event.id.split('-').length > 5
            
            if (isVirtualId) {
              // 仮想IDの場合はreservation_idから直接取得
              const { data, error } = await supabase
                .from('reservations')
                .select('*, customers(*)')
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed'])
              
              if (error) {
                logger.error('貸切予約データの取得に失敗:', error)
                setReservations([])
              } else {
                logger.log('貸切予約データ取得成功:', data)
                setReservations(data || [])
              }
            } else {
              // 実IDの場合（schedule_event_idが紐付いている）、schedule_event_idで取得を試みる
              let reservations = await reservationApi.getByScheduleEvent(event.id)
              
              // schedule_event_idで取得できなかった場合、reservation_idで直接取得（フォールバック）
              if (reservations.length === 0) {
                logger.log('schedule_event_idで取得できず、reservation_idで取得を試みます')
                const { data, error } = await supabase
                  .from('reservations')
                  .select('*, customers(*)')
                  .eq('id', event.reservation_id)
                  .in('status', ['pending', 'confirmed', 'gm_confirmed'])
                
                if (error) {
                  logger.error('貸切予約データの取得に失敗:', error)
                  setReservations([])
                } else {
                  logger.log('貸切予約データ取得成功（フォールバック）:', data)
                  setReservations(data || [])
                }
              } else {
                logger.log('貸切予約データ取得成功（schedule_event_id経由）:', reservations)
                setReservations(reservations)
              }
            }
          } else {
            // 通常の予約の場合、schedule_event_idで取得
            const data = await reservationApi.getByScheduleEvent(event.id)
            logger.log('通常予約データ取得:', { eventId: event.id, count: data.length })
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

  // 顧客名を取得する関数
  useEffect(() => {
    const fetchCustomerNames = async () => {
      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('customer_notes, participant_names')
          .not('customer_notes', 'is', null)
          .not('customer_notes', 'eq', '')
        
        if (error) throw error
        
        const names = new Set<string>()
        
        data?.forEach(reservation => {
          if (reservation.customer_notes) {
            const name = reservation.customer_notes.replace(/様$/, '').trim()
            if (name) names.add(name)
          }
          
          if (reservation.participant_names && Array.isArray(reservation.participant_names)) {
            reservation.participant_names.forEach(name => {
              if (name && name.trim()) names.add(name.trim())
            })
          }
        })
        
        setCustomerNames(Array.from(names).sort())
      } catch (error) {
        logger.error('顧客名の取得に失敗:', error)
      }
    }

    fetchCustomerNames()
  }, [])

  // 参加者名が変更された時にスタッフ名と一致するかチェック
  useEffect(() => {
    if (newParticipant.customer_name.trim()) {
      const isStaff = staff.some(s => s.name === newParticipant.customer_name.trim())
      if (isStaff && newParticipant.payment_method !== 'staff') {
        setNewParticipant(prev => ({ ...prev, payment_method: 'staff' }))
      }
    }
  }, [newParticipant.customer_name, staff])

  // 予約ステータスを更新する関数
  const handleUpdateReservationStatus = async (reservationId: string, newStatus: Reservation['status']) => {
    try {
      const reservation = reservations.find(r => r.id === reservationId)
      if (!reservation) return
      
      const oldStatus = reservation.status
      
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
        setCancellingReservation(reservation)
        setIsCancelDialogOpen(true)
        return
      }
      
      await reservationApi.update(reservationId, { status: newStatus })
      
      setReservations(prev => 
        prev.map(r => r.id === reservationId ? { ...r, status: newStatus } : r)
      )
      
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
      showToast.error('ステータスの更新に失敗しました')
    }
  }

  // キャンセル確認処理
  const handleConfirmCancel = () => {
    if (!cancellingReservation || !event) return

    try {
      let customerName = cancellingReservation.customer_name || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.name : cancellingReservation.customers?.name) : 
          null) || 
        cancellingReservation.customer_notes // 顧客名がない場合はcustomer_notesをフォールバックとして使用

      let customerEmail = cancellingReservation.customer_email || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.email : cancellingReservation.customers?.email) : 
          null)

      // メールアドレスが見つからない場合、スタッフ情報から検索を試みる
      if (!customerEmail && customerName) {
        // 名前からスタッフを検索（完全一致）
        const normalizedName = customerName.replace(/様$/, '').trim()
        const staffMember = staff.find(s => s.name === normalizedName)
        
        if (staffMember && staffMember.email) {
          customerEmail = staffMember.email
          logger.log('スタッフ情報からメールアドレスを取得しました:', { name: normalizedName, email: customerEmail })
        }
      }

      const eventDate = event.date || currentEventData.date
      const startTime = event.start_time || currentEventData.start_time
      const endTime = event.end_time || currentEventData.end_time
      const scenarioTitle = event.scenario || currentEventData.scenario || cancellingReservation.title || ''
      const storeName = currentEventData.venue 
        ? stores.find(s => s.id === currentEventData.venue)?.name 
        : event.venue 
          ? stores.find(s => s.name === event.venue)?.name || event.venue
          : ''

      let cancellationFee = 0
      if (eventDate && startTime) {
        try {
          const eventDateTime = new Date(`${eventDate}T${startTime}`)
          const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
          cancellationFee = hoursUntilEvent < 24 ? (cancellingReservation.total_price || cancellingReservation.final_price || 0) : 0
        } catch (dateError) {
          logger.warn('日時計算エラー:', dateError)
        }
      }

      if (customerEmail && customerName) {
        setEmailContent({
          customerEmail,
          customerName,
          cancellationReason: '店舗都合によるキャンセル',
          scenarioTitle,
          eventDate: eventDate || '',
          startTime: startTime || '',
          endTime: endTime || '',
          storeName,
          participantCount: cancellingReservation.participant_count,
          totalPrice: cancellingReservation.total_price || cancellingReservation.final_price || 0,
          reservationNumber: cancellingReservation.reservation_number || '',
          cancellationFee
        })
        setIsEmailConfirmOpen(true)
        setIsCancelDialogOpen(false)
      } else {
        handleExecuteCancelWithoutEmail()
        setIsCancelDialogOpen(false)
      }
    } catch (error) {
      logger.error('メール内容の準備エラー:', error)
      showToast.error('メール内容の準備に失敗しました')
    }
  }

  // メール送信なしでキャンセル処理のみを実行
  const handleExecuteCancelWithoutEmail = async () => {
    if (!cancellingReservation || !event) return

    try {
      const cancelledAt = new Date().toISOString()
      await reservationApi.update(cancellingReservation.id, {
        status: 'cancelled',
        cancelled_at: cancelledAt
      })

      setReservations(prev => 
        prev.filter(r => r.id !== cancellingReservation.id)
      )
      
      if (expandedReservation === cancellingReservation.id) {
        setExpandedReservation(null)
      }
      
      setSelectedReservations(prev => {
        const newSelected = new Set(prev)
        newSelected.delete(cancellingReservation.id)
        return newSelected
      })

      if (event.id && !event.id.startsWith('private-')) {
        try {
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('current_participants')
            .eq('id', event.id)
            .single()
          
          const currentCount = eventData?.current_participants || 0
          const change = -cancellingReservation.participant_count
          const newCount = Math.max(0, currentCount + change)
          
          await supabase
            .from('schedule_events')
            .update({ current_participants: newCount })
            .eq('id', event.id)
          
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }

      setCancellingReservation(null)
      showToast.success('予約をキャンセルしました', '※ 顧客情報が不足しているため、キャンセル確認メールは送信されませんでした')
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      showToast.error('予約のキャンセルに失敗しました')
    }
  }

  // 実際のキャンセル処理とメール送信を実行
  const handleExecuteCancelAndSendEmail = async () => {
    if (!cancellingReservation || !event) return

    try {
      const cancelledAt = new Date().toISOString()
      await reservationApi.update(cancellingReservation.id, {
        status: 'cancelled',
        cancelled_at: cancelledAt
      })

      setReservations(prev => 
        prev.filter(r => r.id !== cancellingReservation.id)
      )
      
      if (expandedReservation === cancellingReservation.id) {
        setExpandedReservation(null)
      }
      
      setSelectedReservations(prev => {
        const newSelected = new Set(prev)
        newSelected.delete(cancellingReservation.id)
        return newSelected
      })

      if (event.id && !event.id.startsWith('private-')) {
        try {
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('current_participants')
            .eq('id', event.id)
            .single()
          
          const currentCount = eventData?.current_participants || 0
          const change = -cancellingReservation.participant_count
          const newCount = Math.max(0, currentCount + change)
          
          await supabase
            .from('schedule_events')
            .update({ current_participants: newCount })
            .eq('id', event.id)
          
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }

      try {
        const { error: emailError } = await supabase.functions.invoke('send-cancellation-confirmation', {
          body: {
            reservationId: cancellingReservation.id,
            customerEmail: emailContent.customerEmail,
            customerName: emailContent.customerName,
            scenarioTitle: emailContent.scenarioTitle,
            eventDate: emailContent.eventDate,
            startTime: emailContent.startTime,
            endTime: emailContent.endTime,
            storeName: emailContent.storeName,
            participantCount: emailContent.participantCount,
            totalPrice: emailContent.totalPrice,
            reservationNumber: emailContent.reservationNumber,
            cancelledBy: 'store',
            cancellationReason: emailContent.cancellationReason,
            cancellationFee: emailContent.cancellationFee
          }
        })

        if (emailError) throw emailError
      } catch (emailError) {
        logger.error('キャンセル確認メール送信エラー:', emailError)
        showToast.warning('予約はキャンセルされましたが、メール送信に失敗しました', emailError instanceof Error ? emailError.message : '不明なエラー')
      }

      setIsEmailConfirmOpen(false)
      setCancellingReservation(null)
      setEmailContent({
        customerEmail: '',
        customerName: '',
        cancellationReason: '店舗都合によるキャンセル',
        scenarioTitle: '',
        eventDate: '',
        startTime: '',
        endTime: '',
        storeName: '',
        participantCount: 0,
        totalPrice: 0,
        reservationNumber: '',
        cancellationFee: 0
      })
      
      showToast.success('メールを送信しました')
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      showToast.error('予約のキャンセルに失敗しました', error instanceof Error ? error.message : '不明なエラー')
    }
  }

  // 参加者を追加する関数
  const handleAddParticipant = async () => {
    const participantName = newParticipant.customer_name.trim() || 'デモ参加者'

    if (!event?.id) return

    try {
      const scenarioObj = scenarios.find(s => s.title === currentEventData.scenario)
      const storeObj = stores.find(s => s.id === currentEventData.venue)
      
      // スタッフかどうかを判定
      const isStaff = findMatchingStaff(participantName, null, staff) !== null
      const paymentMethod = isStaff ? 'staff' : newParticipant.payment_method
      
      const participationFee = scenarioObj?.participation_fee || 0
      const basePrice = paymentMethod === 'staff' ? 0 : participationFee
      const totalPrice = basePrice * newParticipant.participant_count
      
      // スタッフ参加の場合は reservation_source を 'staff_participation' に設定
      const reservationSource = isStaff ? 'staff_participation' : 'walk_in'
      
      const reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'> = {
        schedule_event_id: event.id,
        title: currentEventData.scenario || '',
        scenario_id: scenarioObj?.id || null,
        store_id: storeObj?.id || null,
        customer_id: null,
        customer_notes: participantName,
        requested_datetime: `${currentEventData.date}T${currentEventData.start_time}+09:00`,
        duration: scenarioObj?.duration || 120,
        participant_count: newParticipant.participant_count,
        participant_names: [participantName],
        assigned_staff: currentEventData.gms || [],
        base_price: basePrice,
        options_price: 0,
        total_price: totalPrice,
        discount_amount: 0,
        final_price: totalPrice,
        payment_method: participantName === 'デモ参加者' ? 'onsite' : paymentMethod,
        payment_status: (participantName === 'デモ参加者' || paymentMethod === 'online') ? 'paid' : (paymentMethod === 'staff' ? 'paid' : 'pending'),
        status: 'confirmed' as const,
        reservation_source: reservationSource as 'walk_in' | 'staff_participation'
      }

      const createdReservation = await reservationApi.create(reservation)
      
      if (event.id) {
        try {
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('current_participants')
            .eq('id', event.id)
            .single()
          
          const currentCount = eventData?.current_participants || 0
          const newCount = currentCount + newParticipant.participant_count
          
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
      
      if (createdReservation) {
        setReservations(prev => [...prev, createdReservation])
      }
      
      if (event.id) {
        try {
          const data = await reservationApi.getByScheduleEvent(event.id)
          setReservations(data)
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
        }
      }
      
      setNewParticipant({
        customer_name: '',
        participant_count: 1,
        payment_method: 'onsite',
        notes: ''
      })
      setIsAddingParticipant(false)
      
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      showToast.error('参加者の追加に失敗しました')
    }
  }

  return (
    <>
      {loadingReservations ? (
        <div className="text-center py-8 text-muted-foreground">
          読み込み中...
        </div>
      ) : (
        <div>
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
                      onChange={(value) => {
                        // スタッフかどうかを判定し、自動的にpayment_methodを設定
                        const matchedStaff = findMatchingStaff(value, null, staff)
                        setNewParticipant(prev => ({
                          ...prev,
                          customer_name: value,
                          // スタッフの場合は自動的に「スタッフ参加」に設定
                          payment_method: matchedStaff ? 'staff' : prev.payment_method === 'staff' ? 'onsite' : prev.payment_method
                        }))
                      }}
                      placeholder="参加者名を入力"
                      staffOptions={staff.map(s => ({ value: s.name, label: s.name, type: 'staff' as const }))}
                      customerOptions={customerNames.map(name => ({ value: name, label: name, type: 'customer' as const }))}
                      showStaffOnFocus={true}
                    />
                    {findMatchingStaff(newParticipant.customer_name, null, staff) && (
                      <p className="text-xs text-blue-600 mt-1">
                        ※ スタッフとして認識されました
                      </p>
                    )}
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
                        onValueChange={(value: 'onsite' | 'online' | 'staff') => setNewParticipant(prev => ({ ...prev, payment_method: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onsite">現地決済</SelectItem>
                          <SelectItem value="online">事前決済</SelectItem>
                          <SelectItem value="staff">スタッフ参加（無料）</SelectItem>
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
                        .map(r => r.customer_id)
                        .filter(Boolean)
                      if (selectedEmails.length > 0) {
                        setIsEmailModalOpen(true)
                      } else {
                        showToast.warning('選択した予約にメールアドレスが設定されていません')
                      }
                    }}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    メール送信
                  </Button>
                </div>
              )}
              <div>
                <div className="hidden sm:flex border rounded-t-lg bg-muted/30 p-3 h-[50px] items-center justify-between font-medium text-xs">
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
                    <span className="flex-1">顧客名</span>
                    <span className="w-[60px]">人数</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-[80px]">ステータス</span>
                    <span className="w-[80px]"></span>
                  </div>
                </div>
                <div className="sm:hidden border rounded-t-lg bg-muted/30 p-3 flex items-center justify-between font-medium text-xs">
                  <div className="flex items-center gap-2">
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
                    <span>予約一覧</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {reservations.length}件
                  </span>
                </div>
                
                <div className="border-l border-r border-b rounded-b-lg">
                  {reservations.map((reservation, index) => {
                    const isExpanded = expandedReservation === reservation.id
                    const isLast = index === reservations.length - 1
                    return (
                      <div key={reservation.id} className={isLast ? '' : 'border-b'}>
                        <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
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
                            <span className="font-medium truncate flex-1 min-w-0">
                              {(() => {
                                if (reservation.customer_name) {
                                  return reservation.customer_name
                                }
                                if (reservation.customers) {
                                  const customer = Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers
                                  if (customer?.name) {
                                    return customer.name
                                  }
                                }
                                return reservation.customer_notes || '顧客名なし'
                              })()}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {reservation.participant_count ? `${reservation.participant_count}名` : '-'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 ml-6 sm:ml-0 flex-wrap">
                            <Select 
                              value={reservation.status} 
                              onValueChange={(value) => handleUpdateReservationStatus(reservation.id, value as Reservation['status'])}
                            >
                              <SelectTrigger className="w-[80px] h-8 text-xs">
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
                              className="h-8 px-2 text-xs"
                              onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                            >
                              詳細
                              {isExpanded ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                        
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

            <div className="text-xs text-muted-foreground">
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
                    showToast.warning('件名と本文を入力してください')
                    return
                  }

                  setSendingEmail(true)
                  try {
                    const selectedEmails = reservations
                      .filter(r => selectedReservations.has(r.id))
                      .map(r => {
                        if (r.customers) {
                          if (Array.isArray(r.customers)) {
                            return r.customers[0]?.email
                          }
                          return (r.customers as Customer).email
                        }
                        return null
                      })
                      .filter((email): email is string => email !== null && email !== undefined)
                    
                    if (selectedEmails.length === 0) {
                      showToast.warning('送信先のメールアドレスが見つかりませんでした')
                      return
                    }

                    logger.log('メール送信:', {
                      to: selectedEmails,
                      subject: emailSubject,
                      body: emailBody
                    })
                    
                    const { error } = await supabase.functions.invoke('send-email', {
                      body: {
                        recipients: selectedEmails,
                        subject: emailSubject,
                        body: emailBody
                      }
                    })
                    
                    if (error) {
                      throw error
                    }

                    showToast.success(`${selectedEmails.length}件のメールを送信しました`)
                    setIsEmailModalOpen(false)
                    setEmailSubject('')
                    setEmailBody('')
                    setSelectedReservations(new Set())
                  } catch (error) {
                    logger.error('メール送信エラー:', error)
                    showToast.error('メール送信に失敗しました')
                  } finally {
                    setSendingEmail(false)
                  }
                }}
                disabled={sendingEmail || selectedReservations.size === 0}
              >
                {sendingEmail ? '送信中...' : `送信 (${selectedReservations.size}件)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約をキャンセルしますか？</DialogTitle>
            <DialogDescription>
              キャンセル確認メールが送信されます。
            </DialogDescription>
          </DialogHeader>
          {cancellingReservation && (
            <div className="space-y-2 py-4">
              <div className="text-sm">
                <span className="font-medium">予約者:</span>{' '}
                {cancellingReservation.customer_name || 
                  (cancellingReservation.customers ? 
                    (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.name : cancellingReservation.customers?.name) : 
                    '顧客名なし')}
              </div>
              <div className="text-sm">
                <span className="font-medium">参加者数:</span> {cancellingReservation.participant_count}名
              </div>
              <div className="text-sm">
                <span className="font-medium">予約番号:</span> {cancellingReservation.reservation_number || 'なし'}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCancelDialogOpen(false)
                setCancellingReservation(null)
              }}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
            >
              キャンセル確定
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmailConfirmOpen} onOpenChange={setIsEmailConfirmOpen}>
        <DialogContent size="lg" className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>キャンセル確認メール送信</DialogTitle>
            <DialogDescription>
              送信内容を確認・編集してください
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">編集</TabsTrigger>
                <TabsTrigger value="preview">プレビュー</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="space-y-4 py-4 overflow-y-auto flex-1">
                <div>
                  <Label htmlFor="email-to">送信先</Label>
                  <Input
                    id="email-to"
                    value={emailContent.customerEmail}
                    disabled
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {emailContent.customerName} 様
                  </p>
                </div>

                <div>
                  <Label htmlFor="cancellation-reason">キャンセル理由</Label>
                  <Textarea
                    id="cancellation-reason"
                    value={emailContent.cancellationReason}
                    onChange={(e) => setEmailContent(prev => ({ ...prev, cancellationReason: e.target.value }))}
                    className="mt-1"
                    rows={3}
                    placeholder="キャンセル理由を入力してください"
                  />
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">シナリオ:</span> {emailContent.scenarioTitle}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">公演日時:</span> {emailContent.eventDate} {emailContent.startTime} - {emailContent.endTime}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">店舗:</span> {emailContent.storeName}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">参加者数:</span> {emailContent.participantCount}名
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">予約番号:</span> {emailContent.reservationNumber}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">料金:</span> ¥{emailContent.totalPrice.toLocaleString()}
                  </div>
                  {emailContent.cancellationFee > 0 && (
                    <div className="text-sm text-destructive">
                      <span className="font-medium">キャンセル料:</span> ¥{emailContent.cancellationFee.toLocaleString()}
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="preview" className="py-4 overflow-y-auto flex-1">
                <EmailPreview content={emailContent} />
              </TabsContent>
            </Tabs>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsEmailConfirmOpen(false)
                setEmailContent({
                  customerEmail: '',
                  customerName: '',
                  cancellationReason: '店舗都合によるキャンセル',
                  scenarioTitle: '',
                  eventDate: '',
                  startTime: '',
                  endTime: '',
                  storeName: '',
                  participantCount: 0,
                  totalPrice: 0,
                  reservationNumber: '',
                  cancellationFee: 0
                })
              }}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleExecuteCancelAndSendEmail}
            >
              メール送信
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

