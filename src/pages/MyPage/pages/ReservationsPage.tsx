import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, CheckCircle, MapPin, X, Users, AlertTriangle, CalendarDays, ArrowRight, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { reservationApi } from '@/lib/reservationApi'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { parseIntSafe } from '@/utils/number'
import { OptimizedImage } from '@/components/ui/optimized-image'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { Reservation, Waitlist } from '@/types'
import type { Store } from '@/types'
import {
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'

/** 貸切・オープンでキャンセル料テーブル・受付期限を切り替える */
function isPrivateReservation(reservation: Reservation): boolean {
  if (reservation.private_group_id) return true
  if (reservation.reservation_source === 'web_private') return true
  const raw = reservation.schedule_events
  const ev = Array.isArray(raw) ? raw[0] : raw
  if (ev && typeof ev === 'object' && 'is_private_booking' in ev && ev.is_private_booking) return true
  const cat = (ev as { category?: string } | undefined)?.category
  if (cat === 'private') return true
  return false
}

// キャンセルポリシー情報
interface CancellationPolicy {
  policy: string
  deadlineHours: number
  fees: Array<{ hours_before: number; fee_percentage: number; description: string }>
}

export function ReservationsPage() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [waitlist, setWaitlist] = useState<Waitlist[]>([])
  const [loading, setLoading] = useState(true)
  const [scenarioImages, setScenarioImages] = useState<Record<string, string>>({})
  const [scenarioInfo, setScenarioInfo] = useState<Record<string, { min: number; max: number }>>({})
  const [scenarioTitles, setScenarioTitles] = useState<Record<string, string>>({})
  const [stores, setStores] = useState<Record<string, Store>>({})
  
  // キャンセルダイアログ
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null)
  
  // 店舗ごとのキャンセル期限をキャッシュ
  const [storeDeadlines, setStoreDeadlines] = useState<Record<string, number>>({})
  const [storePrivateDeadlines, setStorePrivateDeadlines] = useState<Record<string, number>>({})
  
  // 人数変更ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Reservation | null>(null)
  const [newParticipantCount, setNewParticipantCount] = useState(1)
  const [updating, setUpdating] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState<number | null>(null)
  const [currentEventParticipants, setCurrentEventParticipants] = useState(0)

  // キャンセル待ち解除ダイアログ
  const [waitlistCancelDialogOpen, setWaitlistCancelDialogOpen] = useState(false)
  const [waitlistCancelTarget, setWaitlistCancelTarget] = useState<Waitlist | null>(null)
  const [waitlistCancelling, setWaitlistCancelling] = useState(false)

  // 日程変更ダイアログ
  const [dateChangeDialogOpen, setDateChangeDialogOpen] = useState(false)
  const [dateChangeTarget, setDateChangeTarget] = useState<Reservation | null>(null)
  const [availableEvents, setAvailableEvents] = useState<Array<{
    id: string
    date: string
    start_time: string
    end_time: string | null
    max_participants: number
    current_participants: number
    store_name: string
    store_id: string
  }>>([])
  const [selectedNewEventId, setSelectedNewEventId] = useState<string | null>(null)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [changingDate, setChangingDate] = useState(false)

  useEffect(() => {
    if (user?.email) {
      fetchReservations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user変更時のみ実行
  }, [user])

  const fetchReservations = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得（user_idまたはemailで検索）
      let customer = null
      const { data: customerByUserId } = await supabase
        .from('customers')
        .select('id, user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (customerByUserId) {
        customer = customerByUserId
      } else {
        const { data: customerByEmail, error: emailError } = await supabase
          .from('customers')
          .select('id, user_id')
          .ilike('email', user.email)
          .maybeSingle()
        
        if (emailError && emailError.code !== 'PGRST116') throw emailError
        
        if (customerByEmail) {
          customer = customerByEmail
          
          if (!customerByEmail.user_id && user.id) {
            supabase
              .from('customers')
              .update({ user_id: user.id })
              .eq('id', customerByEmail.id)
              .then(() => {})
          }
        }
      }

      if (!customer) {
        setReservations([])
        setWaitlist([])
        return
      }

      // キャンセル待ちと予約を並列取得
      const [waitlistResult, reservationsResult] = await Promise.all([
        supabase
          .from('waitlist')
          .select(`
            *,
            schedule_events(id, date, start_time, end_time, venue, scenario)
          `)
          .eq('customer_email', user.email)
          .in('status', ['waiting', 'notified'])
          .order('created_at', { ascending: false }),
        supabase
          .from('reservations')
          .select(`
            *, 
            payment_method, 
            payment_status,
            schedule_events!schedule_event_id(
              id, 
              date,
              start_time,
              current_participants, 
              max_participants,
              category
            )
          `)
          .eq('customer_id', customer.id)
          .order('requested_datetime', { ascending: false })
      ])

      if (waitlistResult.error) {
        logger.error('キャンセル待ち取得エラー:', waitlistResult.error)
      } else {
        setWaitlist(waitlistResult.data || [])
      }

      if (reservationsResult.error) throw reservationsResult.error
      const data = reservationsResult.data || []
      setReservations(data)

      // 関連データを並列取得
      if (data && data.length > 0) {
        const scenarioMasterIds = data
          .map(r => (r as { scenario_master_id?: string | null }).scenario_master_id ?? r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        const storeIds = new Set<string>()
        data.forEach(r => {
          if (r.store_id) storeIds.add(r.store_id)
          if (r.candidate_datetimes) {
            const cd = r.candidate_datetimes
            if (cd.confirmedStore?.storeId) storeIds.add(cd.confirmedStore.storeId)
            if (cd.requestedStores) {
              cd.requestedStores.forEach((store: any) => {
                if (store.storeId) storeIds.add(store.storeId)
              })
            }
          }
        })

        const storeIdsArray = Array.from(storeIds)
        
        // シナリオ、店舗、設定を並列取得
        const [scenarioResult, storesResult, settingsResult] = await Promise.all([
          scenarioMasterIds.length > 0
            ? supabase
                .from('scenario_masters')
                .select('id, title, key_visual_url, player_count_min, player_count_max')
                .in('id', scenarioMasterIds)
            : Promise.resolve({ data: null, error: null }),
          storeIdsArray.length > 0
            ? supabase
                .from('stores')
                .select('id, name, address, color')
                .in('id', storeIdsArray)
            : Promise.resolve({ data: null, error: null }),
          storeIdsArray.length > 0
            ? supabase
                .from('reservation_settings')
                .select('store_id, cancellation_deadline_hours, private_cancellation_deadline_hours')
                .in('store_id', storeIdsArray)
            : Promise.resolve({ data: null, error: null })
        ])

        // シナリオ情報処理
        if (scenarioResult.data) {
          const imageMap: Record<string, string> = {}
          const scenarioInfoMap: Record<string, { min: number; max: number }> = {}
          const titleMap: Record<string, string> = {}
          scenarioResult.data.forEach(s => {
            if (s.key_visual_url) imageMap[s.id] = s.key_visual_url
            if (s.title) titleMap[s.id] = s.title
            scenarioInfoMap[s.id] = {
              min: s.player_count_min || 1,
              max: s.player_count_max || 8
            }
          })
          setScenarioImages(imageMap)
          setScenarioInfo(scenarioInfoMap)
          setScenarioTitles(titleMap)
        }

        // 店舗情報処理
        if (storesResult.data) {
          const storeMap: Record<string, Store> = {}
          storesResult.data.forEach(store => {
            storeMap[store.id] = store as Store
          })
          setStores(storeMap)
        }

        // キャンセル期限処理
        if (settingsResult.data) {
          const deadlineMap: Record<string, number> = {}
          const privateDeadlineMap: Record<string, number> = {}
          settingsResult.data.forEach(setting => {
            if (setting.store_id != null) {
              if (setting.cancellation_deadline_hours != null) {
                deadlineMap[setting.store_id] = setting.cancellation_deadline_hours
              }
              if (setting.private_cancellation_deadline_hours != null) {
                privateDeadlineMap[setting.store_id] = setting.private_cancellation_deadline_hours
              }
            }
          })
          setStoreDeadlines(deadlineMap)
          setStorePrivateDeadlines(privateDeadlineMap)
        }
      }
    } catch (error) {
      logger.error('予約履歴取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 時間のみ表示（タイトルに日付が含まれているため）
  const formatTime = (dateString: string) => {
    // ISO文字列から直接時間を抽出（タイムゾーン変換を避ける）
    // 形式: 2026-01-11T13:00:00 or 2026-01-11T13:00:00+09:00
    const timeMatch = dateString.match(/T(\d{2}):(\d{2})/)
    if (timeMatch) {
      return `${timeMatch[1]}:${timeMatch[2]}`
    }
    // フォールバック
    const d = new Date(dateString)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // 日付と時間を表示（タイトルに日付がない場合用）
  const formatDateTime = (dateString: string) => {
    // ISO文字列から直接抽出
    const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    if (match) {
      return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`
    }
    const d = new Date(dateString)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // タイトルに日付が含まれているかチェック
  const titleHasDate = (title: string) => {
    // 「2026年1月11日」のような日付パターン
    return /\d{4}年\d{1,2}月\d{1,2}日/.test(title)
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  // 公演成立状況を取得
  const getPerformanceStatus = (reservation: Reservation) => {
    // schedule_eventsはjoinで取得されるがReservation型には含まれないためanyでアクセス
    const reservationWithEvent = reservation as Reservation & { 
      schedule_events?: { 
        current_participants?: number
        max_participants?: number
        category?: string 
      } | null 
    }
    const scheduleEvent = reservationWithEvent.schedule_events
    
    // 貸切公演は状況表示不要
    if (scheduleEvent?.category === 'private') {
      return null
    }
    
    const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
    const scenarioData = scenarioMasterId ? scenarioInfo[scenarioMasterId] : null
    const current = scheduleEvent?.current_participants || 0
    const max = scheduleEvent?.max_participants || scenarioData?.max || 8
    const min = scenarioData?.min || 1
    
    if (current >= max) {
      return { type: 'full', label: '満席', color: 'bg-green-100 text-green-700' }
    } else if (current >= min) {
      return { type: 'confirmed', label: '公演成立', remaining: max - current, color: 'bg-blue-100 text-blue-700' }
    } else {
      const remaining = min - current
      return { type: 'pending', label: `あと${remaining}名で成立`, remaining, color: 'bg-amber-100 text-amber-700' }
    }
  }

  const getPaymentMethodLabel = (method: string | null | undefined) => {
    if (!method) return '未設定'
    switch (method) {
      case 'cash':
        return '現地決済（現金）'
      case 'credit_card':
        return 'クレジットカード'
      case 'online':
        return 'オンライン決済'
      case 'bank_transfer':
        return '銀行振込'
      case 'paypay':
        return 'PayPay'
      case 'line_pay':
        return 'LINE Pay'
      default:
        return method
    }
  }

  const getPaymentMethodBadgeColor = (method: string | null | undefined) => {
    if (!method) return 'bg-gray-100 text-gray-800'
    switch (method) {
      case 'cash':
        return 'bg-green-100 text-green-800'
      case 'credit_card':
      case 'online':
        return 'bg-blue-100 text-blue-800'
      case 'bank_transfer':
        return 'bg-purple-100 text-purple-800'
      case 'paypay':
      case 'line_pay':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatTitle = (reservation: Reservation) => {
    const masterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
    const masterTitle = masterId ? scenarioTitles[masterId] : undefined
    if (masterTitle) {
      const prefix = reservation.title.match(/^【[^】]+】/)?.[0] ?? ''
      return prefix ? `${prefix}${masterTitle}` : masterTitle
    }
    return reservation.title
      .replace(/【貸切希望】/g, '【貸切】')
      .replace(/（候補\d+件）/g, '')
      .trim()
  }

  // キャンセル可能かどうかをチェック
  const canCancel = (reservation: Reservation) => {
    // schedule_eventsの型定義
    const reservationWithEvent = reservation as Reservation & { 
      schedule_events?: { 
        date?: string
        start_time?: string
        current_participants?: number
        max_participants?: number
        category?: string 
      } | null 
    }
    const scheduleEvent = reservationWithEvent.schedule_events
    
    // schedule_eventsがある場合はdate + start_timeを使用（より正確）
    let eventDateTime: Date
    if (scheduleEvent?.date && scheduleEvent?.start_time) {
      // schedule_eventsのdate（YYYY-MM-DD）とstart_time（HH:MM:SS）を組み合わせてJST日時を作成
      const dateStr = scheduleEvent.date
      const timeStr = scheduleEvent.start_time
      // JSTとして解釈するため、+09:00を付与
      eventDateTime = new Date(`${dateStr}T${timeStr}+09:00`)
    } else {
      // フォールバック: requested_datetimeを使用
      eventDateTime = new Date(reservation.requested_datetime)
    }
    
    const now = new Date()
    const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isPrivate = isPrivateReservation(reservation)
    const sid = reservation.store_id
    const deadlineHours = isPrivate
      ? sid != null && storePrivateDeadlines[sid] !== undefined
        ? storePrivateDeadlines[sid]
        : DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
      : sid != null && storeDeadlines[sid] !== undefined
        ? storeDeadlines[sid]
        : DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
    
    return hoursUntilEvent >= deadlineHours && reservation.status === 'confirmed'
  }

  // キャンセルの期限時間を取得
  const getCancelDeadlineHours = (reservation: Reservation) => {
    const isPrivate = isPrivateReservation(reservation)
    const sid = reservation.store_id
    if (isPrivate) {
      return sid != null && storePrivateDeadlines[sid] !== undefined
        ? storePrivateDeadlines[sid]
        : DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
    }
    return sid != null && storeDeadlines[sid] !== undefined
      ? storeDeadlines[sid]
      : DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
  }

  // 人数を減らせるかどうか（キャンセル期限内のみ減少可能）
  const canDecrease = (reservation: Reservation) => {
    return canCancel(reservation)
  }

  // キャンセルポリシーを取得
  const fetchCancellationPolicy = async (
    storeId: string | null | undefined,
    reservation: Reservation
  ): Promise<CancellationPolicy | null> => {
    if (!storeId) return null
    
    try {
      const { data, error } = await supabase
        .from('reservation_settings')
        .select(
          'cancellation_policy, private_cancellation_policy, cancellation_deadline_hours, private_cancellation_deadline_hours, cancellation_fees, private_cancellation_fees'
        )
        .eq('store_id', storeId)
        .maybeSingle()
      
      if (error || !data) return null

      const isPrivate = isPrivateReservation(reservation)
      return {
        policy: isPrivate
          ? data.private_cancellation_policy || ''
          : data.cancellation_policy || '',
        deadlineHours: isPrivate
          ? data.private_cancellation_deadline_hours ?? DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
          : data.cancellation_deadline_hours ?? DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
        fees: isPrivate
          ? data.private_cancellation_fees || []
          : data.cancellation_fees || [],
      }
    } catch (error) {
      logger.error('キャンセルポリシー取得エラー:', error)
      return null
    }
  }

  // キャンセル処理
  const handleCancelClick = async (reservation: Reservation) => {
    setCancelTarget(reservation)
    // キャンセルポリシーを取得
    const policy = await fetchCancellationPolicy(reservation.store_id, reservation)
    setCancellationPolicy(policy)
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return
    
    setCancelling(true)
    try {
      // 予約をキャンセル（RPC + 通知）
      await reservationApi.cancel(cancelTarget.id, 'お客様によるキャンセル')

      toast.success('予約をキャンセルしました')
      fetchReservations()
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      toast.error('キャンセルに失敗しました')
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
      setCancelTarget(null)
    }
  }

  // 人数変更処理
  const handleEditClick = async (reservation: Reservation) => {
    setEditTarget(reservation)
    setNewParticipantCount(reservation.participant_count)
    
    // 公演の空席情報を取得
    if (reservation.schedule_event_id) {
      try {
        const { data: eventData } = await supabase
          .from('schedule_events')
          .select('max_participants, current_participants')
          .eq('id', reservation.schedule_event_id)
          .single()
        
        if (eventData) {
          setMaxParticipants(eventData.max_participants || null)
          // この予約の人数を引いた現在の参加者数（他の予約分）
          setCurrentEventParticipants((eventData.current_participants || 0) - reservation.participant_count)
        }
      } catch (error) {
        logger.error('公演情報取得エラー:', error)
      }
    }
    
    setEditDialogOpen(true)
  }

  const handleEditConfirm = async () => {
    if (!editTarget) return
    
    setUpdating(true)
    try {
      const oldCount = editTarget.participant_count
      const countDiff = newParticipantCount - oldCount

      // 予約時点の1人あたり料金を取得（優先順位: unit_price → 計算値 → シナリオ）
      let pricePerPerson = editTarget.unit_price // 予約時点の料金
      
      if (!pricePerPerson && oldCount > 0) {
        // unit_priceがない場合はbase_priceから逆算
        pricePerPerson = Math.round((editTarget.base_price || 0) / oldCount)
      }
      
      if (!pricePerPerson && (editTarget as { scenario_master_id?: string | null }).scenario_master_id) {
        // それでもない場合は organization_scenarios_with_master から取得（フォールバック）
        const scenarioMasterId = (editTarget as { scenario_master_id?: string | null }).scenario_master_id
        const { data: scenarioData } = await supabase
          .from('organization_scenarios_with_master')
          .select('participation_fee')
          .eq('id', scenarioMasterId)
          .eq('organization_id', editTarget.organization_id)
          .maybeSingle()
        
        if (scenarioData?.participation_fee) {
          pricePerPerson = scenarioData.participation_fee
        }
      }
      
      pricePerPerson = pricePerPerson || 0
      
      const newBasePrice = pricePerPerson * newParticipantCount
      // オプション料金は維持（options_price）
      const optionsPrice = editTarget.options_price || 0
      const newTotalPrice = newBasePrice + optionsPrice
      const newFinalPrice = newTotalPrice - (editTarget.discount_amount || 0)

      // 🚨 SECURITY FIX (SEC-P0-05): 料金の直接UPDATE削除
      // 
      // 問題:
      //   - 元の実装は RPC で人数変更後、料金を直接UPDATEしていた
      //   - RLS で顧客の UPDATE 権限を削除したため、このコードは動作しなくなる
      // 
      // 修正:
      //   - 料金計算も含めて RPC 内で完結させる（027マイグレーションで対応）
      //   - 当面は人数変更のみで、料金は従来のunit_price×新人数で自動計算
      
      // 参加人数の更新はRPCでロック付き実行
      await reservationApi.updateParticipantsWithLock(
        editTarget.id,
        newParticipantCount,
        editTarget.customer_id ?? null
      )
      
      // TODO: 料金更新はRPC内で実施（027マイグレーション適用後）
      // 現状は updateParticipantsWithLock が人数のみ更新し、
      // 料金は別途計算が必要な場合はスタッフが管理画面から調整

      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
      if (editTarget.schedule_event_id) {
        try {
          await recalculateCurrentParticipants(editTarget.schedule_event_id)
        } catch (updateError) {
          logger.error('参加者数の更新エラー:', updateError)
        }
      }

      // 人数が減少した場合、キャンセル待ち通知を送信
      logger.log('人数変更チェック:', { 
        countDiff, 
        schedule_event_id: editTarget.schedule_event_id, 
        organization_id: editTarget.organization_id 
      })
      
      if (countDiff < 0 && editTarget.schedule_event_id) {
        try {
          // 公演情報を取得（organization_idも含めて取得）
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('date, start_time, end_time, scenario, venue, organization_id')
            .eq('id', editTarget.schedule_event_id)
            .single()
          
          const orgId = editTarget.organization_id || eventData?.organization_id
          logger.log('キャンセル待ち通知準備:', { eventData, orgId })
          
          if (eventData && orgId) {
            const result = await supabase.functions.invoke('notify-waitlist', {
              body: {
                organizationId: orgId,
                scheduleEventId: editTarget.schedule_event_id,
                freedSeats: Math.abs(countDiff), // 減少した人数分が空席
                scenarioTitle: editTarget.title || eventData.scenario || '',
                eventDate: eventData.date,
                startTime: eventData.start_time,
                endTime: eventData.end_time,
                storeName: eventData.venue || ''
              }
            })
            logger.log('キャンセル待ち通知送信結果:', result)
          }
        } catch (waitlistError) {
          logger.error('キャンセル待ち通知エラー:', waitlistError)
          // 通知失敗しても処理は続行
        }
      }

      toast.success('参加人数を変更しました')
      fetchReservations()
    } catch (error) {
      logger.error('予約更新エラー:', error)
      toast.error('変更に失敗しました')
    } finally {
      setUpdating(false)
      setEditDialogOpen(false)
      setEditTarget(null)
    }
  }

  // 日程変更処理
  const handleDateChangeClick = async (reservation: Reservation) => {
    const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
    if (!scenarioMasterId) {
      toast.error('シナリオ情報がありません')
      return
    }

    setDateChangeTarget(reservation)
    setSelectedNewEventId(null)
    setLoadingEvents(true)
    setDateChangeDialogOpen(true)

    try {
      // 同じシナリオの今後の公演を取得（現在の予約を除く）
      const today = new Date().toISOString().split('T')[0]
      const { data: events, error } = await supabase
        .from('schedule_events')
        .select(`
          id, date, start_time, end_time, max_participants, current_participants,
          stores:store_id (id, name)
        `)
        .eq('scenario_master_id', scenarioMasterId)
        .gte('date', today)
        .eq('is_cancelled', false)
        .neq('id', reservation.schedule_event_id || '')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })

      if (error) throw error

      // 空席がある公演のみフィルタ
      const availableEventsData = (events || [])
        .filter(e => {
          const available = (e.max_participants || 0) - (e.current_participants || 0)
          return available >= reservation.participant_count
        })
        .map(e => ({
          id: e.id,
          date: e.date,
          start_time: e.start_time,
          end_time: e.end_time,
          max_participants: e.max_participants || 0,
          current_participants: e.current_participants || 0,
          store_name: (e.stores as { name?: string } | null)?.name || '未定',
          store_id: (e.stores as { id?: string } | null)?.id || ''
        }))

      setAvailableEvents(availableEventsData)
    } catch (error) {
      logger.error('公演取得エラー:', error)
      toast.error('公演情報の取得に失敗しました')
    } finally {
      setLoadingEvents(false)
    }
  }

  const handleDateChangeConfirm = async () => {
    if (!dateChangeTarget || !selectedNewEventId) return

    setChangingDate(true)
    try {
      const oldEventId = dateChangeTarget.schedule_event_id
      const newEvent = availableEvents.find(e => e.id === selectedNewEventId)
      if (!newEvent) throw new Error('選択した公演が見つかりません')

      // 顧客IDを取得
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!customer) throw new Error('顧客情報が取得できません')

      // 🔒 RPCで日程変更（在庫をアトミックに調整）
      const { error } = await supabase.rpc('change_reservation_schedule', {
        p_reservation_id: dateChangeTarget.id,
        p_new_schedule_event_id: selectedNewEventId,
        p_customer_id: customer.id
      })

      if (error) {
        logger.error('日程変更RPCエラー:', error)
        if (error.code === 'P0020') throw new Error('選択した公演が見つかりません')
        if (error.code === 'P0021') throw new Error('選択した公演に空席がありません')
        if (error.code === 'P0007') throw new Error('予約が見つかりません')
        if (error.code === 'P0010') throw new Error('この予約を変更する権限がありません')
        throw error
      }

      // 日程変更確認メールを送信（失敗しても処理は続行）
      try {
        await supabase.functions.invoke('send-booking-change-confirmation', {
          body: {
            reservationId: dateChangeTarget.id,
            customerEmail: user?.email,
            customerName: dateChangeTarget.customer_name,
            scenarioTitle: dateChangeTarget.title,
            oldDate: dateChangeTarget.requested_datetime?.split('T')[0],
            newDate: newEvent.date,
            newStartTime: newEvent.start_time,
            storeName: newEvent.store_name,
            participantCount: dateChangeTarget.participant_count
          }
        })
      } catch (emailError) {
        logger.error('メール送信エラー:', emailError)
        // メール送信失敗は処理に影響させない
      }

      toast.success('日程を変更しました')
      fetchReservations()
    } catch (error) {
      logger.error('日程変更エラー:', error)
      toast.error('日程変更に失敗しました')
    } finally {
      setChangingDate(false)
      setDateChangeDialogOpen(false)
      setDateChangeTarget(null)
    }
  }

  // 日付をフォーマット
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  // 人数変更可能な最大値を計算
  const getMaxAllowedParticipants = () => {
    if (!maxParticipants) return 10 // デフォルト上限
    const available = maxParticipants - currentEventParticipants
    return Math.max(1, available)
  }

  const getStoreInfo = (reservation: Reservation) => {
    // 確定済み店舗
    if (reservation.store_id && stores[reservation.store_id]) {
      return {
        name: stores[reservation.store_id].name,
        address: stores[reservation.store_id].address,
        color: stores[reservation.store_id].color
      }
    }

    // 貸切予約の確定店舗
    if (reservation.candidate_datetimes) {
      const candidateDatetimes = reservation.candidate_datetimes
      if (candidateDatetimes.confirmedStore?.storeId) {
        const storeId = candidateDatetimes.confirmedStore.storeId
        if (stores[storeId]) {
          return {
            name: stores[storeId].name,
            address: stores[storeId].address,
            color: stores[storeId].color
          }
        }
        // 店舗情報がまだ取得できていない場合、候補データから名前を取得
        return {
          name: candidateDatetimes.confirmedStore.storeName || '店舗未定',
          address: '',
          color: undefined
        }
      }

      // 希望店舗（確定前） - requestedStoresは店舗ID文字列の配列
      if (candidateDatetimes.requestedStores && candidateDatetimes.requestedStores.length > 0) {
        const firstStoreId = candidateDatetimes.requestedStores[0]
        if (firstStoreId && stores[firstStoreId]) {
          return {
            name: stores[firstStoreId].name,
            address: stores[firstStoreId].address,
            color: stores[firstStoreId].color
          }
        }
        return {
          name: '店舗未定',
          address: '',
          color: undefined
        }
      }
    }

    return null
  }

  if (loading) {
    return (
      <Card className="shadow-none border">
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  const upcomingReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) >= new Date() && r.status === 'confirmed'
  )
  const pastReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
  )
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled')
  const pendingPrivateBookings = reservations.filter(
    (r) => r.reservation_source === 'web_private' && 
           ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(r.status)
  )

  const getPrivateBookingStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
      case 'pending_gm':
        return { label: 'GM回答待ち', color: 'bg-amber-100 text-amber-800' }
      case 'gm_confirmed':
      case 'pending_store':
        return { label: '店舗確認中', color: 'bg-blue-100 text-blue-800' }
      default:
        return { label: '調整中', color: 'bg-gray-100 text-gray-800' }
    }
  }

  return (
    <div className="space-y-6">
      {/* 調整中の貸切申込み */}
      {pendingPrivateBookings.length > 0 && (
        <Card className="shadow-none border border-amber-200">
          <CardHeader className="bg-amber-50">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              日程調整中の貸切申込み ({pendingPrivateBookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {pendingPrivateBookings.map((reservation) => {
                const storeInfo = getStoreInfo(reservation)
                const statusInfo = getPrivateBookingStatusLabel(reservation.status)
                const candidateDatetimes = reservation.candidate_datetimes as {
                  candidates?: Array<{ date: string; time_slot: string }>
                  confirmedDateTime?: { date: string; time_slot: string }
                } | null
                const candidateCount = candidateDatetimes?.candidates?.length || 0
                const confirmedDate = candidateDatetimes?.confirmedDateTime
                
                return (
                  <div
                    key={reservation.id}
                    className="p-4 border border-amber-200 rounded-lg hover:bg-amber-50/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                        {(() => {
                          const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
                          return scenarioMasterId && scenarioImages[scenarioMasterId] ? (
                            <OptimizedImage
                              src={scenarioImages[scenarioMasterId]}
                              alt={reservation.title}
                              className="w-full h-full object-cover"
                              responsive={true}
                              srcSetSizes={[48, 96, 192]}
                              breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                              useWebP={true}
                              quality={85}
                              fallback={
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                  No Image
                                </div>
                              }
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No Image
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={statusInfo.color}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <h4 className="font-medium text-sm truncate">{formatTitle(reservation)}</h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">希望日</div>
                        <div className="text-sm font-medium">
                          {confirmedDate ? (
                            `${confirmedDate.date} ${confirmedDate.time_slot}`
                          ) : (
                            `候補${candidateCount}件`
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">人数</div>
                        <div className="text-sm font-medium">{reservation.participant_count}名</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">金額</div>
                        <div className="text-sm font-medium">{formatCurrency(reservation.final_price)}</div>
                      </div>
                    </div>

                    {storeInfo && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-muted-foreground mb-1">希望会場</div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: storeInfo.color || undefined }} />
                          <span className="text-sm font-medium" style={{ color: storeInfo.color || undefined }}>
                            {storeInfo.name}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                      予約番号: {reservation.reservation_number}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 参加予定の予約 */}
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            参加予定の予約 ({upcomingReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              参加予定の予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReservations.map((reservation) => {
                const storeInfo = getStoreInfo(reservation)
                return (
                  <div
                    key={reservation.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-blue-50"
                  >
                    {/* ヘッダー: タイトルとバッジ */}
                    <div className="flex items-start gap-3 mb-3">
                      {/* シナリオ画像 */}
                      <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                        {(() => {
                          const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
                          return scenarioMasterId && scenarioImages[scenarioMasterId] ? (
                          <OptimizedImage
                            src={scenarioImages[scenarioMasterId]}
                            alt={reservation.title}
                            className="w-full h-full object-cover"
                            responsive={true}
                            srcSetSizes={[48, 96, 192]}
                            breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                            useWebP={true}
                            quality={85}
                            fallback={
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                No Image
                              </div>
                            }
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        )
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="default" className="bg-blue-100 text-blue-800 text-xs flex-shrink-0">
                            参加予定
                          </Badge>
                          {(() => {
                            const status = getPerformanceStatus(reservation)
                            if (!status) return null
                            return (
                              <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>
                                {status.label}
                              </span>
                            )
                          })()}
                        </div>
                        <h4 className="font-medium text-sm truncate">{formatTitle(reservation)}</h4>
                      </div>
                    </div>

                    {/* 情報グリッド */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">
                          {titleHasDate(reservation.title) ? '開始時間' : '日時'}
                        </div>
                        <div className="text-sm font-medium">
                          {titleHasDate(reservation.title) 
                            ? formatTime(reservation.requested_datetime)
                            : formatDateTime(reservation.requested_datetime)
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">人数</div>
                        <div className="text-sm font-medium">{reservation.participant_count}名</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">金額</div>
                        <div className="text-sm font-medium">{formatCurrency(reservation.final_price)}</div>
                      </div>
                    </div>

                    {/* 会場情報 */}
                    {storeInfo && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-muted-foreground mb-1">会場</div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" style={{ color: storeInfo.color || undefined }} />
                          <span className="text-sm font-medium" style={{ color: storeInfo.color || undefined }}>
                            {storeInfo.name}
                          </span>
                        </div>
                        {storeInfo.address && (
                          <div className="ml-5 text-xs text-muted-foreground mt-0.5">{storeInfo.address}</div>
                        )}
                      </div>
                    )}

                    {/* アクションボタン */}
                    <div className="mt-4 pt-3 border-t space-y-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(reservation)}
                          className="flex-1"
                        >
                          <Users className="h-4 w-4 mr-1" />
                          人数変更
                        </Button>
                        {((reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id) && reservation.schedule_event_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDateChangeClick(reservation)}
                            className="flex-1"
                          >
                            <CalendarDays className="h-4 w-4 mr-1" />
                            日程変更
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {canCancel(reservation) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelClick(reservation)}
                            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4 mr-1" />
                            キャンセル
                          </Button>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {getCancelDeadlineHours(reservation) <= 0
                              ? '公演開始後はキャンセルできません'
                              : `${getCancelDeadlineHours(reservation)}時間前を過ぎたためキャンセル不可`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参加済みの予約 */}
      <Card className="shadow-none border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            参加済みの予約 ({pastReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              参加済みの予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {pastReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* ヘッダー: タイトルとバッジ */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* シナリオ画像 */}
                    <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                      {reservation.scenario_id && scenarioImages[reservation.scenario_id] ? (
                        <OptimizedImage
                          src={scenarioImages[reservation.scenario_id]}
                          alt={reservation.title}
                          className="w-full h-full object-cover"
                          responsive={true}
                          srcSetSizes={[48, 96, 192]}
                          breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                          useWebP={true}
                          quality={85}
                          fallback={
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No Image
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          参加済み
                        </Badge>
                      </div>
                      <h4 className="font-medium text-sm truncate">{formatTitle(reservation)}</h4>
                    </div>
                  </div>

                  {/* 情報グリッド */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {titleHasDate(reservation.title) ? '開始時間' : '日時'}
                      </div>
                      <div className="text-sm font-medium">
                        {titleHasDate(reservation.title) 
                          ? formatTime(reservation.requested_datetime)
                          : formatDateTime(reservation.requested_datetime)
                        }
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">人数</div>
                      <div className="text-sm font-medium">{reservation.participant_count}名</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">金額</div>
                      <div className="text-sm font-medium">{formatCurrency(reservation.final_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* キャンセル待ち */}
      {waitlist.length > 0 && (
        <Card className="shadow-none border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              キャンセル待ち ({waitlist.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {waitlist.map((entry) => {
                const event = entry.schedule_events as unknown as { 
                  id: string
                  date: string 
                  start_time: string
                  end_time: string
                  venue: string
                  scenario: string
                } | null
                return (
                  <div
                    key={entry.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-amber-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={entry.status === 'notified' ? 'default' : 'secondary'}>
                            {entry.status === 'notified' ? '空席通知済み' : '待機中'}
                          </Badge>
                        </div>
                        <h3 className="font-medium text-sm truncate">
                          {event?.scenario || 'シナリオ名取得中'}
                        </h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {event ? new Date(event.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' }) : '-'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event?.start_time?.slice(0, 5) || '-'}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event?.venue || '-'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {entry.participant_count}名
                          </div>
                        </div>
                        {entry.status === 'notified' && entry.expires_at && (
                          <div className="mt-2 text-xs text-amber-700 font-medium">
                            ⏰ {new Date(entry.expires_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} まで有効
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => {
                          setWaitlistCancelTarget(entry)
                          setWaitlistCancelDialogOpen(true)
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* キャンセル済みの予約 */}
      {cancelledReservations.length > 0 && (
        <Card className="shadow-none border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              キャンセル済み ({cancelledReservations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cancelledReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors opacity-60"
                >
                  {/* ヘッダー: タイトルとバッジ */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* シナリオ画像 */}
                    <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                      {(() => {
                        const scenarioMasterId = (reservation as { scenario_master_id?: string | null }).scenario_master_id ?? reservation.scenario_id
                        return scenarioMasterId && scenarioImages[scenarioMasterId] ? (
                          <OptimizedImage
                            src={scenarioImages[scenarioMasterId]}
                            alt={reservation.title}
                            className="w-full h-full object-cover"
                            responsive={true}
                            srcSetSizes={[48, 96, 192]}
                            breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                            useWebP={true}
                            quality={85}
                            fallback={
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                No Image
                              </div>
                            }
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        )
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive" className="text-xs flex-shrink-0">キャンセル</Badge>
                      </div>
                      <h4 className="font-medium text-sm line-through truncate">{formatTitle(reservation)}</h4>
                    </div>
                  </div>

                  {/* 情報グリッド */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">
                        {titleHasDate(reservation.title) ? '開始時間' : '日時'}
                      </div>
                      <div className="text-sm font-medium">
                        {titleHasDate(reservation.title) 
                          ? formatTime(reservation.requested_datetime)
                          : formatDateTime(reservation.requested_datetime)
                        }
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">人数</div>
                      <div className="text-sm font-medium">{reservation.participant_count}名</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">金額</div>
                      <div className="text-sm font-medium">{formatCurrency(reservation.final_price)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* キャンセル確認ダイアログ */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2">
                {cancelTarget && (
                  <>
                    <div className="font-medium text-foreground">{formatTitle(cancelTarget)}</div>
                    <div className="text-sm text-muted-foreground">
                      <div>日時: {formatDateTime(cancelTarget.requested_datetime)}</div>
                      <div>参加人数: {cancelTarget.participant_count}名</div>
                      <div>金額: {formatCurrency(cancelTarget.final_price)}</div>
                    </div>
                  </>
                )}
                
                {/* キャンセルポリシー表示 */}
                {cancellationPolicy && (
                  <div className="mt-4 p-4 bg-muted/50 border rounded-md space-y-3">
                    <h4 className="font-medium text-sm text-foreground">キャンセルポリシー</h4>
                    
                    {cancellationPolicy.policy && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {cancellationPolicy.policy}
                      </p>
                    )}
                    
                    {cancellationPolicy.fees && cancellationPolicy.fees.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">キャンセル料</p>
                        <ul className="text-sm space-y-1">
                          {[...cancellationPolicy.fees]
                            .sort((a, b) => b.hours_before - a.hours_before)
                            .map((fee, index) => {
                              let label: string
                              if (fee.hours_before < 0) {
                                label = '公演開始後・無断'
                              } else if (fee.hours_before === 0) {
                                label = '開演時刻まで（当日含む）'
                              } else {
                                const days = Math.floor(fee.hours_before / 24)
                                const hours = fee.hours_before % 24
                                let timeText = ''
                                if (days > 0) {
                                  timeText = `${days}日`
                                  if (hours > 0) timeText += `${hours}時間`
                                } else if (hours > 0) {
                                  timeText = `${hours}時間`
                                } else {
                                  timeText = '当日'
                                }
                                label = `${timeText}前まで`
                              }
                              return (
                                <li key={index} className="text-muted-foreground">
                                  • {label}: {fee.fee_percentage}%
                                  {fee.description && ` (${fee.description})`}
                                </li>
                              )
                            })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {!cancellationPolicy && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                    キャンセル後の返金については、店舗にお問い合わせください。
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelling ? 'キャンセル中...' : 'キャンセルする'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* キャンセル待ち解除ダイアログ */}
      <AlertDialog open={waitlistCancelDialogOpen} onOpenChange={setWaitlistCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>キャンセル待ちを解除しますか？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 mt-2">
                {waitlistCancelTarget && (() => {
                  const event = waitlistCancelTarget.schedule_events as unknown as {
                    date: string
                    start_time: string
                    scenario: string
                  } | null
                  return event ? (
                    <>
                      <div className="font-medium text-foreground">{event.scenario}</div>
                      <div className="text-sm text-muted-foreground">
                        {(() => {
                          const d = new Date(event.date)
                          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                          return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]}) ${event.start_time?.slice(0, 5) || ''}`
                        })()}
                      </div>
                    </>
                  ) : null
                })()}
                <p className="text-sm text-muted-foreground mt-2">
                  解除すると、空きが出た際の通知を受け取れなくなります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={waitlistCancelling}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!waitlistCancelTarget) return
                setWaitlistCancelling(true)
                try {
                  const { error } = await supabase
                    .from('waitlist')
                    .delete()
                    .eq('id', waitlistCancelTarget.id)
                  if (error) throw error
                  setWaitlist(prev => prev.filter(w => w.id !== waitlistCancelTarget.id))
                  toast.success('キャンセル待ちを解除しました')
                  setWaitlistCancelDialogOpen(false)
                } catch (e) {
                  logger.error('キャンセル待ち解除エラー:', e)
                  toast.error('キャンセル待ちの解除に失敗しました')
                } finally {
                  setWaitlistCancelling(false)
                }
              }}
              disabled={waitlistCancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {waitlistCancelling ? '解除中...' : '解除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 人数変更ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>参加人数を変更</DialogTitle>
            <DialogDescription>
              {editTarget && formatTitle(editTarget)}
              {editTarget && !canDecrease(editTarget) && (
                <span className="block text-amber-600 mt-1">
                  ※キャンセル期限を過ぎているため、人数の追加のみ可能です
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="participantCount">参加人数</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNewParticipantCount(Math.max(
                    editTarget && !canDecrease(editTarget) ? editTarget.participant_count : 1,
                    newParticipantCount - 1
                  ))}
                  disabled={editTarget ? (
                    canDecrease(editTarget) 
                      ? newParticipantCount <= 1 
                      : newParticipantCount <= editTarget.participant_count
                  ) : true}
                >
                  -
                </Button>
                <Input
                  id="participantCount"
                  type="number"
                  min={editTarget && !canDecrease(editTarget) ? editTarget.participant_count : 1}
                  max={getMaxAllowedParticipants()}
                  value={newParticipantCount}
                  onChange={(e) => {
                    const minValue = editTarget && !canDecrease(editTarget) ? editTarget.participant_count : 1
                    setNewParticipantCount(Math.min(getMaxAllowedParticipants(), Math.max(minValue, parseInt(e.target.value) || minValue)))
                  }}
                  className="w-20 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setNewParticipantCount(Math.min(getMaxAllowedParticipants(), newParticipantCount + 1))}
                  disabled={newParticipantCount >= getMaxAllowedParticipants()}
                >
                  +
                </Button>
                <span className="text-sm text-muted-foreground">名</span>
              </div>
              {maxParticipants && (
                <p className="text-xs text-muted-foreground">
                  残り空席: {getMaxAllowedParticipants()}名
                </p>
              )}
            </div>
            {editTarget && newParticipantCount !== editTarget.participant_count && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
                <div>変更前: {editTarget.participant_count}名 → 変更後: {newParticipantCount}名</div>
                <div className="mt-1">
                  料金: {formatCurrency(editTarget.final_price)} → {formatCurrency((editTarget.final_price / editTarget.participant_count) * newParticipantCount)}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={updating}>
              キャンセル
            </Button>
            <Button
              onClick={handleEditConfirm}
              disabled={updating || !!(editTarget && newParticipantCount === editTarget.participant_count)}
            >
              {updating ? '変更中...' : '変更を保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 日程変更ダイアログ */}
      <Dialog open={dateChangeDialogOpen} onOpenChange={setDateChangeDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              日程を変更
            </DialogTitle>
            <DialogDescription>
              「{dateChangeTarget?.title}」の別の公演日程を選択してください
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingEvents ? (
              <div className="text-center py-8 text-muted-foreground">
                公演情報を取得中...
              </div>
            ) : availableEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p>変更可能な公演がありません</p>
                <p className="text-xs mt-1">
                  {dateChangeTarget?.participant_count}名以上の空席がある公演がありません
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableEvents.map(event => {
                  const available = event.max_participants - event.current_participants
                  const isSelected = selectedNewEventId === event.id
                  return (
                    <button
                      key={event.id}
                      onClick={() => setSelectedNewEventId(event.id)}
                      className={`w-full p-3 border rounded-lg text-left transition-colors ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {formatEventDate(event.date)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {event.start_time.slice(0, 5)}〜{event.end_time?.slice(0, 5) || ''}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {event.store_name}
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={available > 3 ? 'default' : 'secondary'}>
                            残り{available}席
                          </Badge>
                          {isSelected && (
                            <div className="text-xs text-blue-600 mt-1">選択中</div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 変更内容プレビュー */}
            {dateChangeTarget && selectedNewEventId && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-800 mb-2">変更内容</div>
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">変更前</div>
                    <div>{dateChangeTarget.requested_datetime?.split('T')[0]}</div>
                  </div>
                  <ArrowRight className="h-4 w-4" />
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">変更後</div>
                    <div>{availableEvents.find(e => e.id === selectedNewEventId)?.date}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDateChangeDialogOpen(false)} 
              disabled={changingDate}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleDateChangeConfirm}
              disabled={changingDate || !selectedNewEventId}
            >
              {changingDate ? '変更中...' : '日程を変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}



