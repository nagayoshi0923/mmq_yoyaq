import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, Minus, Plus, ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from './hooks/useCustomerData'
import { useBookingForm } from './hooks/useBookingForm'
import { useBookingSubmit } from './hooks/useBookingSubmit'
import { formatDate, formatTime, formatPrice } from './utils/bookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
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
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : '/queens-waltz'
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
      <div className="min-h-screen bg-background overflow-x-hidden">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        
        <div className="container mx-auto max-w-7xl px-4 py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-lg text-green-800">予約が完了しました！</h2>
              <p className="text-sm text-green-700 leading-relaxed">
                ご予約ありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。
              </p>
              <div className="pt-4">
                <Button
                  onClick={() => window.location.href = bookingBasePath}
                  className="bg-green-600 hover:bg-green-700"
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-7xl px-4 py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            シナリオ詳細に戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-3">
        <h1 className="text-lg md:text-xl font-bold mb-4">予約確認</h1>

        {error && (
          <Card className="mb-4 border-2 border-red-200 bg-red-50">
            <CardContent className="p-3 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* 左側：予約内容 */}
          <div className="md:col-span-8 space-y-4">
            {/* 公演情報 */}
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">公演情報</h2>
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div>
                    <h3 className="text-lg font-bold">{scenarioTitle}</h3>
                  </div>

                  <div className="space-y-2 text-sm">
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

            {/* 参加人数 */}
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">参加人数</h2>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">参加人数</span>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={decrementCount}
                        disabled={participantCount <= 1}
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="text-sm w-12 text-center">{participantCount}名</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={incrementCount}
                        disabled={participantCount >= availableSeats}
                        className="h-8 w-8 p-0"
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
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">お客様情報</h2>
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1.5 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground mb-1.5 block">メールアドレス *</Label>
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
                    <Label className="text-sm font-medium text-muted-foreground mb-1.5 block">電話番号 *</Label>
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
                    <Label className="text-sm font-medium text-muted-foreground mb-1.5 block">備考（任意）</Label>
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
          <div className="md:col-span-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground">料金</h2>
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費（1名）</span>
                    <span>¥{formatPrice(participationFee)}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加人数</span>
                    <span>{participantCount}名</span>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold">合計</span>
                      <span className="text-base text-primary font-bold">¥{formatPrice(totalPrice)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              mode="schedule"
              storeId={storeId}
            />

            <Button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="w-full h-9 text-sm"
            >
              {isSubmitting ? '予約処理中...' : '予約を確定する'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

