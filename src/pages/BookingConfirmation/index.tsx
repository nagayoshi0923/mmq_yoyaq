import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, Minus, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from './hooks/useCustomerData'
import { useBookingForm } from './hooks/useBookingForm'
import { useBookingSubmit } from './hooks/useBookingSubmit'
import { formatDate, formatTime, formatPrice } from './utils/bookingFormatters'
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
  onBack,
  onComplete
}: BookingConfirmationProps) {
  const { user } = useAuth()
  const availableSeats = maxParticipants - currentParticipants

  // フック
  const {
    customerName,
    setCustomerName,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone
  } = useCustomerData({ userId: user?.id, userEmail: user?.email })

  const {
    participantCount,
    notes,
    setNotes,
    error,
    setError,
    validateForm,
    incrementCount,
    decrementCount
  } = useBookingForm({ initialParticipantCount, availableSeats })

  const { isSubmitting, success, handleSubmit } = useBookingSubmit({
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

    try {
      await handleSubmit(customerName, customerEmail, customerPhone, participantCount, notes)
      
      // 3秒後に自動的に戻る
      setTimeout(() => {
        if (onComplete) {
          onComplete()
        }
      }, 3000)
    } catch (error: any) {
      setError(error.message || '予約処理中にエラーが発生しました')
    }
  }

  // 成功画面
  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        
        <div className="container mx-auto max-w-3xl px-[10px] py-8 xs:py-10 sm:py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-4 sm:p-6 md:p-8 text-center space-y-4">
              <CheckCircle2 className="w-12 sm:w-14 md:w-16 h-12 sm:h-14 md:h-16 text-green-600 mx-auto" />
              <h2 className="text-lg md:text-lg text-green-800">予約が完了しました！</h2>
              <p className="text-base text-green-700 leading-relaxed">
                ご予約ありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。
              </p>
              <div className="pt-3 sm:pt-4 md:pt-5">
                <Button
                  onClick={() => window.location.hash = 'customer-booking'}
                  className="bg-green-600 hover:bg-green-700 text-base h-10 sm:h-11"
                >
                  予約サイトトップに戻る
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
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* 戻るボタン */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-5xl px-[10px] py-1.5 xs:py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-0.5 xs:gap-1 sm:gap-1.5 hover:bg-accent h-8 xs:h-9 sm:h-10 px-1.5 xs:px-2 sm:px-3 text-xs">
            <ArrowLeft className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="hidden xs:inline">シナリオ詳細に戻る</span>
            <span className="xs:hidden">戻</span>
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-[10px] py-4 xs:py-5 sm:py-6">
        <h1 className="text-lg md:text-lg mb-4 sm:mb-6 md:mb-8">予約確認</h1>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 md:gap-8">
          {/* 左側：予約内容 */}
          <div className="lg:col-span-2 space-y-5 sm:space-y-6 md:space-y-8">
            {/* 公演情報 */}
            <div>
              <h2 className="text-base mb-3 sm:mb-4">公演情報</h2>
              <Card>
                <CardContent className="p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4">
                  <div>
                    <h3 className="text-sm sm:text-lg md:text-lg mb-3 sm:mb-4">{scenarioTitle}</h3>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="">{formatDate(eventDate)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{formatTime(startTime)} - {formatTime(endTime)}</span>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="" style={{ color: storeColor }}>{storeName}</p>
                        {storeAddress && (
                          <p className="text-muted-foreground text-xs">{storeAddress}</p>
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

            {/* 参加人数 */}
            <div>
              <h2 className="text-base mb-3 sm:mb-4">参加人数</h2>
              <Card>
                <CardContent className="p-4 sm:p-5 md:p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">参加人数</span>
                    <div className="flex items-center gap-2 sm:gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={decrementCount}
                        disabled={participantCount <= 1}
                        className="text-sm h-8 sm:h-9"
                      >
                        <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                      <span className="text-sm sm:text-base w-12 sm:w-16 text-center">{participantCount}名</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={incrementCount}
                        disabled={participantCount >= availableSeats}
                        className="text-sm h-8 sm:h-9"
                      >
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="text-base mb-3 sm:mb-4">お客様情報</h2>
              <Card>
                <CardContent className="p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5">
                  <div>
                    <Label className="text-sm mb-2 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm mb-2 block">メールアドレス *</Label>
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
                    <Label className="text-sm mb-2 block">電話番号 *</Label>
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
                    <Label className="text-sm mb-2 block">備考（任意）</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ご要望などがあればご記入ください"
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="space-y-4 sm:space-y-7 md:space-y-8">
            <div>
              <h2 className="text-base mb-3 sm:mb-4">料金</h2>
              <Card>
                <CardContent className="p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4">
                  <div className="flex justify-between text-sm">
                    <span>参加費（1名）</span>
                    <span>¥{formatPrice(participationFee)}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>参加人数</span>
                    <span>{participantCount}名</span>
                  </div>

                  <div className="border-t pt-3 sm:pt-4">
                    <div className="flex justify-between text-base">
                      <span>合計</span>
                      <span className="text-primary">¥{formatPrice(totalPrice)}</span>
                    </div>
                  </div>

                  <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className="w-full text-sm sm:text-base h-10 sm:h-11"
                    size="lg"
                  >
                    {isSubmitting ? '予約処理中...' : '予約を確定する'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4 sm:p-5 text-sm sm:text-base text-blue-800 space-y-2">
                <p className="">ご注意事項</p>
                <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm">
                  <li>予約確定後、確認メールが送信されます</li>
                  <li>当日の連絡先として電話番号が必要です</li>
                  <li>キャンセルポリシーをご確認ください</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

