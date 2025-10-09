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

interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

interface PrivateBookingRequestProps {
  scenarioTitle: string
  scenarioId: string
  participationFee: number
  maxParticipants: number
  selectedTimeSlots: Array<{date: string, slot: TimeSlot}>
  onBack: () => void
  onComplete?: () => void
}

export function PrivateBookingRequest({
  scenarioTitle,
  scenarioId,
  participationFee,
  maxParticipants,
  selectedTimeSlots,
  onBack,
  onComplete
}: PrivateBookingRequestProps) {
  const { user } = useAuth()
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
        setCustomerEmail(user.email || '')
        return
      }
      
      if (data) {
        setCustomerName(data.name || '')
        setCustomerEmail(data.email || user.email || '')
        setCustomerPhone(data.phone || '')
      }
    } catch (error) {
      setCustomerEmail(user.email || '')
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
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
      // 顧客レコードを取得または作成
      let customerId: string | null = null
      
      try {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .single()
        
        if (existingCustomer) {
          customerId = existingCustomer.id
          
          await supabase
            .from('customers')
            .update({
              name: customerName,
              phone: customerPhone,
              email: customerEmail
            })
            .eq('id', customerId)
        } else {
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
        console.error('顧客レコードの作成/更新エラー:', error)
      }

      // 各候補日時に対して貸切リクエストを作成
      const requests = selectedTimeSlots.map(async (slot, index) => {
        const reservationNumber = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-PV${Date.now().toString().slice(-6)}-${index + 1}`
        const eventDateTime = `${slot.date}T${slot.slot.startTime}`
        
        return supabase
          .from('reservations')
          .insert({
            title: `【貸切希望】${scenarioTitle} - ${formatDate(slot.date)} ${slot.slot.label}`,
            reservation_number: reservationNumber,
            scenario_id: scenarioId,
            customer_id: customerId,
            requested_datetime: eventDateTime,
            actual_datetime: eventDateTime,
            duration: 180,
            participant_count: maxParticipants,
            base_price: participationFee * maxParticipants,
            total_price: participationFee * maxParticipants,
            final_price: participationFee * maxParticipants,
            status: 'pending',
            customer_notes: notes || null,
            created_by: user.id,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            reservation_source: 'web_private'
          })
      })

      const results = await Promise.all(requests)
      
      // エラーチェック
      const hasError = results.some(r => r.error)
      if (hasError) {
        console.error('貸切リクエストエラー:', results.filter(r => r.error))
        setError('貸切リクエストの送信に失敗しました。もう一度お試しください。')
        setIsSubmitting(false)
        return
      }

      setSuccess(true)
      
      setTimeout(() => {
        if (onComplete) {
          onComplete()
        }
      }, 3000)
    } catch (error) {
      console.error('貸切リクエスト処理エラー:', error)
      setError('処理中にエラーが発生しました')
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        
        <div className="container mx-auto max-w-3xl px-6 py-12">
          <Card className="border-2 border-purple-200 bg-purple-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-purple-600 mx-auto" />
              <h2 className="text-2xl font-bold text-purple-800">貸切リクエストを受け付けました！</h2>
              <p className="text-purple-700">
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
        <h1 className="text-3xl font-bold mb-2">貸切リクエスト確認</h1>
        <p className="text-muted-foreground mb-6">候補日時を確認し、お客様情報を入力してください</p>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：リクエスト内容 */}
          <div className="lg:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <div>
              <h2 className="font-bold text-lg mb-3">シナリオ情報</h2>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold text-xl mb-2">{scenarioTitle}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>最大{maxParticipants}名</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 候補日時 */}
            <div>
              <h2 className="font-bold text-lg mb-3">候補日時</h2>
              <Card>
                <CardContent className="p-4">
                  <div className="bg-purple-50 border border-purple-200 rounded p-3 mb-3">
                    <p className="text-sm text-purple-800">
                      以下の日時のいずれかで貸切公演をご希望です。担当者が確認後、ご連絡いたします。
                    </p>
                  </div>
                  <div className="space-y-2">
                    {selectedTimeSlots.map((item, index) => {
                      const dateObj = new Date(item.date)
                      const month = dateObj.getMonth() + 1
                      const day = dateObj.getDate()
                      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                      const weekday = weekdays[dateObj.getDay()]
                      
                      return (
                        <div 
                          key={`${item.date}-${item.slot.label}`}
                          className="flex items-center gap-3 p-3 bg-accent rounded"
                        >
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                            候補{index + 1}
                          </Badge>
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {month}月{day}日({weekday})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span>
                              {item.slot.label} {item.slot.startTime} - {item.slot.endTime}
                            </span>
                          </div>
                        </div>
                      )
                    })}
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
                    <label className="text-sm font-medium mb-1.5 block">
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
                    <label className="text-sm font-medium mb-1.5 block">
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
                      確認メールをお送りします
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
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
                    <label className="text-sm font-medium mb-1.5 block">
                      ご要望・備考（任意）
                    </label>
                    <Textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="参加人数のご希望、その他ご要望があればご記入ください"
                      rows={4}
                      disabled={!user}
                    />
                  </div>

                  {!user && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                      貸切リクエストにはログインが必要です
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <h2 className="font-bold text-lg">料金（目安）</h2>
              
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>参加費（1名）</span>
                    <span>¥{participationFee.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span>最大人数</span>
                    <span>× {maxParticipants}名</span>
                  </div>
                  
                  <div className="border-t pt-3 flex justify-between font-bold text-lg">
                    <span>合計</span>
                    <span className="text-purple-600">
                      ¥{(participationFee * maxParticipants).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm text-purple-800">
                    <p className="font-medium mb-1">💎 貸切料金</p>
                    <p className="text-xs">詳細はリクエスト後にご相談させていただきます</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                  <p>• リクエスト後、担当者より折り返しご連絡します</p>
                  <p>• 候補日時から調整させていただきます</p>
                  <p>• 料金は人数や内容により変動する場合があります</p>
                </CardContent>
              </Card>

              {user ? (
                <Button
                  className="w-full h-12 text-lg font-bold bg-purple-600 hover:bg-purple-700"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '送信中...' : '貸切リクエストを送信'}
                </Button>
              ) : (
                <Button
                  className="w-full h-12 text-lg font-bold"
                  onClick={() => window.location.hash = 'login'}
                >
                  ログインして貸切リクエスト
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

