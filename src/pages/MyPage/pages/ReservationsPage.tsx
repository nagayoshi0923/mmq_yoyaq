import { useState } from 'react'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, CheckCircle, MapPin, X, Users, AlertTriangle, CalendarDays, ArrowRight, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
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
import {
  useReservationsQuery, useEventSeatsQuery, useAvailableEventsQuery,
  useCancelReservationMutation, useUpdateParticipantsMutation,
  useCancelWaitlistMutation, useChangeDateMutation,
} from '../hooks/useReservationsQuery'

/** 貸切・オープンでキャンセル料テーブル・受付期限を切り替える */
function isPrivateReservation(reservation: Reservation): boolean {
  if (reservation.private_group_id) return true
  if (reservation.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE) return true
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

  // キャンセルダイアログ
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null)

  // 人数変更ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Reservation | null>(null)
  const [newParticipantCount, setNewParticipantCount] = useState(1)

  // キャンセル待ち解除ダイアログ
  const [waitlistCancelDialogOpen, setWaitlistCancelDialogOpen] = useState(false)
  const [waitlistCancelTarget, setWaitlistCancelTarget] = useState<Waitlist | null>(null)

  // 日程変更ダイアログ
  const [dateChangeDialogOpen, setDateChangeDialogOpen] = useState(false)
  const [dateChangeTarget, setDateChangeTarget] = useState<Reservation | null>(null)
  const [selectedNewEventId, setSelectedNewEventId] = useState<string | null>(null)

  // React Query
  const { data: rqData, isLoading: loading } = useReservationsQuery(user?.id, user?.email)
  const reservations = rqData?.reservations ?? []
  const waitlist = rqData?.waitlist ?? []
  const scenarioImages = rqData?.scenarioImages ?? {}
  const scenarioInfo = rqData?.scenarioInfo ?? {}
  const scenarioTitles = rqData?.scenarioTitles ?? {}
  const stores = rqData?.stores ?? {}
  const storeDeadlines = rqData?.storeDeadlines ?? {}
  const storePrivateDeadlines = rqData?.storePrivateDeadlines ?? {}

  const { data: eventSeatsData } = useEventSeatsQuery(editTarget?.schedule_event_id ?? undefined, editDialogOpen)
  const maxParticipants = eventSeatsData?.max_participants || null
  const currentEventParticipants = (eventSeatsData?.current_participants || 0) - (editTarget?.participant_count || 0)

  const { data: availableEvents = [], isLoading: loadingEvents } = useAvailableEventsQuery(
    dateChangeTarget?.scenario_master_id ?? undefined,
    dateChangeTarget?.schedule_event_id,
    dateChangeTarget?.participant_count ?? 1,
    dateChangeDialogOpen
  )

  const cancelMutation = useCancelReservationMutation(user?.id, user?.email)
  const updateMutation = useUpdateParticipantsMutation(user?.id, user?.email)
  const cancelWaitlistMutation = useCancelWaitlistMutation(user?.id, user?.email)
  const changeDateMutation = useChangeDateMutation(user?.id, user?.email)

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
    
    const scenarioMasterId = reservation.scenario_master_id
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
    const masterId = reservation.scenario_master_id
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
    const policy = await fetchCancellationPolicy(reservation.store_id, reservation)
    setCancellationPolicy(policy)
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return
    try {
      await cancelMutation.mutateAsync(cancelTarget.id)
      toast.success('予約をキャンセルしました')
    } catch {
      toast.error('キャンセルに失敗しました')
    } finally {
      setCancelDialogOpen(false)
      setCancelTarget(null)
    }
  }

  // 人数変更処理
  const handleEditClick = (reservation: Reservation) => {
    setEditTarget(reservation)
    setNewParticipantCount(reservation.participant_count)
    setEditDialogOpen(true)
  }

  const handleEditConfirm = async () => {
    if (!editTarget) return
    try {
      await updateMutation.mutateAsync({ reservation: editTarget, newCount: newParticipantCount })
      toast.success('参加人数を変更しました')
    } catch {
      toast.error('変更に失敗しました')
    } finally {
      setEditDialogOpen(false)
      setEditTarget(null)
    }
  }

  // 日程変更処理
  const handleDateChangeClick = (reservation: Reservation) => {
    if (!reservation.scenario_master_id) {
      toast.error('シナリオ情報がありません')
      return
    }
    setDateChangeTarget(reservation)
    setSelectedNewEventId(null)
    setDateChangeDialogOpen(true)
  }

  const handleDateChangeConfirm = async () => {
    if (!dateChangeTarget || !selectedNewEventId) return
    const newEvent = availableEvents.find(e => e.id === selectedNewEventId)
    if (!newEvent) { toast.error('選択した公演が見つかりません'); return }
    try {
      await changeDateMutation.mutateAsync({ reservation: dateChangeTarget, newEventId: selectedNewEventId, newEvent, userEmail: user?.email })
      toast.success('日程を変更しました')
    } catch (error: any) {
      toast.error(error.message || '日程変更に失敗しました')
    } finally {
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
    (r) => r.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE &&
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
                          const scenarioMasterId = reservation.scenario_master_id
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
                          const scenarioMasterId = reservation.scenario_master_id
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
                        {reservation.scenario_master_id && reservation.schedule_event_id && (
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
                      {reservation.scenario_master_id && scenarioImages[reservation.scenario_master_id] ? (
                        <OptimizedImage
                          src={scenarioImages[reservation.scenario_master_id]}
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
                        const scenarioMasterId = reservation.scenario_master_id
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
            <AlertDialogCancel disabled={cancelMutation.isPending}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelMutation.isPending ? 'キャンセル中...' : 'キャンセルする'}
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
            <AlertDialogCancel disabled={cancelWaitlistMutation.isPending}>戻る</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!waitlistCancelTarget) return
                try {
                  await cancelWaitlistMutation.mutateAsync(waitlistCancelTarget.id)
                  toast.success('キャンセル待ちを解除しました')
                  setWaitlistCancelDialogOpen(false)
                } catch {
                  toast.error('キャンセル待ちの解除に失敗しました')
                }
              }}
              disabled={cancelWaitlistMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelWaitlistMutation.isPending ? '解除中...' : '解除する'}
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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={updateMutation.isPending}>
              キャンセル
            </Button>
            <Button
              onClick={handleEditConfirm}
              disabled={updateMutation.isPending || !!(editTarget && newParticipantCount === editTarget.participant_count)}
            >
              {updateMutation.isPending ? '変更中...' : '変更を保存'}
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
              disabled={changeDateMutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleDateChangeConfirm}
              disabled={changeDateMutation.isPending || !selectedNewEventId}
            >
              {changeDateMutation.isPending ? '変更中...' : '日程を変更'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}



