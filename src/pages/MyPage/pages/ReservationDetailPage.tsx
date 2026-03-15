import { logger } from '@/utils/logger'
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Calendar, MapPin, Users, Clock, CreditCard, Ticket, ExternalLink, Share2 } from 'lucide-react'
import { InviteShareButton } from '@/components/InviteShareButton'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { reservationApi } from '@/lib/reservationApi'
import { useAuth } from '@/contexts/AuthContext'

const THEME = {
  primary: '#dc2626',
  primaryLight: '#fef2f2',
  primaryHover: '#b91c1c',
}

const DEFAULT_CANCEL_DEADLINE_HOURS = 24

interface CandidateDateTime {
  order: number
  date: string
  timeSlot: string
  startTime: string
  endTime: string
  status: string
}

interface RequestedStore {
  storeId: string
  storeName: string
  storeShortName?: string
}

interface CandidateDatetimes {
  candidates?: CandidateDateTime[]
  requestedStores?: RequestedStore[]
  confirmedStore?: { storeId: string; storeName?: string }
  confirmedDateTime?: { date: string; timeSlot: string }
}

interface ReservationDetail {
  id: string
  reservation_number: string
  title: string
  requested_datetime: string
  participant_count: number
  unit_price: number | null
  final_price: number
  status: string
  payment_status: string
  notes: string | null
  scenario_id: string | null
  store_id: string | null
  organization_id: string | null
  created_at: string
  schedule_event_id?: string | null
  reservation_source?: string | null
  candidate_datetimes?: CandidateDatetimes | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  schedule_events?: {
    date: string
    start_time: string
    is_private_booking?: boolean
    current_participants?: number
    max_participants?: number
  }
}

interface Store {
  id: string
  name: string
  address: string | null
}

interface Scenario {
  id: string
  title: string
  slug: string
  key_visual_url: string | null
  duration: number | null
  player_count_min: number | null
  player_count_max: number | null
}

interface Organization {
  id: string
  slug: string
}

