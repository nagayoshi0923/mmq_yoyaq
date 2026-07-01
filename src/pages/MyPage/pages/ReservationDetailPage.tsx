import { logger } from '@/utils/logger'
import { RESERVATION_SOURCE } from '@/lib/constants'
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Calendar, MapPin, Users, Clock, CreditCard, Ticket, ExternalLink } from 'lucide-react'
import { InviteShareButton } from '@/components/InviteShareButton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  useReservationDetailQuery, useCurrentSeatsQuery,
  useCancelReservationMutation, useUpdateParticipantCountMutation,
} from '../hooks/useReservationDetailQuery'
import { toJstYmd, formatJstTime, formatJstDateJa, formatJstDateTime } from '@/utils/jstDate'

const THEME = { primary: '#dc2626', primaryLight: '#fef2f2', primaryHover: '#b91c1c' }
const DEFAULT_CANCEL_DEADLINE_HOURS = 24

export function ReservationDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const reservationId = location.pathname.split('/').pop()

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editParticipantCount, setEditParticipantCount] = useState(0)

  const { data, isLoading } = useReservationDetailQuery(reservationId)
  const reservation = data?.reservation ?? null
  const store = data?.store ?? null
  const scenario = data?.scenario ?? null
  const organization = data?.organization ?? null
  const cancellationPolicy = data?.cancellationPolicy ?? null
  const cancelDeadlineHours = data?.cancelDeadlineHours ?? DEFAULT_CANCEL_DEADLINE_HOURS

  const maxParticipants = reservation?.schedule_events?.max_participants ?? scenario?.player_count_max ?? 4
  const { data: remainingSeats = 0 } = useCurrentSeatsQuery(
    reservation?.schedule_event_id ?? undefined,
    reservation?.participant_count ?? 0,
    maxParticipants,
    editDialogOpen
  )

  const cancelMutation = useCancelReservationMutation(reservationId ?? '', () => {
    toast.success('予約をキャンセルしました')
    navigate('/mypage')
  })

  const updateCountMutation = useUpdateParticipantCountMutation(
    reservationId ?? '',
    reservation?.schedule_event_id,
    reservation?.organization_id
  )

  const handleEditClick = () => {
    if (!reservation) return
    setEditParticipantCount(reservation.participant_count)
    setEditDialogOpen(true)
  }

  const handleEditConfirm = async () => {
    if (!reservation || editParticipantCount === reservation.participant_count) { setEditDialogOpen(false); return }
    try {
      await updateCountMutation.mutateAsync({ newCount: editParticipantCount, oldCount: reservation.participant_count, reservation })
      toast.success('参加人数を変更しました')
      setEditDialogOpen(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '人数変更に失敗しました'
      toast.error(errorMessage)
    }
  }

  const getPerformanceDateTime = () => {
    if (reservation?.schedule_events?.date) return { date: reservation.schedule_events.date, time: reservation.schedule_events.start_time }
    if (reservation?.requested_datetime) {
      return { date: toJstYmd(reservation.requested_datetime), time: formatJstTime(reservation.requested_datetime) }
    }
    return { date: '', time: '' }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    return formatJstDateJa(dateStr, true)
  }

  const getStatusDisplay = (status: string, isPrivateBooking: boolean = false) => {
    if (isPrivateBooking) {
      const m: Record<string, { label: string; color: string; bg: string }> = {
        'pending': { label: 'GM回答待ち', color: '#d97706', bg: '#fffbeb' }, 'pending_gm': { label: 'GM回答待ち', color: '#d97706', bg: '#fffbeb' },
        'gm_confirmed': { label: '店舗確認中', color: '#2563eb', bg: '#eff6ff' }, 'pending_store': { label: '店舗確認中', color: '#2563eb', bg: '#eff6ff' },
        'confirmed': { label: '日程確定', color: '#16a34a', bg: '#f0fdf4' }, 'cancelled': { label: 'キャンセル済み', color: '#dc2626', bg: '#fef2f2' },
      }
      return m[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
    }
    const m: Record<string, { label: string; color: string; bg: string }> = {
      'confirmed': { label: '予約確定', color: '#16a34a', bg: '#f0fdf4' },
      'pending': { label: '確認中', color: '#ca8a04', bg: '#fefce8' },
      'cancelled': { label: 'キャンセル済み', color: '#dc2626', bg: '#fef2f2' },
    }
    return m[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  }

  const getPaymentStatusDisplay = (status: string) => {
    const m: Record<string, { label: string; color: string; bg: string }> = {
      'paid': { label: '支払い済み', color: '#16a34a', bg: '#f0fdf4' },
      'unpaid': { label: '未払い', color: '#ca8a04', bg: '#fefce8' },
      'refunded': { label: '返金済み', color: '#6b7280', bg: '#f3f4f6' },
    }
    return m[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  }

  if (isLoading) {
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
          <Button onClick={() => navigate('/mypage')} style={{ borderRadius: 0 }}>マイページに戻る</Button>
        </div>
      </div>
    )
  }

  const perf = getPerformanceDateTime()
  const isPrivateBookingRequest = reservation.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE
  const isPendingPrivate = isPrivateBookingRequest && ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(reservation.status)
  const statusDisplay = getStatusDisplay(reservation.status, isPrivateBookingRequest)
  const paymentDisplay = getPaymentStatusDisplay(reservation.payment_status)

  const canCancel = (() => {
    if (!user || reservation.status !== 'confirmed') return false
    let eventDateTime: Date
    if (reservation.schedule_events?.date && reservation.schedule_events?.start_time) {
      eventDateTime = new Date(`${reservation.schedule_events.date}T${reservation.schedule_events.start_time}+09:00`)
    } else {
      eventDateTime = new Date(reservation.requested_datetime)
    }
    const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
    logger.log('キャンセル判定:', { hoursUntilEvent: hoursUntilEvent.toFixed(2), cancelDeadlineHours })
    return hoursUntilEvent >= cancelDeadlineHours
  })()

  const canEdit = reservation?.status === 'confirmed'
  const canDecrease = reservation?.status === 'confirmed' && canCancel

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/mypage')} className="p-2 -ml-2 hover:bg-gray-100 transition-colors" style={{ borderRadius: 0 }}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">予約詳細</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {scenario && (
          <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 0 }}>
            {scenario.key_visual_url && (
              <div className="relative aspect-[16/9] bg-gray-900 overflow-hidden">
                <div className="absolute inset-0 scale-110" style={{ backgroundImage: `url(${scenario.key_visual_url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(20px) brightness(0.5)' }} />
                <img src={scenario.key_visual_url} alt={scenario.title} className="relative w-full h-full object-contain" />
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-gray-900">{scenario.title}</h2>
                {scenario.id && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}>
                    <ExternalLink className="h-3 w-3 mr-1" />シナリオ詳細
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {scenario.duration && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />約{scenario.duration}分</span>}
                {scenario.player_count_min && scenario.player_count_max && (
                  <span className="flex items-center gap-1"><Users className="w-4 h-4" />{scenario.player_count_min === scenario.player_count_max ? `${scenario.player_count_max}名` : `${scenario.player_count_min}〜${scenario.player_count_max}名`}</span>
                )}
              </div>
              {reservation?.schedule_events && !reservation.schedule_events.is_private_booking && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {(() => {
                    const current = reservation.schedule_events.current_participants || 0
                    const max = reservation.schedule_events.max_participants || scenario.player_count_max || 0
                    const min = scenario.player_count_min || 1
                    if (current >= max) return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700">✓ 満席（{current}/{max}名）</span>
                    if (current >= min) return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700">✓ 公演成立（{current}/{max}名）</span>
                    return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700">あと{min - current}名で公演成立（{current}/{max}名）</span>
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 text-sm font-medium" style={{ backgroundColor: statusDisplay.bg, color: statusDisplay.color, borderRadius: 0 }}>{statusDisplay.label}</span>
            {reservation.payment_status !== 'pending' && !isPendingPrivate && (
              <span className="px-3 py-1 text-sm font-medium" style={{ backgroundColor: paymentDisplay.bg, color: paymentDisplay.color, borderRadius: 0 }}>{paymentDisplay.label}</span>
            )}
          </div>
        </div>

        {isPendingPrivate && reservation.candidate_datetimes && (
          <div className="bg-amber-50 border border-amber-200 p-4 space-y-4" style={{ borderRadius: 0 }}>
            <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-amber-600" /><h3 className="font-bold text-amber-800">貸切申込み内容</h3></div>
            {reservation.candidate_datetimes.candidates?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">希望日時（{reservation.candidate_datetimes.candidates.length}件）</p>
                <div className="space-y-2">
                  {reservation.candidate_datetimes.candidates.map((candidate: any, index: number) => {
                    const dateStr = formatJstDateJa(candidate.date, true)
                    return (
                      <div key={index} className="flex items-center gap-3 bg-white p-3 border border-amber-100" style={{ borderRadius: 0 }}>
                        <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-700 text-sm font-bold" style={{ borderRadius: 0 }}>{candidate.order || index + 1}</span>
                        <div className="flex-1"><p className="font-medium text-gray-900">{dateStr}</p><p className="text-sm text-gray-600">{candidate.timeSlot}（{candidate.startTime}〜{candidate.endTime}）</p></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {reservation.candidate_datetimes.requestedStores?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-700 mb-2">希望店舗</p>
                <div className="flex flex-wrap gap-2">
                  {reservation.candidate_datetimes.requestedStores.map((s: any, index: number) => (
                    <span key={index} className="px-3 py-1.5 bg-white border border-amber-200 text-sm text-gray-700" style={{ borderRadius: 0 }}>
                      <MapPin className="w-3.5 h-3.5 inline-block mr-1 text-amber-600" />{s.storeName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-3 border-t border-amber-200 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-amber-700">参加人数</span><span className="font-medium text-gray-900">{reservation.participant_count}名</span></div>
              <div className="flex justify-between"><span className="text-amber-700">申込日時</span><span className="text-gray-600">{formatJstDateTime(reservation.created_at)}</span></div>
              {reservation.customer_name && <div className="flex justify-between"><span className="text-amber-700">申込者名</span><span className="text-gray-900">{reservation.customer_name}</span></div>}
            </div>
            <div className="pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-600">
                {reservation.status === 'pending' || reservation.status === 'pending_gm' ? '担当GMの空き状況を確認中です。確定次第ご連絡いたします。'
                  : reservation.status === 'gm_confirmed' || reservation.status === 'pending_store' ? 'GMの確認が完了しました。店舗・日程の最終確認中です。' : ''}
              </p>
            </div>
          </div>
        )}

        {!isPendingPrivate && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}>
                <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">公演日時</p>
                <p className="text-lg font-bold text-gray-900">{formatDate(perf.date)}</p>
                {perf.time && <p className="text-base font-medium" style={{ color: THEME.primary }}>{perf.time.slice(0, 5)} 開演</p>}
              </div>
            </div>
          </div>
        )}

        {!isPendingPrivate && store && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}>
                <MapPin className="w-5 h-5" style={{ color: THEME.primary }} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">会場</p>
                <p className="font-bold text-gray-900">{store.name}</p>
                {store.address && <p className="text-sm text-gray-600 mt-1">{store.address}</p>}
                {store.address && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm mt-2 hover:underline" style={{ color: THEME.primary }}>
                    <ExternalLink className="w-4 h-4" />地図を開く
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {!isPendingPrivate && (
          <div className="bg-white border border-gray-200 p-4 space-y-4" style={{ borderRadius: 0 }}>
            <h3 className="font-bold text-gray-900">予約情報</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2"><Ticket className="w-4 h-4" />シナリオ</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{scenario?.title || reservation.title}</span>
                  {scenario?.id && (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}>
                      <ExternalLink className="h-3 w-3 mr-1" />詳細
                    </Button>
                  )}
                </div>
              </div>
              {scenario?.id && (
                <button type="button" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1" onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}>
                  <ExternalLink className="h-3 w-3" />シナリオ詳細ページを開く
                </button>
              )}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2"><Ticket className="w-4 h-4" />予約番号</span>
                <span className="font-mono font-bold">{reservation.reservation_number}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500 flex items-center gap-2"><Users className="w-4 h-4" />参加人数</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{reservation.participant_count}名</span>
                  {reservation.status === 'confirmed' && (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleEditClick} disabled={!canEdit}>
                      <Pencil className="h-3 w-3 mr-1" />変更
                    </Button>
                  )}
                </div>
              </div>
              {reservation.schedule_events?.is_private_booking ? (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-500 flex items-center gap-2"><CreditCard className="w-4 h-4" />お支払い金額</span>
                    <div className="text-right">
                      <span className="font-bold text-lg" style={{ color: THEME.primary }}>¥{(reservation.final_price || 0).toLocaleString()}</span>
                      <span className="text-xs text-gray-500 ml-2">{reservation.payment_status === 'paid' ? '決済済み' : '現地決済'}</span>
                    </div>
                  </div>
                  {!!reservation.unit_price && (
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">1人あたり</span>
                      <span className="text-sm text-gray-600">¥{reservation.unit_price.toLocaleString()}/人</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500 flex items-center gap-2"><CreditCard className="w-4 h-4" />参加料金</span>
                  <div className="text-right">
                    <span className="font-bold text-lg" style={{ color: THEME.primary }}>¥{(reservation.unit_price || 0).toLocaleString()}/人</span>
                    <span className="text-xs text-gray-500 ml-2">{reservation.payment_status === 'paid' ? '決済済み' : '現地決済'}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">予約日</span>
                <span className="text-sm text-gray-600">{formatJstDateJa(reservation.created_at)}</span>
              </div>
              {reservation.status === 'confirmed' && !reservation.schedule_events?.is_private_booking && (
                <div className="pt-3 mt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">予約キャンセル</p>
                      {!canCancel && <p className="text-xs text-red-500 mt-1">期限（{cancelDeadlineHours}時間前）を過ぎています</p>}
                    </div>
                    <Button variant="destructive" size="sm" className="h-8" onClick={() => setCancelDialogOpen(true)} disabled={!canCancel}>キャンセル</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {reservation.notes && (
          <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
            <h3 className="font-bold text-gray-900 mb-2">備考</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{reservation.notes}</p>
          </div>
        )}

        {scenario && (
          <Button variant="outline" className="w-full" style={{ borderColor: THEME.primary, color: THEME.primary, borderRadius: 0 }} onClick={() => navigate(organization?.slug ? `/${organization.slug}/scenario/${scenario.slug || scenario.id}` : `/scenario/${scenario.slug || scenario.id}`)}>
            シナリオ詳細を見る<ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        )}

        {scenario && reservation?.status !== 'cancelled' && (
          <div className="mt-4">
            <InviteShareButton
              scenarioTitle={scenario.title} scenarioId={scenario.id} scenarioSlug={scenario.slug}
              eventDate={reservation?.schedule_events?.date ? formatJstDateJa(reservation.schedule_events.date) : undefined}
              eventTime={reservation?.schedule_events?.start_time || undefined}
              storeName={store?.name} organizationSlug={organization?.slug} reservationId={reservation?.id} className="w-full"
            />
          </div>
        )}
      </div>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
            <AlertDialogDescription>キャンセル後は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? '処理中...' : 'キャンセルする'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加人数を変更</DialogTitle>
            <DialogDescription>
              変更後の参加人数を選択してください。（残席: {remainingSeats}名）
              {!canDecrease && reservation && <span className="block text-amber-600 mt-1">※キャンセル期限を過ぎているため、人数の追加のみ可能です</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={String(editParticipantCount)} onValueChange={(val) => setEditParticipantCount(Number(val))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: remainingSeats }, (_, i) => i + 1)
                  .filter((num) => canDecrease || num >= (reservation?.participant_count || 1))
                  .map((num) => <SelectItem key={num} value={String(num)}>{num}名</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={updateCountMutation.isPending}>キャンセル</Button>
            <Button onClick={handleEditConfirm} disabled={updateCountMutation.isPending || editParticipantCount === reservation?.participant_count}>
              {updateCountMutation.isPending ? '変更中...' : '変更する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
