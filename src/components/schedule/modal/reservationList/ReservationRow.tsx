/**
 * 予約1件の行（チェックボックス／ステータス／キャンセル／展開詳細）。
 * ReservationList から子コンポーネント抽出・挙動不変。
 * map コールバック本体を逐語移送し、クロージャ参照は同名 props として注入。
 */
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { formatJstDateTime } from '@/utils/jstDate'
import { reservationApi } from '@/lib/reservationApi'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { RESERVATION_SOURCE, STAFF_RESERVATION_SOURCES } from '@/lib/constants'
import { getCurrentOrganizationId } from '@/lib/organization'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import type { Staff as StaffType, Scenario, Store, Reservation, Customer } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'

// 予約台帳の支払表示用ラベル（AddParticipantSection の選択肢と表記を揃える）
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  onsite: '現地決済',
  online: '事前決済',
  staff: 'スタッフ参加（無料）',
}
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: '未払い',
  paid: '支払済み',
  refunded: '返金済み',
  cancelled: 'キャンセル',
}

interface ReservationRowProps {
  reservation: Reservation
  index: number
  reservations: Reservation[]
  setReservations: Dispatch<SetStateAction<Reservation[]>>
  expandedReservation: string | null
  setExpandedReservation: Dispatch<SetStateAction<string | null>>
  selectedReservations: Set<string>
  setSelectedReservations: Dispatch<SetStateAction<Set<string>>>
  staff: StaffType[]
  stores: Store[]
  scenarios: Scenario[]
  event: ScheduleEvent | null
  handleUpdateReservationStatus: (reservationId: string, newStatus: Reservation['status']) => void
  handleToggleArrivedLate: (reservationId: string, value: boolean) => void
  onParticipantChange?: (eventId: string, newCount: number) => void
}

