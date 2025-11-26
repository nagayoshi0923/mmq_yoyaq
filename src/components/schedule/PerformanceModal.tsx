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
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { X, ChevronDown, ChevronUp, Mail, ExternalLink } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { scenarioApi, staffApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
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
  timeSlot?: string // 時間帯（朝/昼/夜）
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
  time_slot?: string // 時間帯（朝/昼/夜）
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

// メールプレビューコンポーネント
interface EmailContent {
  customerEmail: string
  customerName: string
  cancellationReason: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
  cancellationFee: number
}

function EmailPreview({ content }: { content: EmailContent }) {
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    } catch {
      return dateStr
    }
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const hasCancellationFee = content.cancellationFee > 0

  return (
    <div className="border rounded-lg p-4 bg-white max-h-[400px] overflow-y-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
        <h2 className="text-red-600 text-lg font-bold mb-1">公演中止のお知らせ</h2>
        <p className="text-sm mb-1">{content.customerName} 様</p>
        <p className="text-xs text-gray-600">
          誠に申し訳ございませんが、以下の公演を中止させていただくこととなりました。
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
        <h3 className="text-base font-semibold mb-3 pb-2 border-b border-gray-300">中止された公演</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600 w-1/3">予約番号</td>
              <td className="py-2 text-gray-900">{content.reservationNumber}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">シナリオ</td>
              <td className="py-2 text-gray-900">{content.scenarioTitle}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">日時</td>
              <td className="py-2 text-gray-900">
                {formatDate(content.eventDate)}<br />
                {formatTime(content.startTime)} - {formatTime(content.endTime)}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">会場</td>
              <td className="py-2 text-gray-900">{content.storeName}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 font-medium text-gray-600">参加人数</td>
              <td className="py-2 text-gray-900">{content.participantCount}名</td>
            </tr>
            <tr className={hasCancellationFee ? 'border-b border-gray-100' : ''}>
              <td className="py-2 font-medium text-gray-600">予約金額</td>
              <td className="py-2 text-gray-600">¥{content.totalPrice.toLocaleString()}</td>
            </tr>
            {hasCancellationFee && (
              <tr>
                <td className="py-2 font-medium text-red-600">キャンセル料</td>
                <td className="py-2 text-red-600 text-base font-bold">¥{content.cancellationFee.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {content.cancellationReason && (
        <div className="bg-gray-50 border-l-4 border-gray-500 rounded p-3 mb-3">
          <h3 className="text-gray-700 font-semibold mb-1 text-sm">中止理由</h3>
          <p className="text-gray-600 whitespace-pre-line text-xs">{content.cancellationReason}</p>
        </div>
      )}

      <div className="bg-red-50 border-l-4 border-red-600 rounded p-3 mb-3">
        <h3 className="text-red-900 font-semibold mb-1 text-sm">お詫び</h3>
        <p className="text-red-900 text-xs">
          この度は、ご予約いただいていたにもかかわらず、公演を中止せざるを得なくなり、誠に申し訳ございません。<br />
          お支払いいただいた料金は全額返金させていただきます。<br />
          またのご利用を心よりお待ちしております。
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-center mb-3">
        <p className="text-gray-600 text-xs">
          この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。<br />
          またのご利用を心よりお待ちしております。
        </p>
      </div>

      <div className="text-center pt-3 border-t border-gray-200 text-gray-400 text-xs">
        <p className="mb-0.5">Murder Mystery Queue (MMQ)</p>
        <p className="mb-0.5">このメールは自動送信されています</p>
        <p>ご不明な点がございましたら、お気軽にお問い合わせください</p>
      </div>
    </div>
  )
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
  availableStaffByScenario = {},
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange
}: PerformanceModalProps) {
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
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

  // 予約ステータスを更新する関数
  const handleUpdateReservationStatus = async (reservationId: string, newStatus: Reservation['status']) => {
    try {
      // 変更前のステータスを取得
      const reservation = reservations.find(r => r.id === reservationId)
      if (!reservation) return
      
      const oldStatus = reservation.status
      
      // キャンセルに変更する場合は確認ダイアログを表示
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
        setCancellingReservation(reservation)
        setIsCancelDialogOpen(true)
        return
      }
      
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

  // キャンセル確認処理（メール確認モーダルを表示するだけ）
  const handleConfirmCancel = () => {
    if (!cancellingReservation || !event) {
      logger.error('キャンセル処理エラー: 必要な情報が不足しています', { cancellingReservation, event })
      return
    }

    try {
      // 顧客情報を取得
      const customerName = cancellingReservation.customer_name || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.name : cancellingReservation.customers?.name) : 
          null)
      const customerEmail = cancellingReservation.customer_email || 
        (cancellingReservation.customers ? 
          (Array.isArray(cancellingReservation.customers) ? cancellingReservation.customers[0]?.email : cancellingReservation.customers?.email) : 
          null)

      if (customerEmail && customerName) {
        // イベント情報を取得
        const eventDate = event.date || formData.date
        const startTime = event.start_time || formData.start_time
        const endTime = event.end_time || formData.end_time
        const scenarioTitle = event.scenario || formData.scenario || cancellingReservation.title || ''
        const storeName = formData.venue 
          ? stores.find(s => s.id === formData.venue)?.name 
          : event.venue 
            ? stores.find(s => s.name === event.venue)?.name || event.venue
            : ''

        // キャンセル料を計算（24時間以内は100%）
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

        // メール内容を設定して確認モーダルを表示
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
        logger.warn('顧客情報が不足しているため、メールを送信できませんでした', { customerName, customerEmail })
        alert('顧客情報が不足しているため、メールを送信できません')
      }
    } catch (error) {
      logger.error('メール内容の準備エラー:', error)
      alert('メール内容の準備に失敗しました')
    }
  }

  // 実際のキャンセル処理とメール送信を実行
  const handleExecuteCancelAndSendEmail = async () => {
    if (!cancellingReservation || !event) {
      logger.error('キャンセル処理エラー: 必要な情報が不足しています', { cancellingReservation, event })
      return
    }

    try {
      logger.log('予約キャンセル処理開始:', { reservationId: cancellingReservation.id })
      
      // 予約をキャンセルに更新（cancelled_atも設定）
      const cancelledAt = new Date().toISOString()
      await reservationApi.update(cancellingReservation.id, {
        status: 'cancelled',
        cancelled_at: cancelledAt
      })
      logger.log('予約ステータス更新成功')

      // ローカルステートを更新（キャンセルされた予約はリストから削除）
      setReservations(prev => 
        prev.filter(r => r.id !== cancellingReservation.id)
      )
      
      // キャンセルされた予約が展開されている場合は閉じる
      if (expandedReservation === cancellingReservation.id) {
        setExpandedReservation(null)
      }
      
      // キャンセルされた予約が選択されている場合は選択解除
      setSelectedReservations(prev => {
        const newSelected = new Set(prev)
        newSelected.delete(cancellingReservation.id)
        return newSelected
      })

      // schedule_eventsのcurrent_participantsを減らす
      if (event.id && !event.id.startsWith('private-')) {
        try {
          const { data: eventData, error: eventError } = await supabase
            .from('schedule_events')
            .select('current_participants')
            .eq('id', event.id)
            .single()
          
          if (eventError) {
            logger.error('schedule_events取得エラー:', eventError)
          } else {
            const currentCount = eventData?.current_participants || 0
            const change = -cancellingReservation.participant_count
            const newCount = Math.max(0, currentCount + change)
            
            const { error: updateError } = await supabase
              .from('schedule_events')
              .update({ current_participants: newCount })
              .eq('id', event.id)
            
            if (updateError) {
              logger.error('参加者数更新エラー:', updateError)
            } else {
              logger.log('参加者数更新成功:', { eventId: event.id, oldCount: currentCount, newCount })
              if (onParticipantChange) {
                onParticipantChange(event.id, newCount)
              }
            }
          }
        } catch (error) {
          logger.error('参加者数の更新エラー:', error)
        }
      }

      // メール送信
      try {
        logger.log('キャンセル確認メール送信開始:', {
          reservationId: cancellingReservation.id,
          customerEmail: emailContent.customerEmail,
          customerName: emailContent.customerName
        })

        const { data, error: emailError } = await supabase.functions.invoke('send-cancellation-confirmation', {
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

        logger.log('メール送信レスポンス:', { data, error: emailError })

        if (emailError) {
          logger.error('メール送信エラー:', emailError)
          throw emailError
        }

        logger.log('キャンセル確認メール送信成功')
      } catch (emailError) {
        logger.error('キャンセル確認メール送信エラー:', emailError)
        // メール送信失敗してもキャンセル処理は完了しているので、ユーザーに通知
        alert(`予約はキャンセルされましたが、メール送信に失敗しました: ${emailError instanceof Error ? emailError.message : '不明なエラー'}`)
      }

      // モーダルを閉じる
      setIsEmailConfirmOpen(false)
      
      // 状態をリセット
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
      
      // 成功メッセージを表示
      alert('メールを送信しました')
      
      logger.log('予約キャンセル処理完了')
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      console.error('予約キャンセルエラーの詳細:', error)
      alert(`予約のキャンセルに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
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

  // 参加者名が変更された時にスタッフ名と一致するかチェック
  useEffect(() => {
    if (newParticipant.customer_name.trim()) {
      const isStaff = staff.some(s => s.name === newParticipant.customer_name.trim())
      if (isStaff && newParticipant.payment_method !== 'staff') {
        setNewParticipant(prev => ({ ...prev, payment_method: 'staff' }))
      }
    }
  }, [newParticipant.customer_name, staff])

  // 参加者を追加する関数
  const handleAddParticipant = async () => {
    // 参加者名が未入力の場合はデモ参加者として追加
    const participantName = newParticipant.customer_name.trim() || 'デモ参加者'

    if (!event?.id) {
      return
    }

    try {
      // シナリオと店舗のIDを取得
      const scenarioObj = scenarios.find(s => s.title === formData.scenario)
      const storeObj = stores.find(s => s.id === formData.venue)
      
      // 参加費を計算（1人あたり）
      const participationFee = scenarioObj?.participation_fee || 0
      // デモ参加者も有料、スタッフ参加のみ無料
      const basePrice = newParticipant.payment_method === 'staff' ? 0 : participationFee
      const totalPrice = basePrice * newParticipant.participant_count
      
      const reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'> = {
        schedule_event_id: event.id,
        title: formData.scenario || '',
        scenario_id: scenarioObj?.id || null,
        store_id: storeObj?.id || null,
        customer_id: null, // 匿名参加者として扱う（NULLを許可）
        customer_notes: participantName,
        requested_datetime: `${formData.date}T${formData.start_time}+09:00`,
        duration: scenarioObj?.duration || 120,
        participant_count: newParticipant.participant_count,
        participant_names: [participantName],
        assigned_staff: formData.gms || [],
        base_price: basePrice,
        options_price: 0,
        total_price: totalPrice,
        discount_amount: 0,
        final_price: totalPrice,
        payment_method: participantName === 'デモ参加者' ? 'onsite' : newParticipant.payment_method,
        payment_status: (participantName === 'デモ参加者' || newParticipant.payment_method === 'online') ? 'paid' : (newParticipant.payment_method === 'staff' ? 'paid' : 'pending'),
        status: 'confirmed' as const,
        reservation_source: 'walk_in' as const // 管理画面から追加する場合は'walk_in'として扱う
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
      
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      alert('参加者の追加に失敗しました')
    }
  }

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      // シナリオIDがない場合は、タイトルから逆引き
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
      // time_slotが存在する場合はそれを使用、なければstart_timeから判定
      let slot: 'morning' | 'afternoon' | 'evening' = 'morning'
      if (event.timeSlot) {
        // timeSlotが'朝'/'昼'/'夜'形式の場合
        if (event.timeSlot === '朝') slot = 'morning'
        else if (event.timeSlot === '昼') slot = 'afternoon'
        else if (event.timeSlot === '夜') slot = 'evening'
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
      
      setFormData({
        ...event,
        scenario_id: selectedScenario?.id,  // IDを設定
        time_slot: event.timeSlot || (slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'), // time_slotを設定
        max_participants: selectedScenario?.player_count_max ?? event.max_participants ?? DEFAULT_MAX_PARTICIPANTS // シナリオの参加人数を反映
      })
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

  // 時間帯（morning/afternoon/evening）を'朝'/'昼'/'夜'にマッピング
  const getTimeSlotLabel = (slot: 'morning' | 'afternoon' | 'evening'): string => {
    return slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'
  }

  const handleSave = () => {
    // 時間帯を'朝'/'昼'/'夜'形式で保存
    const saveData = {
      ...formData,
      time_slot: getTimeSlotLabel(timeSlot)
    }
    onSave(saveData)
    onClose()
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

          {/* 時間帯選択とGM選択 */}
          <div className="grid grid-cols-2 gap-4">
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
                      
                      // 出勤可能かチェック
                      const availableGMs = availableStaffByScenario?.[formData.scenario] || []
                      const isAvailable = availableGMs.some(gm => gm.id === staffMember.id)
                      
                      // 表示情報を構築
                      const displayParts: string[] = []
                      if (isAvailable) displayParts.push('出勤可能')
                      if (isAssignedGM) displayParts.push('担当GM')
                      
                      return {
                        id: staffMember.id,
                        name: staffMember.name,
                        displayInfo: displayParts.length > 0 ? displayParts.join(' / ') : undefined,
                        sortOrder: isAvailable ? 0 : isAssignedGM ? 1 : 2
                      }
                    })
                    .sort((a, b) => {
                      // sortOrderで優先順位を決定
                      if (a.sortOrder !== b.sortOrder) {
                        return a.sortOrder - b.sortOrder
                      }
                      // 同じ優先順位の場合は名前順
                      return a.name.localeCompare(b.name, 'ja')
                    })
                    .map(({ id, name, displayInfo }) => ({ id, name, displayInfo }))
                  
                  console.log('🔍 GM選択オプション:', {
                    scenario: formData.scenario,
                    availableStaffByScenario,
                    options: options.slice(0, 3)
                  })
                  
                  return options
                })()}
                selectedValues={formData.gms}
                onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
                placeholder="GMを選択"
                closeOnSelect={true}
                emptyText="GMが見つかりません"
                emptyActionLabel="+ GMを作成"
                onEmptyAction={() => setIsStaffModalOpen(true)}
              />
              {/* GM選択バッジ表示 */}
              {formData.gms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.gms.map((gm: string, index: number) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1 font-normal bg-gray-100 border-0 rounded-[2px]">
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
                    scenario_id: selectedScenario.id,  // IDも同時に設定
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
                {scenarios.map(scenario => {
                  // このシナリオで出勤可能なGMを取得
                  const availableGMs = availableStaffByScenario?.[scenario.title] || []
                  
                  return (
                    <SelectItem key={scenario.id} value={scenario.title}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{scenario.title}</span>
                        {availableGMs.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {availableGMs.map(gm => gm.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
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
                {/* ヘッダー - PC表示のみ */}
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
                {/* モバイル用ヘッダー */}
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
                
                {/* データ行 */}
                <div className="border-l border-r border-b rounded-b-lg">
                  {reservations.map((reservation, index) => {
                  const isExpanded = expandedReservation === reservation.id
                  const isLast = index === reservations.length - 1
                  return (
                    <div key={reservation.id} className={isLast ? '' : 'border-b'}>
                      {/* メイン行 - モバイル対応2行レイアウト */}
                      <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                        {/* 1行目: チェックボックス + 名前 + 人数 */}
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
                              // 予約者名の優先順位: customer_name > customers.name > customer_notes
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
                        
                        {/* 2行目: 支払い方法 + ステータス + 詳細ボタン */}
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
                    alert('件名と本文を入力してください')
                    return
                  }

                  setSendingEmail(true)
                  try {
                    // 選択された予約の顧客メールアドレスを取得
                    const selectedEmails = reservations
                      .filter(r => selectedReservations.has(r.id))
                      .map(r => {
                        // customers がオブジェクトの場合と配列の場合の両方に対応
                        // 型: Reservation型のcustomersプロパティ（Customer | Customer[] | null | undefined）
                        if (r.customers) {
                          if (Array.isArray(r.customers)) {
                            return r.customers[0]?.email
                          }
                          // Customer型のemailプロパティ（string | null | undefined）
                          return (r.customers as Customer).email
                        }
                        return null
                      })
                      .filter((email): email is string => email !== null && email !== undefined)
                    
                    if (selectedEmails.length === 0) {
                      alert('送信先のメールアドレスが見つかりませんでした')
                      return
                    }

                    logger.log('メール送信:', {
                      to: selectedEmails,
                      subject: emailSubject,
                      body: emailBody
                    })
                    
                    // Supabase Edge Function でメール送信
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

                    alert(`${selectedEmails.length}件のメールを送信しました`)
                    setIsEmailModalOpen(false)
                    setEmailSubject('')
                    setEmailBody('')
                    setSelectedReservations(new Set())
                  } catch (error) {
                    logger.error('メール送信エラー:', error)
                    alert('メール送信に失敗しました')
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

      {/* キャンセル確認ダイアログ */}
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

      {/* メール送信確認・編集モーダル */}
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
                // メール送信をキャンセルした場合は、予約キャンセルもキャンセル
                // 状態をリセットするだけで、予約はキャンセルされない（まだキャンセル処理を実行していないため）
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
    </Dialog>
  )
}