export function ReservationDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [reservation, setReservation] = useState<ReservationDetail | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationPolicy, setCancellationPolicy] = useState<string | null>(null)
  const [cancelDeadlineHours, setCancelDeadlineHours] = useState(DEFAULT_CANCEL_DEADLINE_HOURS)
  // 人数変更ダイアログ
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editParticipantCount, setEditParticipantCount] = useState<number>(0)
  const [editing, setEditing] = useState(false)
  const [remainingSeats, setRemainingSeats] = useState<number>(0)

  // URLから予約IDを取得 (/mypage/reservation/:id)
  const reservationId = location.pathname.split('/').pop()

  useEffect(() => {
    if (!reservationId) return
    fetchReservation()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reservationId変更時のみ実行
  }, [reservationId])

  const fetchReservation = async () => {
    try {
      // 予約データを取得
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select(`
          id, reservation_number, title, requested_datetime, 
          participant_count, unit_price, final_price, status, payment_status, 
          notes, scenario_id, scenario_master_id, store_id, organization_id, created_at, schedule_event_id,
          reservation_source, candidate_datetimes, customer_name, customer_email, customer_phone
        `)
        .eq('id', reservationId)
        .maybeSingle()
      
      // 列挙ノイズ対策: 存在しない/権限なし/取得失敗を区別せず同じUXに寄せる
      if (resError || !resData) {
        logger.warn('Reservation fetch failed or not accessible')
        toast.error('予約が見つかりません')
        setReservation(null)
        return
      }
      
      // schedule_eventを別途取得
      let scheduleEvent = null
      let eventStoreId: string | null = null
      if (resData.schedule_event_id) {
        const { data: eventData, error: eventError } = await supabase
          .from('schedule_events')
          .select('date, start_time, category, current_participants, max_participants, store_id')
          .eq('id', resData.schedule_event_id)
          .maybeSingle()
        if (!eventError && eventData) {
          scheduleEvent = {
            date: eventData.date,
            start_time: eventData.start_time,
            is_private_booking: eventData.category === 'private',
            current_participants: eventData.current_participants,
            max_participants: eventData.max_participants
          }
          eventStoreId = eventData.store_id
        }
      }
      
      setReservation({
        ...resData,
        schedule_events: scheduleEvent || undefined
      })

      // 店舗データを取得（スケジュールイベントのstore_idを優先）
      const storeIdToUse = eventStoreId || resData.store_id
      if (storeIdToUse) {
        const { data: storeData } = await supabase
          .from('stores')
          .select('id, name, address')
          .eq('id', storeIdToUse)
          .single()
        
        if (storeData) setStore(storeData)

        const { data: settingsData } = await supabase
          .from('reservation_settings')
          .select('cancellation_policy, cancellation_deadline_hours')
          .eq('store_id', storeIdToUse)
          .maybeSingle()

        if (settingsData) {
          setCancellationPolicy(settingsData.cancellation_policy || null)
          setCancelDeadlineHours(settingsData.cancellation_deadline_hours || DEFAULT_CANCEL_DEADLINE_HOURS)
        }
      }

      // 組織データを取得（シナリオ詳細リンク用）
      if (resData.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('id, slug')
          .eq('id', resData.organization_id)
          .single()
        
        if (orgData) setOrganization(orgData)
      }

      // シナリオデータを取得（scenario_master_id を優先、organization_scenarios_with_master から取得して slug も取得）
      const scenarioMasterId = (resData as { scenario_master_id?: string | null }).scenario_master_id ?? resData.scenario_id
      if (scenarioMasterId) {
        // organization_id があれば organization_scenarios_with_master から slug 付きで取得
        if (resData.organization_id) {
          const { data: viewData } = await supabase
            .from('organization_scenarios_with_master')
            .select('id, title, slug, key_visual_url, duration, player_count_min, player_count_max')
            .eq('id', scenarioMasterId)
            .eq('organization_id', resData.organization_id)
            .maybeSingle()
          if (viewData) {
            setScenario({ ...viewData, slug: viewData.slug ?? viewData.id })
            logger.log('Scenario data loaded (view):', viewData)
          } else {
            // フォールバック: scenario_masters から取得
            const { data: scenarioData } = await supabase
              .from('scenario_masters')
              .select('id, title, key_visual_url, official_duration, player_count_min, player_count_max')
              .eq('id', scenarioMasterId)
              .single()
            if (scenarioData) {
              setScenario({
                id: scenarioData.id,
                title: scenarioData.title,
                slug: scenarioData.id,
                key_visual_url: scenarioData.key_visual_url,
                duration: scenarioData.official_duration ?? null,
                player_count_min: scenarioData.player_count_min,
                player_count_max: scenarioData.player_count_max,
              })
            }
          }
        } else {
          // organization_id がない場合: scenario_masters から取得
          const { data: scenarioData } = await supabase
            .from('scenario_masters')
            .select('id, title, key_visual_url, official_duration, player_count_min, player_count_max')
            .eq('id', scenarioMasterId)
            .single()
          if (scenarioData) {
            setScenario({
              id: scenarioData.id,
              title: scenarioData.title,
              slug: scenarioData.id,
              key_visual_url: scenarioData.key_visual_url,
              duration: scenarioData.official_duration ?? null,
              player_count_min: scenarioData.player_count_min,
              player_count_max: scenarioData.player_count_max,
            })
          }
        }
      }
    } catch (error) {
      // 列挙ノイズ対策: 例外も同様に扱う
      logger.error('Failed to fetch reservation:', error)
      toast.error('予約が見つかりません')
      setReservation(null)
    } finally {
      setLoading(false)
    }
  }

  // 公演日時を取得（schedule_eventsを優先）
  const getPerformanceDateTime = () => {
    if (reservation?.schedule_events?.date) {
      return {
        date: reservation.schedule_events.date,
        time: reservation.schedule_events.start_time
      }
    }
    if (reservation?.requested_datetime) {
      const d = new Date(reservation.requested_datetime)
      return {
        date: d.toISOString().split('T')[0],
        time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
      }
    }
    return { date: '', time: '' }
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
  }

  // ステータス表示
  const getStatusDisplay = (status: string, isPrivateBooking: boolean = false) => {
    if (isPrivateBooking) {
      const privateStatusMap: Record<string, { label: string; color: string; bg: string }> = {
        'pending': { label: 'GM回答待ち', color: '#d97706', bg: '#fffbeb' },
        'pending_gm': { label: 'GM回答待ち', color: '#d97706', bg: '#fffbeb' },
        'gm_confirmed': { label: '店舗確認中', color: '#2563eb', bg: '#eff6ff' },
        'pending_store': { label: '店舗確認中', color: '#2563eb', bg: '#eff6ff' },
        'confirmed': { label: '日程確定', color: '#16a34a', bg: '#f0fdf4' },
        'cancelled': { label: 'キャンセル済み', color: '#dc2626', bg: '#fef2f2' },
      }
      return privateStatusMap[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
    }
    const statusMap: Record<string, { label: string; color: string; bg: string }> = {
      'confirmed': { label: '予約確定', color: '#16a34a', bg: '#f0fdf4' },
      'pending': { label: '確認中', color: '#ca8a04', bg: '#fefce8' },
      'cancelled': { label: 'キャンセル済み', color: '#dc2626', bg: '#fef2f2' },
    }
    return statusMap[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  }

  // 支払いステータス表示
  const getPaymentStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; bg: string }> = {
      'paid': { label: '支払い済み', color: '#16a34a', bg: '#f0fdf4' },
      'unpaid': { label: '未払い', color: '#ca8a04', bg: '#fefce8' },
      'refunded': { label: '返金済み', color: '#6b7280', bg: '#f3f4f6' },
    }
    return statusMap[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">予約が見つかりませんでした</p>
          <Button onClick={() => navigate('/mypage')} style={{ borderRadius: 0 }}>
            マイページに戻る
          </Button>
        </div>
      </div>
    )
  }

  const perf = getPerformanceDateTime()
  const isPrivateBookingRequest = reservation.reservation_source === 'web_private'
  const isPendingPrivate = isPrivateBookingRequest && ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(reservation.status)
  const statusDisplay = getStatusDisplay(reservation.status, isPrivateBookingRequest)
  const paymentDisplay = getPaymentStatusDisplay(reservation.payment_status)
  const canCancel = (() => {
    if (!user || reservation.status !== 'confirmed') return false
    
    // schedule_eventsがある場合はdate + start_timeを使用（より正確）
    let eventDateTime: Date
    if (reservation.schedule_events?.date && reservation.schedule_events?.start_time) {
      // schedule_eventsのdate（YYYY-MM-DD）とstart_time（HH:MM:SS）を組み合わせてJST日時を作成
      const dateStr = reservation.schedule_events.date
      const timeStr = reservation.schedule_events.start_time
      // JSTとして解釈するため、+09:00を付与
      eventDateTime = new Date(`${dateStr}T${timeStr}+09:00`)
    } else {
      // フォールバック: requested_datetimeを使用
      eventDateTime = new Date(reservation.requested_datetime)
    }
    
    const now = new Date()
    const hoursUntilEvent = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    // デバッグログ
    logger.log('キャンセル判定（詳細）:', {
      scheduleDate: reservation.schedule_events?.date,
      scheduleTime: reservation.schedule_events?.start_time,
      eventDateTime: eventDateTime.toISOString(),
      now: now.toISOString(),
      hoursUntilEvent: hoursUntilEvent.toFixed(2),
      cancelDeadlineHours,
      canCancel: hoursUntilEvent >= cancelDeadlineHours
    })
    
    return hoursUntilEvent >= cancelDeadlineHours
  })()

  const handleCancelConfirm = async () => {
    setCancelling(true)
    try {
      await reservationApi.cancel(reservation.id, 'お客様によるキャンセル')
      toast.success('予約をキャンセルしました')
      navigate('/mypage')
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      toast.error('キャンセルに失敗しました')
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
    }
  }

  // 人数変更ダイアログを開く
  const handleEditClick = async () => {
    if (!reservation) return
    
    // 残席をリアルタイムで計算（DBから最新の参加者数を取得）
    let currentParticipants = reservation.schedule_events?.current_participants || 0
    const maxParticipants = reservation.schedule_events?.max_participants || scenario?.player_count_max || 4
    
    // schedule_event_idがある場合、確定予約の合計を直接計算
    if (reservation.schedule_event_id) {
      const { data: sumData } = await supabase
        .from('reservations')
        .select('participant_count')
        .eq('schedule_event_id', reservation.schedule_event_id)
        .eq('status', 'confirmed')
      
      if (sumData) {
        currentParticipants = sumData.reduce((sum, r) => sum + (r.participant_count || 0), 0)
      }
    }
    
    const otherParticipants = currentParticipants - reservation.participant_count
    const available = maxParticipants - otherParticipants
    
    setRemainingSeats(available)
    setEditParticipantCount(reservation.participant_count)
    setEditDialogOpen(true)
  }

  // 人数変更処理
  const handleEditConfirm = async () => {
    if (!reservation || editParticipantCount === reservation.participant_count) {
      setEditDialogOpen(false)
      return
    }

    const oldCount = reservation.participant_count
    const countDiff = editParticipantCount - oldCount

    setEditing(true)
    try {
      logger.log('人数変更開始:', { reservationId: reservation.id, newCount: editParticipantCount })
      await reservationApi.updateParticipantCount(reservation.id, editParticipantCount)
      
      // 人数が減少した場合、キャンセル待ち通知を送信
      logger.log('人数変更チェック:', { 
        countDiff, 
        schedule_event_id: reservation.schedule_event_id, 
        organization_id: reservation.organization_id 
      })
      
      if (countDiff < 0 && reservation.schedule_event_id) {
        try {
          // 公演情報を取得（organization_idも含めて取得）
          const { data: eventData } = await supabase
            .from('schedule_events')
            .select('date, start_time, end_time, scenario, venue, organization_id')
            .eq('id', reservation.schedule_event_id)
            .single()
          
          const orgId = reservation.organization_id || eventData?.organization_id
          logger.log('キャンセル待ち通知準備:', { eventData, orgId })
          
          if (eventData && orgId) {
            const result = await supabase.functions.invoke('notify-waitlist', {
              body: {
                organizationId: orgId,
                scheduleEventId: reservation.schedule_event_id,
                freedSeats: Math.abs(countDiff), // 減少した人数分が空席
                scenarioTitle: reservation.title || eventData.scenario || '',
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
      setEditDialogOpen(false)
      // 予約データを再取得
      await fetchReservation()
    } catch (error) {
      logger.error('人数変更エラー:', error)
      const errorMessage = error instanceof Error ? error.message : '人数変更に失敗しました'
      toast.error(errorMessage)
    } finally {
      setEditing(false)
    }
  }

  // 人数変更可能かどうか
  // キャンセル期限後でも人数の「追加」は許可（減少は不可）
  const canEdit = reservation?.status === 'confirmed'
  // 人数を減らせるかどうか（キャンセル期限内のみ）
  const canDecrease = reservation?.status === 'confirmed' && canCancel

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/mypage')}
            className="p-2 -ml-2 hover:bg-gray-100 transition-colors"
            style={{ borderRadius: 0 }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">予約詳細</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* シナリオ画像・タイトル */}
        {scenario && (
          <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 0 }}>
            {scenario.key_visual_url && (
              <div className="relative aspect-[16/9] bg-gray-900 overflow-hidden">
                <div 
                  className="absolute inset-0 scale-110"
                  style={{
                    backgroundImage: `url(${scenario.key_visual_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(20px) brightness(0.5)',
                  }}
                />
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title}
                  className="relative w-full h-full object-contain"
                />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-gray-900">{scenario.title}</h2>
                {scenario.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    シナリオ詳細
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {scenario.duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    約{scenario.duration}分
                  </span>
                )}
                {scenario.player_count_min && scenario.player_count_max && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {scenario.player_count_min === scenario.player_count_max 
                      ? `${scenario.player_count_max}名`
                      : `${scenario.player_count_min}〜${scenario.player_count_max}名`
                    }
                  </span>
                )}
              </div>
              {/* 公演成立状況 */}
              {reservation?.schedule_events && !reservation.schedule_events.is_private_booking && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {(() => {
                    const current = reservation.schedule_events.current_participants || 0
                    const max = reservation.schedule_events.max_participants || scenario.player_count_max || 0
                    const min = scenario.player_count_min || 1
                    
                    if (current >= max) {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700">
                          ✓ 満席（{current}/{max}名）
                        </span>
                      )
                    } else if (current >= min) {
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700">
                          ✓ 公演成立（{current}/{max}名）
                        </span>
                      )
                    } else {
                      const remaining = min - current
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700">
                          あと{remaining}名で公演成立（{current}/{max}名）
                        </span>
                      )
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 予約ステータス */}
        <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
          <div className="flex items-center gap-3">
            <span 
              className="px-3 py-1 text-sm font-medium"
              style={{ backgroundColor: statusDisplay.bg, color: statusDisplay.color, borderRadius: 0 }}
            >
              {statusDisplay.label}
            </span>
            {/* 支払い済みまたは返金済みの場合のみ表示（pendingは現地払いなので非表示） */}
            {reservation.payment_status !== 'pending' && !isPendingPrivate && (
              <span 
                className="px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: paymentDisplay.bg, color: paymentDisplay.color, borderRadius: 0 }}
              >
                {paymentDisplay.label}
              </span>
            )}
          </div>
        </div>

        {/* 貸切申込み：候補日・希望店舗セクション */}
        {isPendingPrivate && reservation.candidate_datetimes && (
          <div className="bg-amber-50 border border-amber-200 p-4 space-y-4" style={{ borderRadius: 0 }}>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-amber-800">貸切申込み内容</h3>
            </div>
            
            {/* 候補日一覧 */}
            {reservation.candidate_datetimes.candidates && reservation.candidate_datetimes.candidates.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">希望日時（{reservation.candidate_datetimes.candidates.length}件）</p>
                <div className="space-y-2">
                  {reservation.candidate_datetimes.candidates.map((candidate, index) => {
                    const d = new Date(candidate.date)
                    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`
                    return (
                      <div 
                        key={index}
                        className="flex items-center gap-3 bg-white p-3 border border-amber-100"
                        style={{ borderRadius: 0 }}
                      >
                        <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-700 text-sm font-bold" style={{ borderRadius: 0 }}>
                          {candidate.order || index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{dateStr}</p>
                          <p className="text-sm text-gray-600">{candidate.timeSlot}（{candidate.startTime}〜{candidate.endTime}）</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* 希望店舗一覧 */}
            {reservation.candidate_datetimes.requestedStores && reservation.candidate_datetimes.requestedStores.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">希望店舗</p>
                <div className="flex flex-wrap gap-2">
                  {reservation.candidate_datetimes.requestedStores.map((store, index) => (
                    <span 
                      key={index}
                      className="px-3 py-1.5 bg-white border border-amber-200 text-sm text-gray-700"
                      style={{ borderRadius: 0 }}
                    >
                      <MapPin className="w-3.5 h-3.5 inline-block mr-1 text-amber-600" />
                      {store.storeName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* 申込情報 */}
            <div className="pt-3 border-t border-amber-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-amber-700">参加人数</span>
                <span className="font-medium text-gray-900">{reservation.participant_count}名</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700">申込日時</span>
                <span className="text-gray-600">
                  {new Date(reservation.created_at).toLocaleString('ja-JP', { 
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
              {reservation.customer_name && (
                <div className="flex justify-between">
                  <span className="text-amber-700">申込者名</span>
                  <span className="text-gray-900">{reservation.customer_name}</span>
                </div>
              )}
            </div>
            
            {/* 進捗説明 */}
            <div className="pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-600">
                {reservation.status === 'pending' || reservation.status === 'pending_gm' 
                  ? '担当GMの空き状況を確認中です。確定次第ご連絡いたします。'
                  : reservation.status === 'gm_confirmed' || reservation.status === 'pending_store'
                  ? 'GMの確認が完了しました。店舗・日程の最終確認中です。'
                  : ''}
              </p>
            </div>
          </div>
        )}

        {/* 公演日時（貸切調整中の場合は非表示） */}
        {!isPendingPrivate && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start gap-3">
              <div 
                className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
              >
                <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">公演日時</p>
                <p className="text-lg font-bold text-gray-900">{formatDate(perf.date)}</p>
                {perf.time && (
                  <p className="text-base font-medium" style={{ color: THEME.primary }}>
                    {perf.time.slice(0, 5)} 開演
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 会場（貸切調整中の場合は非表示） */}
        {!isPendingPrivate && store && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start gap-3">
              <div 
                className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}
              >
                <MapPin className="w-5 h-5" style={{ color: THEME.primary }} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">会場</p>
                <p className="font-bold text-gray-900">{store.name}</p>
                {store.address && (
                  <p className="text-sm text-gray-600 mt-1">{store.address}</p>
                )}
                {store.address && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm mt-2 hover:underline"
                    style={{ color: THEME.primary }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    地図を開く
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 予約情報（貸切調整中は簡略表示） */}
        {!isPendingPrivate && (
          <div className="bg-white border border-gray-200 p-4 space-y-4" style={{ borderRadius: 0 }}>
            <h3 className="font-bold text-gray-900">予約情報</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Ticket className="w-4 h-4" />
                  シナリオ
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">
                    {scenario?.title || reservation.title}
                  </span>
                  {scenario?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      詳細
                    </Button>
                  )}
                </div>
              </div>
              {scenario?.id && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                  onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}
                >
                  <ExternalLink className="h-3 w-3" />
                  シナリオ詳細ページを開く
                </button>
              )}

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Ticket className="w-4 h-4" />
                  予約番号
                </span>
                <span className="font-mono font-bold">{reservation.reservation_number}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  参加人数
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{reservation.participant_count}名</span>
                  {reservation.status === 'confirmed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleEditClick}
                      disabled={!canEdit}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      変更
                    </Button>
                  )}
                </div>
              </div>
            
            {reservation.schedule_events?.is_private_booking ? (
              // 貸切公演の場合：合計金額を表示
              <>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    お支払い金額
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-lg" style={{ color: THEME.primary }}>
                      ¥{(reservation.final_price || 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {reservation.payment_status === 'paid' ? '決済済み' : '現地決済'}
                    </span>
                  </div>
                </div>
                {reservation.unit_price && (
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-500">1人あたり</span>
                    <span className="text-sm text-gray-600">
                      ¥{reservation.unit_price.toLocaleString()}/人
                    </span>
                  </div>
                )}
              </>
            ) : (
              // 通常公演の場合：unit_price（予約時の1人あたり料金）を表示
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  参加料金
                </span>
                <div className="text-right">
                  <span className="font-bold text-lg" style={{ color: THEME.primary }}>
                    ¥{(reservation.unit_price || 0).toLocaleString()}/人
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {reservation.payment_status === 'paid' ? '決済済み' : '現地決済'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">予約日</span>
              <span className="text-sm text-gray-600">
                {new Date(reservation.created_at).toLocaleDateString('ja-JP')}
              </span>
            </div>

            {/* キャンセル */}
            {reservation.status === 'confirmed' && (
              <div className="pt-3 mt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">予約キャンセル</p>
                    {!canCancel && (
                      <p className="text-xs text-red-500 mt-1">
                        期限（{cancelDeadlineHours}時間前）を過ぎています
                      </p>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => setCancelDialogOpen(true)}
                    disabled={!canCancel}
                  >
                    キャンセル
                  </Button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* 備考 */}
        {reservation.notes && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <h3 className="font-bold text-gray-900 mb-2">備考</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{reservation.notes}</p>
          </div>
        )}

        {/* シナリオ詳細へのリンク */}
        {scenario && (
          <Button
            variant="outline"
            className="w-full"
            style={{ borderColor: THEME.primary, color: THEME.primary, borderRadius: 0 }}
            onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}
          >
            シナリオ詳細を見る
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        )}

        {/* 友達を誘うボタン */}
        {scenario && reservation?.status !== 'cancelled' && (
          <div className="mt-4">
            <InviteShareButton
              scenarioTitle={scenario.title}
              scenarioId={scenario.id}
              scenarioSlug={scenario.slug}
              eventDate={reservation?.schedule_events?.date ? new Date(reservation.schedule_events.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP') : undefined}
              eventTime={reservation?.schedule_events?.start_time || undefined}
              storeName={store?.name}
              organizationSlug={organization?.slug}
              reservationId={reservation?.id}
              className="w-full"
            />
          </div>
        )}
      </div>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              キャンセル後は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm} disabled={cancelling}>
              {cancelling ? '処理中...' : 'キャンセルする'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 人数変更ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加人数を変更</DialogTitle>
            <DialogDescription>
              変更後の参加人数を選択してください。（残席: {remainingSeats}名）
              {!canDecrease && reservation && (
                <span className="block text-amber-600 mt-1">
                  ※キャンセル期限を過ぎているため、人数の追加のみ可能です
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={String(editParticipantCount)}
              onValueChange={(val) => setEditParticipantCount(Number(val))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* キャンセル期限後は現在の人数以上のみ選択可能 */}
                {Array.from({ length: remainingSeats }, (_, i) => i + 1)
                  .filter((num) => canDecrease || num >= (reservation?.participant_count || 1))
                  .map((num) => (
                    <SelectItem key={num} value={String(num)}>
                      {num}名
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editing}>
              キャンセル
            </Button>
            <Button 
              onClick={handleEditConfirm} 
              disabled={editing || editParticipantCount === reservation?.participant_count}
            >
              {editing ? '変更中...' : '変更する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

