import { logger } from '@/utils/logger'
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Calendar, MapPin, Users, Clock, CreditCard, Ticket, ExternalLink } from 'lucide-react'
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
import { toast } from 'sonner'
import { reservationApi } from '@/lib/reservationApi'
import { useAuth } from '@/contexts/AuthContext'

const THEME = {
  primary: '#dc2626',
  primaryLight: '#fef2f2',
  primaryHover: '#b91c1c',
}

const DEFAULT_CANCEL_DEADLINE_HOURS = 24

interface ReservationDetail {
  id: string
  reservation_number: string
  title: string
  requested_datetime: string
  participant_count: number
  unit_price: number | null  // 予約時の1人あたり料金
  final_price: number
  status: string
  payment_status: string
  notes: string | null
  scenario_id: string | null
  store_id: string | null
  organization_id: string | null
  created_at: string
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

  // URLから予約IDを取得 (/mypage/reservation/:id)
  const reservationId = location.pathname.split('/').pop()

  useEffect(() => {
    if (!reservationId) return
    fetchReservation()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reservationId変更時のみ実行
  }, [reservationId])

  const fetchReservation = async () => {
    logger.log('Fetching reservation with ID:', reservationId)
    try {
      // 予約データを取得
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select(`
          id, reservation_number, title, requested_datetime, 
          participant_count, unit_price, final_price, status, payment_status, 
          notes, scenario_id, store_id, organization_id, created_at, schedule_event_id
        `)
        .eq('id', reservationId)
        .single()
      
      logger.log('Reservation data:', resData, 'Error:', resError)
      
      if (resError) throw resError
      
      // schedule_eventを別途取得
      let scheduleEvent = null
      if (resData.schedule_event_id) {
        const { data: eventData, error: eventError } = await supabase
          .from('schedule_events')
          .select('date, start_time, category, current_participants, max_participants')
          .eq('id', resData.schedule_event_id)
          .single()
        logger.log('Schedule event data:', eventData, 'Error:', eventError)
        if (eventData) {
          scheduleEvent = {
            date: eventData.date,
            start_time: eventData.start_time,
            is_private_booking: eventData.category === 'private',
            current_participants: eventData.current_participants,
            max_participants: eventData.max_participants
          }
        }
      } else {
        logger.log('No schedule_event_id found')
      }
      
      setReservation({
        ...resData,
        schedule_events: scheduleEvent || undefined
      })

      // 店舗データを取得
      if (resData.store_id) {
        const { data: storeData } = await supabase
          .from('stores')
          .select('id, name, address')
          .eq('id', resData.store_id)
          .single()
        
        if (storeData) setStore(storeData)

        const { data: settingsData } = await supabase
          .from('reservation_settings')
          .select('cancellation_policy, cancellation_deadline_hours')
          .eq('store_id', resData.store_id)
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

      // シナリオデータを取得
      if (resData.scenario_id) {
        const { data: scenarioData } = await supabase
          .from('scenarios')
          .select('id, title, slug, key_visual_url, duration, player_count_min, player_count_max')
          .eq('id', resData.scenario_id)
          .single()
        
        logger.log('Scenario data loaded:', scenarioData)
        if (scenarioData) setScenario(scenarioData)
      }
    } catch (error) {
      logger.error('Failed to fetch reservation:', error)
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
  const getStatusDisplay = (status: string) => {
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
  const statusDisplay = getStatusDisplay(reservation.status)
  const paymentDisplay = getPaymentStatusDisplay(reservation.payment_status)
  const canCancel = (() => {
    if (!user || reservation.status !== 'confirmed') return false
    const eventDateTime = new Date(reservation.requested_datetime)
    const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
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
                    {scenario.player_count_min}〜{scenario.player_count_max}名
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
            {reservation.payment_status !== 'pending' && (
              <span 
                className="px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: paymentDisplay.bg, color: paymentDisplay.color, borderRadius: 0 }}
              >
                {paymentDisplay.label}
              </span>
            )}
          </div>
        </div>

        {/* キャンセル */}
        {reservation.status === 'confirmed' && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">キャンセル</p>
                <p className="text-xs text-gray-600">
                  公演開始の{cancelDeadlineHours}時間前までキャンセル可能です。
                </p>
                {cancellationPolicy && (
                  <p className="text-xs text-gray-500 whitespace-pre-wrap mt-2">
                    {cancellationPolicy}
                  </p>
                )}
                {!canCancel && (
                  <p className="text-xs text-red-600 mt-2">
                    キャンセル期限を過ぎているため、オンラインでのキャンセルはできません。
                  </p>
                )}
              </div>
              <Button
                variant="destructive"
                onClick={() => setCancelDialogOpen(true)}
                disabled={!canCancel}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}

        {/* 公演日時 */}
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

        {/* 会場 */}
        {store && (
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

        {/* 予約情報 */}
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
              <span className="font-bold">{reservation.participant_count}名</span>
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

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">予約日</span>
              <span className="text-sm text-gray-600">
                {new Date(reservation.created_at).toLocaleDateString('ja-JP')}
              </span>
            </div>
          </div>
        </div>

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
    </div>
  )
}

