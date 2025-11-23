import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface BookingConfirmationProps {
  eventId: string
  scenarioTitle: string
  scenarioId: string
  storeId?: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
  storeColor?: string
  maxParticipants: number
  currentParticipants: number
  participationFee: number
  initialParticipantCount?: number
  onBack: () => void
  onComplete?: () => void
}

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
  const [participantCount, setParticipantCount] = useState(initialParticipantCount)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const availableSeats = maxParticipants - currentParticipants

  useEffect(() => {
    if (user) {
      loadCustomerInfo()
    }
  }, [user])

  const loadCustomerInfo = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('name, email, phone')
        .eq('user_id', user.id)
        .single()
      
      if (error) {
        // customersテーブルにデータがない場合はログインユーザーのメールのみ設定
        setCustomerEmail(user.email || '')
        return
      }
      
      if (data) {
        setCustomerName(data.name || '')
        setCustomerEmail(data.email || user.email || '')
        setCustomerPhone(data.phone || '')
      }
    } catch (error) {
      // エラーの場合もログインユーザーのメールを設定
      setCustomerEmail(user.email || '')
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const validateForm = (): boolean => {
    if (!customerName.trim()) {
      setError('お名前を入力してください')
      return false
    }
    if (!customerEmail.trim()) {
      setError('メールアドレスを入力してください')
      return false
    }
    if (!customerPhone.trim()) {
      setError('電話番号を入力してください')
      return false
    }
    if (participantCount > availableSeats) {
      setError(`予約可能な人数は${availableSeats}名までです`)
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    setError(null)
    
    if (!validateForm()) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    setIsSubmitting(true)

    try {
      // 予約番号を生成（日付 + タイムスタンプ）
      const reservationNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`
      
      // 現在の日時を取得
      const now = new Date().toISOString()
      
      // 公演の日時を組み合わせる
      const eventDateTime = `${eventDate}T${startTime}`
      
      // 顧客レコードを取得または作成
      let customerId: string | null = null
      
      try {
        // 既存の顧客レコードを検索
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (existingCustomer) {
          customerId = existingCustomer.id
          
          // 顧客情報を更新
          await supabase
            .from('customers')
            .update({
              name: customerName,
              phone: customerPhone,
              email: customerEmail
            })
            .eq('id', customerId)
        } else {
          // 新規顧客レコードを作成
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              user_id: user.id,
              name: customerName,
              phone: customerPhone,
              email: customerEmail
            })
            .select('id')
            .single()
          
          if (!customerError && newCustomer) {
            customerId = newCustomer.id
          }
        }
      } catch (error) {
        logger.error('顧客レコードの作成/更新エラー:', error)
        // エラーでも予約は続行（customer_idなしで）
      }
      
      // 予約データを作成
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          event_id: eventId,
          schedule_event_id: eventId, // schedule_event_idも設定
          title: `${scenarioTitle} - ${formatDate(eventDate)}`,
          reservation_number: reservationNumber,
          scenario_id: scenarioId,
          store_id: storeId || null,
          customer_id: customerId,
          requested_datetime: eventDateTime,
          actual_datetime: eventDateTime,
          duration: 180, // デフォルト3時間
          participant_count: participantCount,
          base_price: participationFee * participantCount,
          total_price: participationFee * participantCount,
          final_price: participationFee * participantCount,
          status: 'confirmed',
          customer_notes: notes || null,
          created_by: user.id,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone
        })
        .select()
        .single()

      if (reservationError) {
        logger.error('予約エラー:', reservationError)
        setError('予約の作成に失敗しました。もう一度お試しください。')
        setIsSubmitting(false)
        return
      }

      // 公演の参加者数を更新
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({
          current_participants: currentParticipants + participantCount
        })
        .eq('id', eventId)

      if (updateError) {
        logger.error('参加者数の更新エラー:', updateError)
        // エラーだが予約は作成されているので成功とする
      }

      // 予約確認メールを送信
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        const emailResponse = await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            reservationId: reservationData.id,
            customerEmail: customerEmail,
            customerName: customerName,
            scenarioTitle: scenarioTitle,
            eventDate: eventDate,
            startTime: startTime,
            endTime: endTime,
            storeName: storeName,
            storeAddress: storeAddress,
            participantCount: participantCount,
            totalPrice: participationFee * participantCount,
            reservationNumber: reservationNumber
          }
        })

        if (emailResponse.error) {
          logger.error('メール送信エラー:', emailResponse.error)
          // メール送信失敗してもエラー表示はしない（予約自体は成功しているため）
        } else {
          logger.log('予約確認メールを送信しました')
        }
      } catch (emailError) {
        logger.error('メール送信処理エラー:', emailError)
        // メール送信失敗してもエラー表示はしない
      }

      setSuccess(true)
      
      // 3秒後に完了コールバックを実行
      setTimeout(() => {
        if (onComplete) {
          onComplete()
        }
      }, 3000)
    } catch (error) {
      logger.error('予約処理エラー:', error)
      setError('予約処理中にエラーが発生しました')
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        
        <div className="container mx-auto max-w-3xl px-6 py-12">
          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <h2 className="text-green-800">予約が完了しました！</h2>
              <p className="text-green-700">
                ご予約ありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。
              </p>
              <div className="pt-4">
                <Button
                  onClick={() => window.location.hash = 'customer-booking'}
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-6 py-2">
          <Button
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-1.5 hover:bg-accent h-8 px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">シナリオ詳細に戻る</span>
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-6 py-6">
        <h1 className="mb-6">予約確認</h1>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：予約内容 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 公演情報 */}
            <div>
              <h2 className="text-lg mb-3">公演情報</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-xl mb-2">{scenarioTitle}</h3>
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
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 参加人数 */}
            <div>
              <h2 className="text-lg mb-3">参加人数</h2>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="mb-1">予約人数</p>
                      <p className="text-sm text-muted-foreground">
                        残り{availableSeats}席
                      </p>
                    </div>
                    <select 
                      className="border rounded px-4 py-2"
                      value={participantCount}
                      onChange={(e) => setParticipantCount(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.min(availableSeats, 8) }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}名
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="text-lg mb-3">お客様情報</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <label className="text-sm mb-1.5 block">
                      お名前 <span className="text-red-500">*</span>
                    </label>
                    <Input 
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田太郎"
                      disabled={!user}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm mb-1.5 block">
                      メールアドレス <span className="text-red-500">*</span>
                    </label>
                    <Input 
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="example@email.com"
                      disabled={!user}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      予約確認メールをお送りします
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm mb-1.5 block">
                      電話番号 <span className="text-red-500">*</span>
                    </label>
                    <Input 
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="09012345678"
                      disabled={!user}
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm mb-1.5 block">
                      備考（任意）
                    </label>
                    <Textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="アレルギーや特記事項があればご記入ください"
                      rows={3}
                      disabled={!user}
                    />
                  </div>

                  {!user && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                      予約にはログインが必要です
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <h2 className="text-lg">料金</h2>
              
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>参加費（1名）</span>
                    <span>¥{participationFee.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span>人数</span>
                    <span>× {participantCount}名</span>
                  </div>
                  
                  <div className="border-t pt-3 flex justify-between text-lg">
                    <span>合計</span>
                    <span className="text-blue-600">
                      ¥{(participationFee * participantCount).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                    <p className="mb-1">現地決済</p>
                    <p className="text-xs">当日会場にてお支払いください</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                  <p>• キャンセルは公演開始の24時間前まで無料</p>
                  <p>• 遅刻された場合、入場をお断りする場合があります</p>
                  <p>• 予約確定後、確認メールをお送りします</p>
                </CardContent>
              </Card>

              {user ? (
                <Button
                  className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '予約処理中...' : '予約を確定する'}
                </Button>
              ) : (
                <Button
                  className="w-full h-12 text-lg"
                  onClick={() => window.location.hash = 'login'}
                >
                  ログインして予約する
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
