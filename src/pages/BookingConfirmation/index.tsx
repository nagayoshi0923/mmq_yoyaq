import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { InviteShareButton } from '@/components/InviteShareButton'
import { supabase } from '@/lib/supabase'
import { bookingConfirmationReadApi } from '@/lib/api/bookingConfirmationReadApi'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from './hooks/useCustomerData'
import { useBookingForm } from './hooks/useBookingForm'
import { useBookingSubmit, checkDuplicateReservation, BOOKING_PROGRESS_LABELS } from './hooks/useBookingSubmit'
import { cancellationTermsGate, useBookingCancellationTerms } from './hooks/useBookingCancellationTerms'
import { BookingCancellationTerms } from './components/BookingCancellationTerms'
import { PRICE_NOTE } from '@/lib/priceNote'
import { formatDate, formatTime, formatPrice } from './utils/bookingFormatters'
import { BookingDeadlineNotice } from '@/components/BookingDeadlineNotice'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import { BookingCouponSelector } from './components/BookingCouponSelector'
import { useBookingCoupon } from './hooks/useBookingCoupon'
import { TimeConflictConfirmDialog } from './components/TimeConflictConfirmDialog'
import type { BookingConfirmationProps } from './types'
import { hasNonEmptyCustomerPhone, MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING } from '@/lib/customerPhonePolicy'
import { getAvailableSeats } from '@/lib/participantUtils'
import { CancellationPolicyLink } from '@/components/patterns/cancellation/CancellationPolicyView'
import { upsertOwnCustomer } from '@/lib/api/customerApi'
import { waitlistApi } from '@/lib/api/globalSettingsApi'
import { getErrorMessage } from '@/lib/errorFields'
import { AddToCalendarButton, OpenMapButton, absolutePageUrl } from '@/components/patterns/schedule'
import { PageBar } from '@/components/renewal/PageBar'
import { StepBar } from '@/components/renewal/StepBar'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { seatsLabel } from '@/components/renewal/labels'

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
  feeUnknownText = null,
  initialParticipantCount = 1,
  organizationSlug,
  onBack,
  onComplete
}: BookingConfirmationProps) {
  const navigate = useNavigate()
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : ''
  const { user } = useAuth()
  const accent = useOrgThemePreset(organizationSlug).primary
  const availableSeats = getAvailableSeats({ max_participants: maxParticipants, current_participants: currentParticipants })

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

  // 支払い方法設定
  const { data: paymentSettings } = useQuery({
    queryKey: ['booking-payment-settings', organizationSlug, eventId],
    enabled: !!organizationSlug && !!eventId,
    queryFn: async () => {
      const { data, error } = await bookingConfirmationReadApi.getPublicPaymentSettings(organizationSlug!, eventId)
      if (error) throw error
      return data?.[0] ?? null
    },
  })
  const paymentMethodLabel = paymentSettings?.payment_method_label ?? '現地決済'
  const paymentMethodDescription = paymentSettings?.payment_method_description ?? 'ご来店時にお支払いください'

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

  const cancellationTerms = useBookingCancellationTerms({ organizationSlug, storeId, eventId, eventDate, startTime })
  // 取消期限を過ぎた公演は、キャンセル料に同意してから予約する（点検 34）
  const [lateCancelAgreed, setLateCancelAgreed] = useState(false)
  // 規定を読めるまで（ready）確定させない。取得失敗・既定値でも確定させない（公開前検証 P1）
  const termsGate = cancellationTermsGate(cancellationTerms.status, cancellationTerms.terms, lateCancelAgreed)
  const needsLateCancelAgreement = termsGate.needsLateCancelAgreement

  const { isSubmitting, progress, success, completedReservation, confirmationEmailOutcome, handleSubmit } = useBookingSubmit({
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
    userId: user?.id,
    organizationSlug
  })

  const couponState = useBookingCoupon(user?.id, eventId, participantCount)
  const { selectedCouponId, selectedCoupon, couponPreview, couponReady, couponDiscount } = couponState

  // 予約成功後の自動遷移は削除（ユーザーが確認できるよう手動遷移に変更）
  // ユーザーは「戻る」ボタンまたはナビゲーションで遷移する

  // 予約送信ハンドラ
  const onSubmit = async () => {
    setError(null)
    if (!couponReady) { setError('クーポンの確認完了を待つか、選択を解除してください'); return }
    if (!termsGate.canSubmit) { setError(termsGate.message); return }
    
    if (!validateForm(customerName, customerEmail, customerPhone)) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    // 同じ公演への重複予約の場合はブロック（人数変更を促す）
    if (duplicateWarning.show && duplicateWarning.existingReservation && !duplicateWarning.existingReservation.isTimeConflict) {
      setError('この公演には既に予約があります。人数を変更したい場合はマイページから既存の予約を編集してください。')
      return
    }
    
    // 時間帯重複の場合は確認ダイアログを表示（別公演への予約なのでブロックしない）
    if (duplicateWarning.show && duplicateWarning.existingReservation?.isTimeConflict && !pendingSubmit) {
      setConfirmDialogOpen(true)
      return
    }

    try {
      await handleSubmit(customerName, customerEmail, customerPhone, participantCount, notes, customerNickname, selectedCouponId)
      // 成功画面表示後にuseEffectで自動遷移を処理
    } catch (error) {
      couponState.resetAfterFailure()
      setError(getErrorMessage(error) || '予約処理中にエラーが発生しました')
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

    if (!hasNonEmptyCustomerPhone(customerPhone)) {
      setError('電話番号を入力してください')
      return
    }
    const phoneDigits = customerPhone.replace(/[-\s]/g, '')
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      setError('電話番号は10〜11桁で入力してください')
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

      // 組織ID・店舗情報を取得（公開用ビュー）
      const { data: eventData, error: eventError } = await bookingConfirmationReadApi.findPublicEventForConfirmation(eventId)

      if (eventError) throw eventError

      // 顧客IDを取得または作成（ログインユーザー・組織で一意）
      let customerId: string | null = null
      customerId = await upsertOwnCustomer({
        userId: user.id, name: customerName, nickname: customerNickname || null,
        phone: customerPhone.trim(), email: customerEmail, organizationId: eventData.organization_id,
        scopeByOrganization: false, throwOnError: true,
      })

      if (!customerId) {
        throw new Error('顧客情報の取得に失敗しました。もう一度お試しください。')
      }

      const { data: phoneRow, error: phoneVerifyError } = await bookingConfirmationReadApi.findOwnCustomerPhone(customerId, user.id)
      if (phoneVerifyError || !hasNonEmptyCustomerPhone(phoneRow?.phone)) {
        throw new Error(MSG_CUSTOMER_PHONE_REQUIRED_FOR_BOOKING)
      }

      // キャンセル待ちに登録
      const { error: insertError } = await waitlistApi.create({
        organization_id: eventData.organization_id,
        schedule_event_id: eventId,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone.trim(),
        participant_count: waitlistParticipantCount,
        status: 'waiting'
      })

      if (insertError) throw insertError

      // キャンセル待ち登録完了メールを送信
      try {
        await supabase.functions.invoke('send-waitlist-registration-confirmation', {
          body: {
            organizationId: eventData.organization_id,
            storeId: eventData.store_id,
            scheduleEventId: eventId,
            customerName,
            customerEmail,
            scenarioTitle,
            eventDate,
            startTime,
            endTime,
            storeName,
            participantCount: waitlistParticipantCount
          }
        })
      } catch (emailError) {
        // メール送信失敗しても登録自体は成功扱い
        logger.error('キャンセル待ち登録完了メール送信エラー:', emailError)
      }

      setWaitlistSuccess(true)
      toast.success('キャンセル待ちに登録しました')
    } catch (error) {
      logger.error('キャンセル待ち登録エラー:', error)
      setError(getErrorMessage(error) || 'キャンセル待ち登録に失敗しました')
    } finally {
      setWaitlistSubmitting(false)
    }
  }

  const steps = ['日程を選ぶ', '内容の確認', '完了']
  const startLabel = `${formatDate(eventDate)} ${formatTime(startTime)} 公演開始`

  // キャンセル待ち成功画面
  if (waitlistSuccess) {
    return (
      <div className="booking-shell min-h-screen overflow-x-clip bg-white">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <div className="mx-auto max-w-md px-4 py-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white" style={{ backgroundColor: accent }} aria-hidden="true">✓</div>
          <h1 className="mt-4 text-xl font-bold">キャンセル待ちに登録しました</h1>
          <p className="mt-1 text-sm text-muted-foreground">空きが出たらメールでお知らせします</p>
          <div className="mt-6 bg-gray-50 p-4 text-left text-sm">
            <p className="font-bold">{scenarioTitle}</p>
            <p className="mt-1">{startLabel}</p>
            <p className="text-muted-foreground">{storeName}・{waitlistParticipantCount}人</p>
          </div>
          <button type="button" onClick={onBack} className="mt-6 h-12 w-full border border-gray-900 text-sm font-bold">作品ページに戻る</button>
        </div>
      </div>
    )
  }

  // 成功画面
  if (success) {
    return (
      <div className="booking-shell min-h-screen overflow-x-clip bg-white">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        <StepBar steps={steps} current={2} color={accent} />

        <div className="mx-auto max-w-4xl">
          <div className="px-4 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white" style={{ backgroundColor: accent }} aria-hidden="true">✓</div>
            <h1 className="mt-4 text-2xl font-bold">予約が確定しました</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {confirmationEmailOutcome === null ? <span data-testid="booking-email-sending">{BOOKING_PROGRESS_LABELS.sending_email}</span>
                : confirmationEmailOutcome.status === 'accepted' ? <>確認メールを送りました（{customerEmail}）</>
                : <>予約は確定しましたが、確認メールの送信を確認できませんでした。もう一度予約せず、マイページで予約内容をご確認ください。</>}
            </p>
            {confirmationEmailOutcome?.status === 'accepted' && <p className="mt-0.5 text-2xs text-muted-foreground">届かないときは迷惑メールフォルダもご確認ください</p>}
            {completedReservation && (
              <p className="mx-auto mt-4 inline-block bg-gray-100 px-4 py-2 text-sm">予約番号 <span className="font-bold">{completedReservation.reservationNumber}</span></p>
            )}
          </div>

          <section className="bg-gray-50 px-4 py-5">
            <p className="text-sm font-bold">{scenarioTitle}</p>
            <p className="mt-1 text-xl font-bold">{startLabel}</p>
            {completedReservation && (
              <p className="mt-1 text-sm">
                {storeName}・{completedReservation.participantCount}人・{formatPrice(completedReservation.totalPrice)}円（{paymentMethodLabel}）
              </p>
            )}
            {completedReservation && (completedReservation.discountAmount ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">クーポンで {formatPrice(completedReservation.discountAmount ?? 0)}円引き</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 [&>*]:w-full [&>*]:bg-white">
              {completedReservation && (
                <AddToCalendarButton
                  event={{
                    scenarioTitle,
                    kind: 'open',
                    date: eventDate,
                    startTime,
                    endTime,
                    storeName,
                    address: storeAddress ?? null,
                    reservationNumber: completedReservation.reservationNumber,
                    pageUrl: absolutePageUrl(`/mypage/reservation/${completedReservation.reservationId}`),
                  }}
                  testId="booking-complete-calendar"
                />
              )}
              <OpenMapButton address={storeAddress} testId="booking-complete-map" />
            </div>
          </section>

          <section className="px-4 py-6">
            <h2 className="text-lg font-bold">次にやること</h2>
            <p className="mt-2 text-sm leading-relaxed">一緒に行く人を誘いましょう。友だちに送ると、同じ回をそのまま予約できます。</p>
            <div className="mt-3">
              <InviteShareButton
                scenarioTitle={scenarioTitle}
                scenarioId={scenarioId}
                eventDate={formatDate(eventDate)}
                eventTime={formatTime(startTime)}
                storeName={storeName}
                organizationSlug={organizationSlug}
                eventId={eventId}
                className="w-full"
              />
            </div>
          </section>

          <div className="space-y-2 border-t border-gray-200 px-4 py-5">
            <button
              type="button"
              onClick={() => navigate(completedReservation ? `/mypage/reservation/${completedReservation.reservationId}` : '/mypage')}
              className="h-12 w-full border border-gray-900 text-base font-bold"
            >予約詳細を見る</button>
            <button type="button" onClick={() => navigate(bookingBasePath || '/')} className="h-11 w-full text-sm underline underline-offset-4">ほかの作品を見る</button>
          </div>
        </div>
      </div>
    )
  }

  const totalPrice = selectedCouponId && couponReady ? couponPreview.data!.total_price : participationFee * participantCount
  const duplicateBlocks = !!(duplicateWarning.show && duplicateWarning.existingReservation && !duplicateWarning.existingReservation.isTimeConflict)
  const errorBox = error && (
    <p role="alert" className="flex items-start gap-2 border-2 border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{error}</span>
    </p>
  )
  const row = 'flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm'
  const inputCls = 'mt-1 h-11 w-full border border-gray-300 bg-white px-3 text-sm'

  return (
    <div className="booking-shell min-h-screen overflow-x-clip bg-white">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />
      <PageBar title={isSoldOut ? 'キャンセル待ちの登録' : '予約内容の確認'} onBack={onBack} />
      <StepBar steps={steps} current={1} color={accent} />

      <div className="mx-auto max-w-4xl">
        {/* 選んだ回 */}
        <section className="px-4 pb-5 pt-3">
          <p className="text-sm font-bold">{scenarioTitle}</p>
          <p className="mt-1 text-xl font-bold">{startLabel}</p>
          <p className="mt-0.5 text-sm" style={storeColor ? { color: storeColor } : undefined}>{storeName}</p>
          <p className="text-xs text-muted-foreground">
            終了予定 {formatTime(endTime)}・{seatsLabel(availableSeats)}
          </p>
          {storeAddress && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddress)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-muted-foreground underline">
              {storeAddress}
            </a>
          )}
        </section>

        <div className="space-y-2 px-4 empty:hidden">
          {errorBox}
          {/* 重複予約の注意 */}
          {duplicateWarning.show && duplicateWarning.existingReservation && (
            <div ref={duplicateWarningRef} className="flex items-start gap-3 border-2 border-amber-200 bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div className="text-xs">
                {duplicateWarning.existingReservation.isTimeConflict ? (
                  <>
                    <p className="text-sm font-medium">同じ時間帯に別の予約があります</p>
                    <p className="mt-1">予約番号: {duplicateWarning.existingReservation.reservation_number}<br />公演: {duplicateWarning.existingReservation.title}<br />参加人数: {duplicateWarning.existingReservation.participant_count}名</p>
                    <p className="mt-2 text-amber-700">同時刻に複数の公演を予約することはできません。<br />既存の予約を取り消す場合は、<Link to="/mypage" className="font-medium underline">マイページ</Link>から操作してください。</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">この公演に既に予約があります</p>
                    <p className="mt-1">予約番号: {duplicateWarning.existingReservation.reservation_number}<br />予約者: {duplicateWarning.existingReservation.customer_name}<br />参加人数: {duplicateWarning.existingReservation.participant_count}名</p>
                    <p className="mt-2 font-medium">参加人数を増やしたい場合は、<Link to="/mypage" className="underline">マイページ</Link>から既存の予約を編集してください。</p>
                    <p className="mt-1 text-amber-700">※同じ公演への重複予約はできません</p>
                  </>
                )}
              </div>
            </div>
          )}
          <BookingDeadlineNotice eventId={eventId} />
        </div>

        {/* 人数と料金 */}
        <section className="mt-3 bg-gray-50 px-4 py-5">
          <h2 className="text-lg font-bold">人数と料金</h2>
          <div className="mt-2">
            <div className={row}>
              <span className="text-muted-foreground">人数</span>
              <span>{participantCount}人 <button type="button" onClick={onBack} className="ml-2 text-xs underline">変更</button></span>
            </div>
            <div className={row}>
              <span className="text-muted-foreground">参加費</span>
              <span>{feeUnknownText ?? `${formatPrice(participationFee)}円 × ${participantCount}人`}</span>
            </div>
            {selectedCoupon && couponDiscount > 0 && (
              <div className={row}>
                <span className="text-muted-foreground">クーポン</span>
                <span style={{ color: accent }}>−{formatPrice(couponDiscount)}円</span>
              </div>
            )}
            <div className={row}>
              <span className="text-muted-foreground">お支払い</span>
              <span className="text-right">{paymentMethodLabel}<span className="block text-2xs text-muted-foreground">{paymentMethodDescription}</span></span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">合計</span>
              <span className="text-xl font-bold">
                {selectedCouponId && couponReady ? `${formatPrice(couponPreview.data!.final_price)}円` : feeUnknownText ?? `${formatPrice(totalPrice)}円`}
              </span>
            </div>
            {selectedCoupon && couponDiscount > 0 && <p className="-mt-2 text-right text-xs text-muted-foreground line-through">{formatPrice(totalPrice)}円</p>}
            <p className="text-2xs text-muted-foreground" data-testid="booking-price-note">{PRICE_NOTE}</p>
          </div>
          {user && (
            <div className="mt-3 border-t border-gray-200 pt-3 text-sm">
              <BookingCouponSelector state={couponState} disabled={isSubmitting} />
            </div>
          )}
        </section>

        {/* お客様情報 */}
        <section className="px-4 py-5">
          <h2 className="text-lg font-bold">お客様情報</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">登録済みの情報を使います。違うときは書き換えてください</p>
          <div className="mt-3 space-y-3">
            <label className="block text-sm">お名前<span className="text-red-600">*</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="山田 太郎" required className={inputCls} />
            </label>
            <label className="block text-sm">ニックネーム（任意）
              <input value={customerNickname} onChange={(e) => setCustomerNickname(e.target.value)} placeholder="タロウ" className={inputCls} />
              <span className="mt-0.5 block text-2xs text-muted-foreground">店舗で呼ばれるときのお名前</span>
            </label>
            <label className="block text-sm">メールアドレス<span className="text-red-600">*</span>
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="example@example.com" required className={inputCls} />
            </label>
            <label className="block text-sm">電話番号<span className="text-red-600">*</span>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="090-1234-5678" required className={inputCls} />
            </label>
            <label className="block text-sm">店舗への連絡（任意）
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例：初めてなので早めに着きます" rows={3} className="mt-1 w-full border border-gray-300 bg-white px-3 py-2 text-sm" />
            </label>
          </div>
        </section>

        {/* キャンセルについて */}
        <section className="bg-gray-50 px-4 py-5">
          <h2 className="mb-3 text-lg font-bold">キャンセルについて</h2>
          <BookingCancellationTerms
            state={cancellationTerms}
            agreed={lateCancelAgreed}
            onAgreedChange={setLateCancelAgreed}
            eventId={eventId}
            storeId={storeId}
            organizationSlug={organizationSlug}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            人数が集まらないときの公演中止の条件・連絡方法は店舗の規定をご確認ください。
            <CancellationPolicyLink eventId={eventId} organizationSlug={organizationSlug} storeId={storeId} className="ml-1 underline" />
          </p>
        </section>

        <section className="px-4 py-5">
          <h2 className="text-lg font-bold">参加の前に</h2>
          <div className="mt-3">
            <BookingNotice eventId={eventId} mode="schedule" storeId={storeId} organizationSlug={organizationSlug} />
          </div>
        </section>

        {/* 確定ボタン（満席ならキャンセル待ち） */}
        <section className="space-y-2 border-t border-gray-200 px-4 py-5">
          {errorBox}
          {isSoldOut ? (
            <>
              <p className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="block text-sm font-bold">この回は満席です</span>
                キャンセル待ちに登録すると、空きが出たときにメールでお知らせします。
              </p>
              {!waitlistMode ? (
                <button type="button" onClick={() => setWaitlistMode(true)} className="h-12 w-full border border-gray-900 text-base font-bold">キャンセル待ちに登録</button>
              ) : (
                <>
                  <div className="flex items-center justify-between border border-gray-200 px-4 py-3">
                    <span className="text-sm font-bold">希望人数</span>
                    <div className="flex items-center gap-4">
                      <button type="button" aria-label="1人減らす" onClick={() => setWaitlistParticipantCount(Math.max(1, waitlistParticipantCount - 1))} disabled={waitlistParticipantCount <= 1} className="h-9 w-9 rounded-full border border-gray-300 disabled:opacity-40">−</button>
                      <span className="min-w-8 text-center font-bold">{waitlistParticipantCount}人</span>
                      <button type="button" aria-label="1人増やす" onClick={() => setWaitlistParticipantCount(Math.min(10, waitlistParticipantCount + 1))} disabled={waitlistParticipantCount >= 10} className="h-9 w-9 rounded-full border border-gray-300 disabled:opacity-40">＋</button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleWaitlistSubmit}
                    disabled={waitlistSubmitting || !customerName || !customerEmail || !hasNonEmptyCustomerPhone(customerPhone) || !/^\d{10,11}$/.test(customerPhone.replace(/[-\s]/g, ''))}
                    className="h-12 w-full text-base font-bold text-white disabled:opacity-40"
                    style={{ backgroundColor: accent }}
                  >{waitlistSubmitting ? '登録中…' : 'キャンセル待ちに登録する'}</button>
                  <button type="button" onClick={() => setWaitlistMode(false)} className="h-11 w-full text-sm">閉じる</button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || !couponReady || !termsGate.canSubmit || duplicateBlocks}
                className="h-14 w-full text-base font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: accent }}
                data-testid="booking-submit"
              >
                {isSubmitting ? (progress ? BOOKING_PROGRESS_LABELS[progress] : '予約処理中…') : duplicateBlocks ? '重複のため予約不可' : '予約を確定する'}
              </button>
              {isSubmitting ? (
                <p className="text-center text-xs text-muted-foreground" role="status">数秒かかることがあります。画面を閉じずにお待ちください。</p>
              ) : needsLateCancelAgreement ? (
                <p className="text-center text-xs text-red-700">上の「キャンセル料がかかることを確認しました」にチェックを入れると予約できます。</p>
              ) : !termsGate.canSubmit ? (
                <p className={`text-center text-xs ${cancellationTerms.status === 'loading' ? 'text-muted-foreground' : 'text-red-700'}`} data-testid="booking-terms-gate-message">{termsGate.message}</p>
              ) : (
                <p className="text-center text-xs text-muted-foreground">確定すると、確認メールをお送りします</p>
              )}
            </>
          )}
        </section>
      </div>

      {/* 時間帯が重なる別の公演の予約の確認（警告のあと続けられる） */}
      <TimeConflictConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        existing={duplicateWarning.existingReservation ?? null}
        onConfirm={handleConfirmDuplicate}
      />
    </div>
  )
}
