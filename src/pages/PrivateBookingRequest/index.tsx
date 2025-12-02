import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from '../BookingConfirmation/hooks/useCustomerData'
import { usePrivateBookingForm } from './hooks/usePrivateBookingForm'
import { usePrivateBookingSubmit } from './hooks/usePrivateBookingSubmit'
import { formatDate } from './utils/privateBookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import type { PrivateBookingRequestProps } from './types'

export function PrivateBookingRequest({
  scenarioTitle,
  scenarioId,
  participationFee,
  maxParticipants,
  selectedTimeSlots,
  selectedStoreIds,
  stores,
  onBack,
  onComplete
}: PrivateBookingRequestProps) {
  const { user } = useAuth()

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
    notes,
    setNotes,
    error,
    setError,
    validateForm
  } = usePrivateBookingForm()

  const { isSubmitting, success, handleSubmit } = usePrivateBookingSubmit({
    scenarioTitle,
    scenarioId,
    participationFee,
    maxParticipants,
    selectedTimeSlots,
    selectedStoreIds,
    stores,
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
      await handleSubmit(customerName, customerEmail, customerPhone, notes)
      
      // 3秒後に自動的に戻る
      setTimeout(() => {
        if (onComplete) {
          onComplete()
        }
      }, 3000)
    } catch (error: any) {
      setError(error.message || '処理中にエラーが発生しました')
    }
  }

  // 成功画面
  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        
        <div className="container mx-auto max-w-3xl px-2 md:px-4 py-12">
          <Card className="border-2 border-purple-200 bg-purple-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-purple-600 mx-auto" />
              <h2 className="text-lg text-purple-800">貸切リクエストを受け付けました！</h2>
              <p className="text-sm text-purple-700 leading-relaxed">
                リクエストありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。<br />
                担当者より折り返しご連絡させていただきます。
              </p>
              <div className="pt-4">
                <Button
                  onClick={() => window.location.hash = 'customer-booking'}
                  className="bg-purple-600 hover:bg-purple-700"
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

  const totalPrice = participationFee * maxParticipants

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-2 md:px-4 py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            シナリオ詳細に戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-2 md:px-4 py-6">
        <h1 className="text-xl font-bold mb-6">貸切リクエスト確認</h1>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左側：リクエスト内容 */}
          <div className="md:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">シナリオ情報</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-base font-medium mb-2">{scenarioTitle}</h3>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                      貸切予約
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>最大 {maxParticipants} 名まで</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 候補日時 */}
            <div>
              <h2 className="text-base font-semibold mb-3">候補日時（{selectedTimeSlots.length}件）</h2>
              <div className="space-y-2">
                {selectedTimeSlots.map((slot, index) => (
                  <Card key={index}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                            候補 {index + 1}
                          </Badge>
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>{formatDate(slot.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{slot.slot.label} {slot.slot.startTime} - {slot.slot.endTime}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* 希望店舗 */}
            <div>
              <h2 className="text-base font-semibold mb-3">希望店舗</h2>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      {selectedStoreIds.map((storeId) => {
                        const store = stores.find(s => s.id === storeId)
                        return (
                          <div key={storeId} className="mb-2 last:mb-0">
                            <p className="text-sm">{store?.name || ''}</p>
                            {store?.address && (
                              <p className="text-muted-foreground text-xs">{store.address}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {selectedStoreIds.length > 1 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ※ 最終的な開催店舗は、候補日時と合わせて店舗側が決定します
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">お客様情報</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">メールアドレス *</Label>
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
                    <Label className="text-sm font-medium mb-1.5 block">電話番号 *</Label>
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
                    <Label className="text-sm font-medium mb-1.5 block">ご要望・備考（任意）</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="開催日時や店舗のご希望などがあればご記入ください"
                      rows={4}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3">料金（目安）</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費（1名）</span>
                    <span>¥{participationFee.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">貸切人数</span>
                    <span>{maxParticipants}名</span>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold">合計（目安）</span>
                      <span className="text-lg text-purple-600 font-bold">¥{totalPrice.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      ※ 実際の料金は店舗との調整により変動する場合があります
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              mode="private"
              storeId={selectedStoreIds[0] || null}
            />

            <Button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
            >
              {isSubmitting ? 'リクエスト送信中...' : '貸切リクエストを送信'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

