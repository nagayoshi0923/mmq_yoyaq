import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
        
        <div className="container mx-auto max-w-3xl px-3 xs:px-4 sm:px-6 py-8 xs:py-10 sm:py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-4 xs:p-6 sm:p-8 text-center space-y-4">
              <CheckCircle2 className="w-12 xs:w-14 sm:w-16 h-12 xs:h-14 sm:h-16 text-green-600 mx-auto" />
              <h2 className="text-lg xs:text-xl sm:text-2xl font-bold text-green-800 leading-tight">予約が完了しました！</h2>
              <p className="text-xs xs:text-sm sm:text-base text-green-700 leading-relaxed">
                ご予約ありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。
              </p>
              <div className="pt-2 xs:pt-3 sm:pt-4">
                <Button
                  onClick={() => window.location.hash = 'customer-booking'}
                  className="bg-green-600 hover:bg-green-700 text-xs xs:text-sm sm:text-base h-8 xs:h-9 sm:h-10"
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
        <div className="container mx-auto max-w-5xl px-3 xs:px-4 sm:px-6 py-1.5 xs:py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-0.5 xs:gap-1 sm:gap-1.5 hover:bg-accent h-8 xs:h-9 sm:h-10 px-1.5 xs:px-2 sm:px-3 text-xs">
            <ArrowLeft className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="hidden xs:inline">シナリオ詳細に戻る</span>
            <span className="xs:hidden">戻</span>
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-3 xs:px-4 sm:px-6 py-4 xs:py-5 sm:py-6">
        <h1 className="text-xl xs:text-2xl sm:text-3xl font-bold mb-4 xs:mb-5 sm:mb-6 leading-tight">予約確認</h1>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 xs:gap-5 sm:gap-6">
          {/* 左側：予約内容 */}
          <div className="lg:col-span-2 space-y-4 xs:space-y-5 sm:space-y-6">
            {/* 公演情報 */}
            <div>
              <h2 className="font-bold text-base xs:text-lg sm:text-lg mb-2 xs:mb-3">公演情報</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-xl mb-2">{scenarioTitle}</h3>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{formatDate(eventDate)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{formatTime(startTime)} - {formatTime(endTime)}</span>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium" style={{ color: storeColor }}>{storeName}</p>
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
              <h2 className="font-bold text-lg mb-3">参加人数</h2>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">参加人数</span>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={decrementCount}
                        disabled={participantCount <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="font-bold text-lg w-12 text-center">{participantCount}名</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={incrementCount}
                        disabled={participantCount >= availableSeats}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="font-bold text-lg mb-3">お客様情報</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">お名前 *</label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">メールアドレス *</label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="example@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">電話番号 *</label>
                    <Input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="090-1234-5678"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">備考（任意）</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ご要望などがあればご記入ください"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="space-y-6">
            <div>
              <h2 className="font-bold text-lg mb-3">料金</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>参加費（1名）</span>
                    <span>¥{formatPrice(participationFee)}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>参加人数</span>
                    <span>{participantCount}名</span>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between font-bold text-lg">
                      <span>合計</span>
                      <span className="text-primary">¥{formatPrice(totalPrice)}</span>
                    </div>
                  </div>

                  <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className="w-full"
                    size="lg"
                  >
                    {isSubmitting ? '予約処理中...' : '予約を確定する'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4 text-sm text-blue-800 space-y-2">
                <p className="font-medium">ご注意事項</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
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

