import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, ExternalLink, AlertTriangle, Bell, Ticket, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from './hooks/useCustomerData'
import { useBookingForm } from './hooks/useBookingForm'
import { useBookingSubmit, checkDuplicateReservation } from './hooks/useBookingSubmit'
import { formatDate, formatTime, formatPrice } from './utils/bookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import { getAvailableCoupons } from '@/lib/api/couponApi'
import type { CustomerCoupon } from '@/types'
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
import type { BookingConfirmationProps } from './types'

export function BookingConfirmation({
  eventId,
  scenarioTitle,
  scenarioId,
  storeId,
  eventDate,
  startTime,
  endTime,
  storeName,
  storeAddress,
  storeColor,
  maxParticipants,
  currentParticipants,
  participationFee,
  initialParticipantCount = 1,
  organizationSlug,
  onBack,
  onComplete
}: BookingConfirmationProps) {
  const navigate = useNavigate()
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : '/queens-waltz'
  const { user } = useAuth()
  const availableSeats = maxParticipants - currentParticipants

  // 重複予約警告用のstate
  const [duplicateWarning, setDuplicateWarning] = useState<{
    show: boolean
    existingReservation?: any
  }>({ show: false })
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState(false)
  const duplicateWarningRef = useRef<HTMLDivElement>(null)

  // 重複警告表示時に自動スクロール
  useEffect(() => {
    if (duplicateWarning.show && duplicateWarningRef.current) {
      duplicateWarningRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [duplicateWarning.show])

  // クーポン関連のstate
  const [availableCoupons, setAvailableCoupons] = useState<CustomerCoupon[]>([])
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const [couponsLoading, setCouponsLoading] = useState(false)

  // 利用可能クーポンを取得
  useEffect(() => {
    const fetchCoupons = async () => {
      if (!user) return
      setCouponsLoading(true)
      try {
        // 組織IDを取得（公演のorganization_id）
        const { data: eventData } = await supabase
          .from('schedule_events')
          .select('organization_id')
          .eq('id', eventId)
          .single()

        if (eventData?.organization_id) {
          const coupons = await getAvailableCoupons(eventData.organization_id)
          setAvailableCoupons(coupons)
        }
      } catch (err) {
        logger.error('クーポン取得エラー:', err)
      } finally {
        setCouponsLoading(false)
      }
    }
    fetchCoupons()
  }, [user, eventId])

  // キャンセル待ち用のstate
  const [waitlistMode, setWaitlistMode] = useState(false)
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const [waitlistSuccess, setWaitlistSuccess] = useState(false)
  const [waitlistParticipantCount, setWaitlistParticipantCount] = useState(1)

  // 満席かどうか
  const isSoldOut = availableSeats <= 0

  // フック
  const {
    customerName,
    setCustomerName,
    customerNickname,
    setCustomerNickname,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone
  } = useCustomerData({ userId: user?.id, userEmail: user?.email })

  // メールアドレス変更時に重複チェック（デバウンス）
  const checkDuplicate = useCallback(async () => {
    if (!customerEmail || !eventId) return
    
    // 同じ公演への重複と、同じ日時の別公演への重複を両方チェック
    const result = await checkDuplicateReservation(eventId, customerEmail, customerPhone, eventDate, startTime)
    if (result.hasDuplicate) {
      setDuplicateWarning({ show: true, existingReservation: result.existingReservation })
    } else {
      setDuplicateWarning({ show: false })
    }
  }, [customerEmail, customerPhone, eventId, eventDate, startTime])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (customerEmail && customerEmail.includes('@')) {
        checkDuplicate()
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [customerEmail, checkDuplicate])

  const {
    participantCount,
    notes,
    setNotes,
    error,
    setError,
    validateForm
  } = useBookingForm({ initialParticipantCount, availableSeats })

  const { isSubmitting, success, completedReservation, handleSubmit } = useBookingSubmit({
    eventId,
    scenarioTitle,
    scenarioId,
    storeId,
    eventDate,
    startTime,
    endTime,
    storeName,
    storeAddress,
    participationFee,
    currentParticipants,
    userId: user?.id
  })

  // 選択中のクーポン情報
  const selectedCoupon = availableCoupons.find(c => c.id === selectedCouponId)
  const couponDiscountRaw = selectedCoupon?.coupon_campaigns?.discount_type === 'fixed'
    ? selectedCoupon.coupon_campaigns.discount_amount
    : selectedCoupon?.coupon_campaigns?.discount_type === 'percentage'
      ? Math.round((participationFee * participantCount) * (selectedCoupon.coupon_campaigns?.discount_amount || 0) / 100)
      : 0
  // 割引額は合計金額を超えない
  const couponDiscount = Math.min(couponDiscountRaw, participationFee * participantCount)

  // 予約成功後の自動遷移は削除（ユーザーが確認できるよう手動遷移に変更）
  // ユーザーは「戻る」ボタンまたはナビゲーションで遷移する

  // 予約送信ハンドラ
  const onSubmit = async () => {
    setError(null)
    
    if (!validateForm(customerName, customerEmail, customerPhone)) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    // 重複予約がある場合は確認ダイアログを表示
    if (duplicateWarning.show && !pendingSubmit) {
      setConfirmDialogOpen(true)
      return
    }

    try {
      await handleSubmit(customerName, customerEmail, customerPhone, participantCount, notes, customerNickname, selectedCouponId)
      // 成功画面表示後にuseEffectで自動遷移を処理
    } catch (error: any) {
      setError(error.message || '予約処理中にエラーが発生しました')
    } finally {
      setPendingSubmit(false)
    }
  }

  // 重複確認後の送信
  const handleConfirmDuplicate = () => {
    setConfirmDialogOpen(false)
    setPendingSubmit(true)
  }

  // pendingSubmitがtrueになったら送信実行
  useEffect(() => {
    if (pendingSubmit) {
      onSubmit()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSubmit])

  // キャンセル待ち登録ハンドラー
  const handleWaitlistSubmit = async () => {
    if (!customerName || !customerEmail) {
      setError('お名前とメールアドレスは必須です')
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    setWaitlistSubmitting(true)
    setError(null)

    try {
      if (!user) {
        throw new Error('ログインが必要です')
      }

      if (user.email && customerEmail !== user.email) {
        throw new Error('ログイン中のメールアドレスと一致しません')
      }

      // 組織IDを取得
      const { data: eventData, error: eventError } = await supabase
        .from('schedule_events')
        .select('organization_id')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError

      // 顧客IDを取得または作成（ログインユーザー基準）
      let customerId: string | null = null
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingCustomer) {
        customerId = existingCustomer.id
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            user_id: user.id,
            name: customerName,
            nickname: customerNickname || null,
            phone: customerPhone || null,
            email: customerEmail,
            organization_id: eventData.organization_id
          })
          .select('id')
          .single()

        if (customerError) throw customerError
        customerId = newCustomer?.id ?? null
      }

      if (!customerId) {
        throw new Error('顧客情報の取得に失敗しました。もう一度お試しください。')
      }

      // キャンセル待ちに登録
      const { error: insertError } = await supabase
        .from('waitlist')
        .insert({
          organization_id: eventData.organization_id,
          schedule_event_id: eventId,
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone || null,
          participant_count: waitlistParticipantCount,
          status: 'waiting'
        })

      if (insertError) throw insertError

      setWaitlistSuccess(true)
      toast.success('キャンセル待ちに登録しました')
    } catch (error: any) {
      logger.error('キャンセル待ち登録エラー:', error)
      setError(error.message || 'キャンセル待ち登録に失敗しました')
    } finally {
      setWaitlistSubmitting(false)
    }
  }

  // キャンセル待ち成功画面
  if (waitlistSuccess) {
    return (
      <div className="min-h-screen bg-background overflow-x-clip">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="container mx-auto max-w-7xl px-4 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                <Bell className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">キャンセル待ち登録完了</h2>
              <p className="text-muted-foreground mb-4">
                空きが出た場合、メールでお知らせします
              </p>
              <div className="text-sm text-left bg-gray-50 p-4 rounded-lg mb-6">
                <div className="font-medium">{scenarioTitle}</div>
                <div className="text-muted-foreground mt-1">
                  {formatDate(eventDate)} {formatTime(startTime)}〜
                </div>
                <div className="text-muted-foreground">{storeName}</div>
                <div className="mt-2">登録人数: {waitlistParticipantCount}名</div>
              </div>
              <Button onClick={onBack} variant="outline" className="w-full">
                戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // 成功画面
  if (success) {
    return (
      <div className="min-h-screen bg-background overflow-x-clip">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        
        <div className="container mx-auto max-w-7xl px-4 py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-lg text-green-800">予約が完了しました！</h2>
              
              {/* 予約詳細サマリー */}
              {completedReservation && (
                <div className="bg-white rounded-lg p-4 text-left border border-green-200">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">予約番号</span>
                      <span className="font-bold text-green-800">{completedReservation.reservationNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">公演</span>
                      <span className="font-medium">{scenarioTitle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">日時</span>
                      <span>{formatDate(eventDate)} {formatTime(startTime)}〜</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">会場</span>
                      <span>{storeName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">参加人数</span>
                      <span>{completedReservation.participantCount}名</span>
                    </div>
                    {completedReservation.discountAmount && completedReservation.discountAmount > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>クーポン割引</span>
                        <span>-¥{formatPrice(completedReservation.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-muted-foreground">合計金額</span>
                      <span className="font-bold">{formatPrice(completedReservation.totalPrice)}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-sm text-green-700 leading-relaxed">
                ご予約ありがとうございます。<br />
                確認メールを <span className="font-medium">{customerEmail}</span> に送信しました。
              </p>
              <p className="text-xs text-green-600">
                メールが届かない場合は、迷惑メールフォルダもご確認ください。
              </p>
              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => navigate('/mypage')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  マイページで予約を確認
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(bookingBasePath)}
                  className="border-green-600 text-green-700 hover:bg-green-50"
                >
                  他のシナリオを見る
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const totalPrice = participationFee * participantCount

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-7xl px-4 py-1">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-1 hover:bg-accent h-7 px-2 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />
            シナリオ詳細に戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-2">
        <h1 className="text-lg font-bold mb-2">予約確認</h1>

        {error && (
          <Card className="mb-2 border-2 border-red-200 bg-red-50">
            <CardContent className="p-2 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {/* 重複予約警告 */}
        {duplicateWarning.show && duplicateWarning.existingReservation && (
          <Card ref={duplicateWarningRef} className="mb-2 border-2 border-amber-200 bg-amber-50">
            <CardContent className="p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-amber-800">
                {duplicateWarning.existingReservation.isTimeConflict ? (
                  <>
                    <p className="font-medium text-sm">同じ時間帯に別の予約があります</p>
                    <p className="text-xs mt-1">
                      予約番号: {duplicateWarning.existingReservation.reservation_number}<br />
                      公演: {duplicateWarning.existingReservation.title}<br />
                      参加人数: {duplicateWarning.existingReservation.participant_count}名
                    </p>
                    <p className="text-xs mt-2 text-amber-700">
                      同時刻に複数の公演を予約することはできません。<br />
                      既存の予約をキャンセルする場合は、<Link to="/mypage" className="underline font-medium">マイページ</Link>から操作してください。
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-sm">この公演に既に予約があります</p>
                    <p className="text-xs mt-1">
                      予約番号: {duplicateWarning.existingReservation.reservation_number}<br />
                      予約者: {duplicateWarning.existingReservation.customer_name}<br />
                      参加人数: {duplicateWarning.existingReservation.participant_count}名
                    </p>
                    <p className="text-xs mt-2">
                      人数を変更したい場合は、<Link to="/mypage" className="underline font-medium">マイページ</Link>から既存の予約を編集してください。
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* 左側：予約内容 */}
          <div className="md:col-span-8 space-y-2">
            {/* 公演情報 */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">公演情報</h3>
              <Card>
                <CardContent className="p-2 space-y-1">
                  <h3 className="text-base font-bold">{scenarioTitle}</h3>

                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{formatDate(eventDate)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{formatTime(startTime)} - {formatTime(endTime)}</span>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p style={{ color: storeColor }}>{storeName}</p>
                        {storeAddress && (
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddress)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground text-xs hover:text-primary flex items-center gap-1 underline"
                          >
                            {storeAddress}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>残り {availableSeats} 席</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 参加人数（表示のみ） */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">参加人数</h3>
              <Card>
                <CardContent className="p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{participantCount}名</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">お客様情報</h3>
              <Card>
                <CardContent className="p-2 space-y-2">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1 block">ニックネーム</Label>
                    <Input
                      value={customerNickname}
                      onChange={(e) => setCustomerNickname(e.target.value)}
                      placeholder="タロウ"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">店舗で呼ばれる際のお名前（任意）</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1 block">メールアドレス *</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="example@example.com"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1 block">電話番号 *</Label>
                    <Input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="090-1234-5678"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1 block">備考（任意）</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ご要望などがあればご記入ください"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="md:col-span-4 space-y-2">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">料金</h3>
              <Card>
                <CardContent className="p-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費（1名）</span>
                    <span>¥{formatPrice(participationFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加人数</span>
                    <span>{participantCount}名</span>
                  </div>
                  {selectedCoupon && couponDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>クーポン割引</span>
                      <span>-¥{formatPrice(couponDiscount)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1.5 mt-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">合計</span>
                      <span className="text-base font-bold text-primary">
                        ¥{formatPrice(Math.max(0, totalPrice - (selectedCoupon ? couponDiscount : 0)))}
                      </span>
                    </div>
                    {selectedCoupon && couponDiscount > 0 && (
                      <div className="text-xs text-muted-foreground line-through text-right">
                        ¥{formatPrice(totalPrice)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* クーポン選択 */}
            {!isSoldOut && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">クーポン</h3>
                <Card>
                  <CardContent className="p-2">
                    {couponsLoading ? (
                      <p className="text-xs text-muted-foreground">クーポンを確認中...</p>
                    ) : availableCoupons.length === 0 ? (
                      <p className="text-xs text-muted-foreground">利用可能なクーポンはありません</p>
                    ) : (
                      <div className="space-y-1.5">
                        {availableCoupons.map(coupon => {
                          const campaign = coupon.coupon_campaigns
                          if (!campaign) return null
                          const isSelected = selectedCouponId === coupon.id
                          const discountLabel = campaign.discount_type === 'fixed'
                            ? `¥${formatPrice(campaign.discount_amount)} OFF`
                            : `${campaign.discount_amount}% OFF`

                          return (
                            <button
                              key={coupon.id}
                              type="button"
                              onClick={() => setSelectedCouponId(isSelected ? null : coupon.id)}
                              className={`w-full text-left p-2 rounded-md border transition-colors ${
                                isSelected
                                  ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Ticket className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-green-600' : 'text-muted-foreground'}`} />
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium truncate">{campaign.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      残り{coupon.uses_remaining}枚
                                      {coupon.expires_at && (
                                        <> / {new Date(coupon.expires_at).toLocaleDateString('ja-JP')}まで</>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className={`text-xs font-bold ${isSelected ? 'text-green-700' : 'text-primary'}`}>
                                    {discountLabel}
                                  </span>
                                  {isSelected && (
                                    <X className="w-3.5 h-3.5 text-green-600" />
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* お支払い方法 */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">お支払い方法</h3>
              <Card>
                <CardContent className="p-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="font-medium">当日現金払い</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    ご来店時に現金でお支払いください
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              mode="schedule"
              storeId={storeId}
            />

            {/* 人数未達中止に関する注意喚起 */}
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <p className="font-medium mb-1">公演中止の可能性について</p>
                    <p className="leading-relaxed">
                      この公演は前日23:59時点で定員の過半数に達しない場合、中止となる可能性があります。
                      中止の場合はメールでお知らせし、参加料金は発生しません。
                    </p>
                    <Link to="/cancel-policy" className="text-amber-700 underline mt-1 inline-block">
                      詳しくはキャンセルポリシーをご確認ください
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 満席の場合はキャンセル待ちボタン、そうでなければ予約ボタン */}
            {isSoldOut ? (
              <div className="space-y-2">
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-amber-800 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium text-sm">この公演は満席です</span>
                    </div>
                    <p className="text-xs text-amber-700">
                      キャンセル待ちに登録すると、空きが出た際にメールでお知らせします。
                    </p>
                  </CardContent>
                </Card>
                
                {!waitlistMode ? (
                  <Button
                    onClick={() => setWaitlistMode(true)}
                    variant="outline"
                    className="w-full h-9 text-sm"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    キャンセル待ちに登録
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">希望人数</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setWaitlistParticipantCount(Math.max(1, waitlistParticipantCount - 1))}
                          disabled={waitlistParticipantCount <= 1}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center">{waitlistParticipantCount}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setWaitlistParticipantCount(Math.min(10, waitlistParticipantCount + 1))}
                          disabled={waitlistParticipantCount >= 10}
                        >
                          +
                        </Button>
                        <span className="text-sm text-muted-foreground">名</span>
                      </div>
                    </div>
                    <Button
                      onClick={handleWaitlistSubmit}
                      disabled={waitlistSubmitting || !customerName || !customerEmail}
                      className="w-full h-9 text-sm"
                    >
                      <Bell className="w-4 h-4 mr-2" />
                      {waitlistSubmitting ? '登録中...' : 'キャンセル待ちに登録'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setWaitlistMode(false)}
                      className="w-full h-8 text-xs"
                    >
                      キャンセル
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={isSubmitting}
                className="w-full h-9 text-sm"
              >
                {isSubmitting ? '予約処理中...' : '予約を確定する'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 重複予約確認ダイアログ */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              重複予約の確認
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>この公演に既に予約があります。本当に新しい予約を追加しますか？</p>
                {duplicateWarning.existingReservation && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <p className="font-medium">既存の予約</p>
                    <p className="text-muted-foreground mt-1">
                      予約番号: {duplicateWarning.existingReservation.reservation_number}<br />
                      参加人数: {duplicateWarning.existingReservation.participant_count}名
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  人数を変更したい場合は、<Link to="/mypage" className="underline">マイページ</Link>から既存の予約を編集してください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>戻る</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDuplicate} className="bg-amber-600 hover:bg-amber-700">
              新規予約を追加する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


