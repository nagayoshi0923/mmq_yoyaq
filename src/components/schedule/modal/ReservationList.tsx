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
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
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
  onGmsChange?: (gms: string[], gmRoles: Record<string, string>) => void
  // 予約データから取得したスタッフ参加者を親に通知（DBの情報を直接反映）
  onStaffParticipantsChange?: (staffParticipants: string[]) => void
}

export function ReservationList({
  event,
  currentEventData,
  mode,
  stores,
  scenarios,
  staff,
  onParticipantChange,
  onGmsChange,
  onStaffParticipantsChange
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
              const reservations = await reservationApi.getByScheduleEvent(event.id)
              
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
            
            // 予約リストから合計人数を計算して同期
            const totalParticipants = data.reduce((sum, r) => sum + (r.participant_count || 0), 0)
            if (onParticipantChange && event.id) {
              onParticipantChange(event.id, totalParticipants)
            }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParticipant.customer_name, staff])

  // 予約データからスタッフ参加者を抽出して親に通知（DBをシングルソースとする）
  useEffect(() => {
    if (onStaffParticipantsChange) {
      const staffParticipants = reservations
        .filter(r => 
          r.payment_method === 'staff' && 
          r.status !== 'cancelled' &&
          r.participant_names?.length
        )
        .flatMap(r => r.participant_names || [])
      
      onStaffParticipantsChange(staffParticipants)
    }
  }, [reservations, onStaffParticipantsChange])

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
            // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
            const newCount = await recalculateCurrentParticipants(event.id)
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
      // スタッフ参加の場合はメール送信なしで直接削除
      const isStaffReservation = 
        cancellingReservation.reservation_source === 'staff_entry' ||
        cancellingReservation.reservation_source === 'staff_participation' ||
        cancellingReservation.payment_method === 'staff'
      
      if (isStaffReservation) {
        handleExecuteCancelWithoutEmail(true)
        setIsCancelDialogOpen(false)
        return
      }

      const customerName = cancellingReservation.customer_name || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.name : cancellingReservation.customers?.name) : 
          null) || 
        cancellingReservation.customer_notes // 顧客名がない場合はcustomer_notesをフォールバックとして使用

      const customerEmail = cancellingReservation.customer_email || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.email : cancellingReservation.customers?.email) : 
          null)

      // メールアドレスが見つからない場合、スタッフ情報から検索を試みる（スタッフ参加以外の場合のみ）
      if (!customerEmail && customerName) {
        // 名前からスタッフを検索（完全一致）
        const normalizedName = customerName.replace(/様$/, '').trim()
        const staffMember = staff.find(s => s.name === normalizedName)
        
        // スタッフとしてマッチした場合もメール送信なしで削除
        if (staffMember) {
          handleExecuteCancelWithoutEmail(true)
          setIsCancelDialogOpen(false)
          return
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
          storeName: storeName || '',
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
  const handleExecuteCancelWithoutEmail = async (isStaff: boolean = false) => {
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
          // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
          const newCount = await recalculateCurrentParticipants(event.id)
          if (onParticipantChange) {
            onParticipantChange(event.id, newCount)
          }
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }

      setCancellingReservation(null)
      
      // スタッフ参加の場合、GM欄からも連動して削除（再作成防止）
      if (isStaff && onGmsChange && cancellingReservation.participant_names?.length) {
        const staffName = cancellingReservation.participant_names[0]
        // 現在のGM欄の情報を取得してスタッフ参加を解除
        const { data: eventData } = await supabase
          .from('schedule_events')
          .select('gms, gm_roles')
          .eq('id', event.id)
          .single()
        
        if (eventData) {
          const currentGms = eventData.gms || []
          const currentRoles = eventData.gm_roles || {}
          
          // UUIDパターン（gmsには名前が入るべきで、IDが入っている場合は除外）
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          
          // スタッフ名を削除し、誤って入ったUUIDも除外
          const newGms = currentGms.filter((g: string) => g !== staffName && !uuidPattern.test(g))
          const newRoles = { ...currentRoles }
          delete newRoles[staffName]
          // UUIDキーも削除
          Object.keys(newRoles).forEach(key => {
            if (uuidPattern.test(key)) {
              delete newRoles[key]
            }
          })
          
          // DB更新
          await supabase
            .from('schedule_events')
            .update({ gms: newGms, gm_roles: newRoles })
            .eq('id', event.id)
          
          // 親コンポーネントに通知
          onGmsChange(newGms, newRoles)
          logger.log('GM欄からスタッフ参加を削除:', staffName)
        }
        showToast.success('スタッフ参加を削除しました')
      } else if (isStaff) {
        showToast.success('スタッフ参加を削除しました')
      } else {
        showToast.success('予約をキャンセルしました', '※ 顧客情報が不足しているため、キャンセル確認メールは送信されませんでした')
      }
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
          // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
          const newCount = await recalculateCurrentParticipants(event.id)
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
      const matchedStaff = findMatchingStaff(participantName, null, staff)
      const isStaff = matchedStaff !== null
      const paymentMethod = isStaff ? 'staff' : newParticipant.payment_method
      
      const participationFee = scenarioObj?.participation_fee || 0
      const unitPrice = paymentMethod === 'staff' ? 0 : participationFee
      const basePrice = unitPrice * newParticipant.participant_count
      const totalPrice = basePrice
      
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
        unit_price: unitPrice,
        payment_method: participantName === 'デモ参加者' ? 'onsite' : paymentMethod,
        payment_status: (participantName === 'デモ参加者' || paymentMethod === 'online') ? 'paid' : (paymentMethod === 'staff' ? 'paid' : 'pending'),
        status: 'confirmed' as const,
        reservation_source: reservationSource
      }

      const createdReservation = await reservationApi.create(reservation)
      
      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
      if (event.id) {
        try {
          const newCount = await recalculateCurrentParticipants(event.id)
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
                    <span className="w-[100px]">予約日時</span>
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
                            <span className="font-medium truncate flex-1 min-w-0 flex items-center gap-2">
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
                              {/* スタッフ参加バッジ */}
                              {(reservation.payment_method === 'staff' || 
                                reservation.reservation_source === 'staff_participation' || 
                                reservation.reservation_source === 'staff_entry') && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                  スタッフ
                                </span>
                              )}
                            </span>
                            <Select 
                              value={String(reservation.participant_count || 1)}
                              onValueChange={async (value) => {
                                const newCount = parseInt(value)
                                
                                // 予約時の1人あたり料金を取得（unit_price優先、なければbase_priceから計算）
                                const unitPrice = reservation.unit_price 
                                  || Math.round((reservation.base_price || 0) / (reservation.participant_count || 1))
                                
                                // 料金を再計算
                                const newBasePrice = unitPrice * newCount
                                const optionsPrice = reservation.options_price || 0
                                const discountAmount = reservation.discount_amount || 0
                                const newTotalPrice = newBasePrice + optionsPrice
                                const newFinalPrice = newTotalPrice - discountAmount
                                
                                // 予約の人数と料金を更新
                                const { error } = await supabase
                                  .from('reservations')
                                  .update({ 
                                    participant_count: newCount,
                                    participant_names: Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者'),
                                    unit_price: unitPrice,
                                    base_price: newBasePrice,
                                    total_price: newTotalPrice,
                                    final_price: newFinalPrice
                                  })
                                  .eq('id', reservation.id)
                                
                                if (error) {
                                  showToast.error('人数の更新に失敗しました')
                                  return
                                }
                                
                                // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
                                if (event?.id) {
                                  try {
                                    const newEventCount = await recalculateCurrentParticipants(event.id)
                                    onParticipantChange?.(event.id, newEventCount)
                                  } catch (updateError) {
                                    logger.error('参加者数の更新エラー:', updateError)
                                  }
                                }
                                
                                // ローカルの予約データを更新
                                setReservations(prev => 
                                  prev.map(r => r.id === reservation.id 
                                    ? { ...r, participant_count: newCount }
                                    : r
                                  )
                                )
                                
                                showToast.success('人数を更新しました')
                              }}
                            >
                              <SelectTrigger className="w-[60px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                                  <SelectItem key={n} value={String(n)}>{n}名</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="hidden sm:block text-xs text-muted-foreground w-[100px]">
                              {reservation.created_at ? new Date(reservation.created_at).toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : '-'}
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
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">人数</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={reservation.participant_count}
                                    onChange={async (e) => {
                                      const newCount = parseInt(e.target.value) || 1
                                      if (newCount < 1 || newCount > 20) return
                                      
                                      // 予約時の1人あたり料金を取得（unit_price優先、なければbase_priceから計算）
                                      const unitPrice = reservation.unit_price 
                                        || Math.round((reservation.base_price || 0) / (reservation.participant_count || 1))
                                      
                                      // 料金を再計算
                                      const newBasePrice = unitPrice * newCount
                                      const optionsPrice = reservation.options_price || 0
                                      const discountAmount = reservation.discount_amount || 0
                                      const newTotalPrice = newBasePrice + optionsPrice
                                      const newFinalPrice = newTotalPrice - discountAmount
                                      
                                      // 予約の人数と料金を更新
                                      const { error } = await supabase
                                        .from('reservations')
                                        .update({ 
                                          participant_count: newCount,
                                          participant_names: Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者'),
                                          unit_price: unitPrice,
                                          base_price: newBasePrice,
                                          total_price: newTotalPrice,
                                          final_price: newFinalPrice
                                        })
                                        .eq('id', reservation.id)
                                      
                                      if (error) {
                                        showToast.error('人数の更新に失敗しました')
                                        return
                                      }
                                      
                                      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
                                      if (event?.id) {
                                        try {
                                          const newEventCount = await recalculateCurrentParticipants(event.id)
                                          onParticipantChange?.(event.id, newEventCount)
                                        } catch (updateError) {
                                          logger.error('参加者数の更新エラー:', updateError)
                                        }
                                      }
                                      
                                      // ローカルの予約データを更新
                                      setReservations(prev => 
                                        prev.map(r => r.id === reservation.id 
                                          ? { ...r, participant_count: newCount }
                                          : r
                                        )
                                      )
                                      
                                      showToast.success('人数を更新しました')
                                    }}
                                    className="w-20 h-8 text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">名</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">予約ソース</Label>
                                <div className="text-sm">
                                  {reservation.reservation_source === 'demo' ? 'デモ' : 
                                   reservation.reservation_source === 'staff_participation' ? 'スタッフ参加' :
                                   reservation.reservation_source === 'web' ? 'Web予約' :
                                   reservation.reservation_source === 'walk_in' ? '当日予約' :
                                   reservation.reservation_source || '-'}
                                </div>
                              </div>
                            </div>
                            {reservation.customer_notes && (
                              <div className="mt-3">
                                <Label className="text-xs text-muted-foreground">備考</Label>
                                <div className="text-sm mt-1">{reservation.customer_notes}</div>
                              </div>
                            )}
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