export function ReservationRow({
  reservation,
  index,
  reservations,
  setReservations,
  expandedReservation,
  setExpandedReservation,
  selectedReservations,
  setSelectedReservations,
  staff,
  stores,
  scenarios,
  event,
  handleUpdateReservationStatus,
  handleToggleArrivedLate,
  onParticipantChange,
}: ReservationRowProps) {
                    const isExpanded = expandedReservation === reservation.id
                    const isLast = index === reservations.length - 1
                    const isCancelled = reservation.status === 'cancelled'
                    // GMタブから「スタッフ参加」役割で追加された予約は、チェックイン対象ではなく
                    // 「スタッフ (GMタブから)」ラベル表示にする（チェックイン/ステータス操作を出さない）
                    const isStaffParticipation = reservation.payment_method === 'staff' ||
                      (STAFF_RESERVATION_SOURCES as readonly string[]).includes(reservation.reservation_source ?? '')
                    return (
                      <div key={reservation.id} className={`${isLast ? '' : 'border-b'} ${isCancelled ? 'bg-gray-50 opacity-60' : ''}`}>
                        <div className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-[40px] flex items-center justify-center shrink-0">
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
                                disabled={isCancelled}
                              />
                            </div>
                            <span className={`flex-1 min-w-0 flex items-center flex-wrap gap-x-2 gap-y-0.5 ${isCancelled ? 'line-through text-gray-500' : ''}`}>
                              {(() => {
                                const customer = reservation.customers
                                  ? (Array.isArray(reservation.customers) ? reservation.customers[0] : reservation.customers)
                                  : null
                                const name = reservation.customer_name || customer?.name || reservation.customer_notes || '顧客名なし'
                                const nickname = customer?.nickname
                                const hasNickname = !!nickname && nickname !== name
                                return (
                                  <span className="flex flex-col min-w-0 flex-1 leading-tight">
                                    <span className="font-medium text-xs truncate">{name}</span>
                                    {hasNickname ? (
                                      <span className="text-[10px] text-muted-foreground truncate">（{nickname}）</span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground/50 truncate">ニックネーム未設定</span>
                                    )}
                                  </span>
                                )
                              })()}
                              {/* キャンセル済みの表示はステータス列に集約（名前列のバッジ重複・名前潰れを解消） */}
                              {/* 貸切バッジ */}
                              {reservation.private_group_id && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                  貸切
                                </span>
                              )}
                              {/* スタッフ参加バッジ */}
                              {!isCancelled && (reservation.payment_method === 'staff' ||
                                (STAFF_RESERVATION_SOURCES as readonly string[]).includes(reservation.reservation_source ?? '')) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                  スタッフ
                                </span>
                              )}
                            </span>
                            {isCancelled ? (
                              <span className="w-[60px] h-7 text-xs text-gray-400 flex items-center">{reservation.participant_count}名</span>
                            ) : (
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
                                  
                                  // 参加人数の更新はRPCでロック付き実行
                                  try {
                                    await reservationApi.updateParticipantsWithLock(
                                      reservation.id,
                                      newCount,
                                      reservation.customer_id ?? null
                                    )
                                  } catch (updateError: any) {
                                    showToast.error(getSafeErrorMessage(updateError, '人数の更新に失敗しました'))
                                    return
                                  }

                                  // 料金/参加者名の再計算はサーバー側で実施（直UPDATE禁止）
                                  try {
                                    await reservationApi.recalculatePrices(
                                      reservation.id,
                                      Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者')
                                    )
                                  } catch (recalcError: any) {
                                    showToast.error(getSafeErrorMessage(recalcError, '料金の再計算に失敗しました'))
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
                                  
                                  // 🔔 人数が減少した場合、キャンセル待ちに通知
                                  const oldCount = reservation.participant_count || 0
                                  const freedSeats = oldCount - newCount
                                  
                                  // organization_idを複数のソースから取得（優先順位順）
                                  // デバッグ: 各ソースの値を確認
                                  const eventOrgId = event?.organization_id
                                  const scenarioOrgId = (event as any)?.scenarios?.organization_id
                                  const currentUserOrgId = await getCurrentOrganizationId()
                                  
                                  logger.info('🔍 orgId デバッグ:', { 
                                    eventOrgId, 
                                    scenarioOrgId, 
                                    currentUserOrgId,
                                    eventKeys: event ? Object.keys(event) : []
                                  })
                                  
                                  const orgId = eventOrgId || scenarioOrgId || currentUserOrgId
                                  
                                  logger.info('🔍 キャンセル待ち通知準備:', { freedSeats, orgId, eventId: event?.id })
                                  
                                  if (freedSeats > 0 && event && orgId) {
                                    try {
                                      const { data: org } = await supabase
                                        .from('organizations')
                                        .select('slug')
                                        .eq('id', orgId)
                                        .single()
                                      
                                      const orgSlug = org?.slug || ''
                                      const bookingUrl = `${window.location.origin}/${orgSlug}`
                                      
                                      await supabase.functions.invoke('notify-waitlist', {
                                        body: {
                                          organizationId: orgId,
                                          scheduleEventId: event.id,
                                          freedSeats,
                                          scenarioTitle: event.scenario || event.scenarios?.title || '',
                                          eventDate: event.date,
                                          startTime: event.start_time,
                                          endTime: event.end_time,
                                          storeName: event.venue || (event as any).stores?.name || '',
                                          bookingUrl
                                        }
                                      })
                                      logger.info('キャンセル待ち通知を送信（人数減少）:', { freedSeats })
                                    } catch (notifyError) {
                                      logger.warn('キャンセル待ち通知エラー:', notifyError)
                                      // 通知失敗はエラー表示しない（メイン処理は成功しているため）
                                    }
                                  } else {
                                    logger.info('🔍 キャンセル待ち通知スキップ:', { freedSeats, hasEvent: !!event, hasOrgId: !!orgId })
                                  }
                                  
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
                            )}
                            <span className="hidden sm:block text-xs text-muted-foreground w-[80px]">
                              {isCancelled && reservation.cancelled_at ? (
                                <span title="キャンセル日時">
                                  {new Date(reservation.cancelled_at).toLocaleString('ja-JP', {
                                    timeZone: 'Asia/Tokyo',
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              ) : reservation.created_at ? (
                                new Date(reservation.created_at).toLocaleString('ja-JP', {
                                  timeZone: 'Asia/Tokyo',
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              ) : '-'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 ml-[52px] sm:ml-0 flex-shrink-0">
                            {isCancelled ? (
                              <div className="w-[184px] flex flex-col gap-0.5 min-w-0">
                                <span className="text-xs text-red-500">キャンセル済</span>
                                {(() => {
                                  const reason = reservation.cancellation_reason
                                  const isCustomerCancel = reason && (reason.includes('お客様') || reason.includes('顧客'))
                                  const isEventCancel = event?.is_cancelled && !isCustomerCancel
                                  const displayReason = isCustomerCancel
                                    ? reason
                                    : (event?.is_cancelled ? '公演中止によるキャンセル' : (reason || ''))
                                  const colorClass = isEventCancel ? 'text-orange-500' : 'text-gray-400'
                                  return (
                                    <>
                                      {displayReason && (
                                        <span className={`text-[10px] leading-tight ${colorClass}`}>{displayReason}</span>
                                      )}
                                      {(reservation.cancelled_at || reservation.updated_at) && (
                                        <span className={`text-[10px] leading-tight ${colorClass}`}>
                                          {new Date(reservation.cancelled_at || reservation.updated_at!).toLocaleString('ja-JP', {
                                            timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                          })}
                                        </span>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            ) : isStaffParticipation ? (
                              <div className="w-[184px] flex items-center gap-2">
                                <span className="h-8 px-2 text-xs flex items-center rounded bg-green-50 text-green-800 border border-green-200 whitespace-nowrap" title="GMタブからスタッフ参加として追加された参加者です">
                                  スタッフ (GMタブから)
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                                  onClick={() => handleUpdateReservationStatus(reservation.id, 'cancelled')}
                                  title="GMタブからも完全に削除します"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                {/* ステータス列(w-80): 確定 / キャンセル / 欠席（保留中は手動選択から除外） */}
                                <div className="w-[80px] shrink-0">
                                  <Select
                                    value={reservation.status === 'no_show' ? 'no_show' : 'confirmed'}
                                    onValueChange={(value) => handleUpdateReservationStatus(reservation.id, value as Reservation['status'])}
                                  >
                                    <SelectTrigger className="w-full h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="confirmed">確定</SelectItem>
                                      <SelectItem value="cancelled">キャンセル</SelectItem>
                                      <SelectItem value="no_show">欠席</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {/* チェックイン列(w-96): 来店済バッジ or チェックインボタン（欠席は空）。遅刻トグル/解除は詳細へ */}
                                <div className="w-[96px] shrink-0 flex items-center">
                                  {reservation.status === 'checked_in' ? (
                                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1 whitespace-nowrap">
                                      ✓来店済
                                      {reservation.arrived_late && (
                                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                          遅刻
                                        </span>
                                      )}
                                    </span>
                                  ) : reservation.status === 'no_show' ? null : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50 w-full"
                                      onClick={() => handleUpdateReservationStatus(reservation.id, 'checked_in')}
                                    >
                                      チェックイン
                                    </Button>
                                  )}
                                </div>
                              </>
                            )}
                            {/* 詳細列(w-52) */}
                            <div className="w-[52px] shrink-0 flex items-center justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                              >
                                詳細
                                {isExpanded ? <ChevronUp className="ml-0.5 h-3 w-3" /> : <ChevronDown className="ml-0.5 h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="px-3 pb-2.5 pt-0 border-t bg-muted/30">
                            {/* 来店管理（来店済の時だけ）: 遅刻トグル＋チェックイン解除。行をスッキリさせるためここへ集約 */}
                            {reservation.status === 'checked_in' && (
                              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                <Label className="text-xs text-muted-foreground w-16 shrink-0">来店管理</Label>
                                <Button
                                  variant={reservation.arrived_late ? 'default' : 'outline'}
                                  size="sm"
                                  className={`h-8 px-3 text-xs ${reservation.arrived_late ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : 'text-amber-700 border-amber-300 hover:bg-amber-50'}`}
                                  onClick={() => handleToggleArrivedLate(reservation.id, !reservation.arrived_late)}
                                  title="遅刻して来店したかを記録"
                                >
                                  {reservation.arrived_late ? '⏰ 遅刻あり' : '遅刻なし'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleUpdateReservationStatus(reservation.id, 'confirmed')}
                                  title="チェックインを取り消して確定に戻す"
                                >
                                  チェックイン解除
                                </Button>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2.5">
                              <div className="space-y-1.5">
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
                                      
                                      // 人数変更はロック付きRPCで実施（直UPDATE禁止）
                                      try {
                                        await reservationApi.updateParticipantsWithLock(
                                          reservation.id,
                                          newCount,
                                          reservation.customer_id ?? null
                                        )
                                        await reservationApi.recalculatePrices(
                                          reservation.id,
                                          Array(newCount).fill(reservation.participant_names?.[0] || 'デモ参加者')
                                        )
                                      } catch (updateError: any) {
                                        showToast.error(getSafeErrorMessage(updateError, '人数の更新に失敗しました'))
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
                                    className="w-20 h-8 text-xs"
                                  />
                                  <span className="text-xs text-muted-foreground">名</span>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">予約ソース</Label>
                                <div className="text-xs">
                                  {reservation.reservation_source === RESERVATION_SOURCE.DEMO ? 'デモ' :
                                   reservation.reservation_source === RESERVATION_SOURCE.STAFF_PARTICIPATION ? 'スタッフ参加' :
                                   reservation.reservation_source === RESERVATION_SOURCE.WEB ? 'Web予約' :
                                   reservation.reservation_source === RESERVATION_SOURCE.WALK_IN ? '当日予約' :
                                   reservation.reservation_source || '-'}
                                </div>
                              </div>
                            </div>
                            {/* 予約台帳: 予約番号/料金/予約日時/予約作成日/担当GM/支払（社内向け台帳フィールド） */}
                            {(() => {
                              const gmLabel = reservation.gm_staff
                                || (reservation.assigned_staff?.length ? reservation.assigned_staff.join('、') : '')
                                || (event?.gms?.length ? event.gms.join('、') : '')
                                || '-'
                              const methodLabel = reservation.payment_method
                                ? (PAYMENT_METHOD_LABEL[reservation.payment_method] ?? reservation.payment_method)
                                : ''
                              const statusLabel = PAYMENT_STATUS_LABEL[reservation.payment_status] ?? reservation.payment_status
                              const paymentLabel = methodLabel ? `${methodLabel}・${statusLabel}` : statusLabel
                              return (
                                <div className="mt-2.5 space-y-1.5 border-t pt-2.5">
                                  <Label className="text-xs font-semibold text-muted-foreground">予約台帳</Label>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">予約番号</span>
                                      <span className="text-xs break-all">{reservation.reservation_number || '-'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">料金</span>
                                      <span className="text-xs">¥{(reservation.final_price ?? 0).toLocaleString('ja-JP')}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">予約日時</span>
                                      <span className="text-xs">{formatJstDateTime(reservation.requested_datetime) || '-'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">予約作成日</span>
                                      <span className="text-xs">{formatJstDateTime(reservation.created_at) || '-'}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">担当GM</span>
                                      <span className="text-xs">{gmLabel}</span>
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">支払</span>
                                      <span className="text-xs">{paymentLabel}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                            {(() => {
                              const customer = reservation.customers as any
                              let email = reservation.customer_email
                                || customer?.email 
                                || customer?.user?.email
                              
                              // スタッフのメールアドレスを検索
                              if (!email) {
                                const participantName = reservation.participant_names?.[0] || reservation.customer_notes
                                if (participantName) {
                                  const matchedStaff = staff.find(s => 
                                    s.name === participantName || 
                                    s.display_name === participantName
                                  )
                                  if (matchedStaff?.email) {
                                    email = matchedStaff.email
                                  }
                                }
                              }

                              const phone = reservation.customer_phone || customer?.phone_number

                              return (
                                <div className="mt-2.5 space-y-1.5 border-t pt-2.5">
                                  <Label className="text-xs font-semibold text-muted-foreground">顧客情報</Label>
                                  {phone && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">電話番号</span>
                                      <a href={`tel:${phone}`} className="text-xs text-blue-600 hover:underline">{phone}</a>
                                    </div>
                                  )}
                                  {email && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground w-20 shrink-0">メール</span>
                                      <a href={`mailto:${email}`} className="text-xs text-blue-600 hover:underline break-all">{email}</a>
                                    </div>
                                  )}
                                  {!phone && !email && (
                                    <div className="text-xs text-muted-foreground">連絡先情報なし</div>
                                  )}
                                </div>
                              )
                            })()}
                            {reservation.customer_notes && (
                              <div className="mt-2.5">
                                <Label className="text-xs text-muted-foreground">備考</Label>
                                <div className="text-xs mt-1">{reservation.customer_notes}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )

}
