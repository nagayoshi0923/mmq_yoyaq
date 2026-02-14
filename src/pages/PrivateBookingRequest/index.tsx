import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from '../BookingConfirmation/hooks/useCustomerData'
import { usePrivateBookingForm } from './hooks/usePrivateBookingForm'
import { usePrivateBookingSubmit } from './hooks/usePrivateBookingSubmit'
import { formatDate } from './utils/privateBookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import type { PrivateBookingRequestProps, TimeSlot } from './types'

const MAX_TIME_SLOTS = 6

const TIME_SLOT_OPTIONS: TimeSlot[] = [
  { label: '午前', startTime: '09:00', endTime: '12:00' },
  { label: '午後', startTime: '12:00', endTime: '17:00' },
  { label: '夜間', startTime: '17:00', endTime: '22:00' }
]

export function PrivateBookingRequest({
  scenarioTitle,
  scenarioId,
  participationFee,
  maxParticipants,
  selectedTimeSlots: initialTimeSlots,
  selectedStoreIds: initialStoreIds,
  stores,
  scenarioAvailableStores,
  organizationSlug,
  onBack,
  onComplete
}: PrivateBookingRequestProps) {
  const { user } = useAuth()
  
  // 編集可能な候補日時
  const [editableTimeSlots, setEditableTimeSlots] = useState(initialTimeSlots)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newSlotLabel, setNewSlotLabel] = useState('')

  // 表示する全有効店舗（オフィス除外）
  const displayStores = useMemo(() => {
    return stores.filter((s: any) => 
      s.ownership_type !== 'office' && s.status === 'active'
    )
  }, [stores])

  // シナリオ対応店舗IDセット（null = 全店舗対応）
  const scenarioAvailableSet = useMemo(() => {
    if (scenarioAvailableStores && scenarioAvailableStores.length > 0) {
      return new Set(scenarioAvailableStores)
    }
    return null
  }, [scenarioAvailableStores])

  // 編集可能な希望店舗（初期値をシナリオ対応店舗でフィルタ）
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(() => {
    const filtered = initialStoreIds.filter(id => {
      const isValid = displayStores.some((s: any) => s.id === id)
      const isAvailable = scenarioAvailableSet === null || scenarioAvailableSet.has(id)
      return isValid && isAvailable
    })
    return filtered.length > 0 ? filtered : []
  })

  // 追加可能な日付の範囲（今日から60日後まで）
  const dateRange = useMemo(() => {
    const today = new Date()
    const minDate = today.toISOString().split('T')[0]
    const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return { minDate, maxDate }
  }, [])

  const handleAddTimeSlot = () => {
    if (!newDate || !newSlotLabel) return
    const slot = TIME_SLOT_OPTIONS.find(s => s.label === newSlotLabel)
    if (!slot) return
    
    // 重複チェック
    const isDuplicate = editableTimeSlots.some(
      ts => ts.date === newDate && ts.slot.label === newSlotLabel
    )
    if (isDuplicate) return

    setEditableTimeSlots(prev => [...prev, { date: newDate, slot }])
    setNewDate('')
    setNewSlotLabel('')
    setShowAddForm(false)
  }

  const handleRemoveTimeSlot = (index: number) => {
    setEditableTimeSlots(prev => prev.filter((_, i) => i !== index))
  }
  
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : '/queens-waltz'

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
    selectedTimeSlots: editableTimeSlots,
    selectedStoreIds,
    stores,
    userId: user?.id
  })

  // 予約送信ハンドラ
  const onSubmit = async () => {
    setError(null)
    
    if (editableTimeSlots.length === 0) {
      setError('候補日時を1件以上選択してください')
      return
    }

    if (selectedStoreIds.length === 0) {
      setError('希望店舗を1つ以上選択してください')
      return
    }
    
    if (!validateForm(customerName, customerEmail, customerPhone)) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    try {
      await handleSubmit(customerName, customerEmail, customerPhone, notes, customerNickname)
      
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
      <div className="min-h-screen bg-background overflow-x-clip">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        
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
                  onClick={() => window.location.href = bookingBasePath}
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
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

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
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">候補日時（{editableTimeSlots.length}/{MAX_TIME_SLOTS}件）</h2>
                {editableTimeSlots.length < MAX_TIME_SLOTS && !showAddForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddForm(true)}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    追加
                  </Button>
                )}
              </div>
              
              {/* 追加フォーム */}
              {showAddForm && (
                <Card className="mb-3 border-purple-200 bg-purple-50">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium text-purple-800">候補日時を追加</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">日付</Label>
                        <Input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          min={dateRange.minDate}
                          max={dateRange.maxDate}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">時間帯</Label>
                        <Select value={newSlotLabel} onValueChange={setNewSlotLabel}>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="選択..." />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOT_OPTIONS.map((slot) => (
                              <SelectItem key={slot.label} value={slot.label}>
                                {slot.label}（{slot.startTime}〜{slot.endTime}）
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false)
                          setNewDate('')
                          setNewSlotLabel('')
                        }}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddTimeSlot}
                        disabled={!newDate || !newSlotLabel}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        追加する
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="space-y-2">
                {editableTimeSlots.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-4 text-center text-muted-foreground text-sm">
                      候補日時を追加してください
                    </CardContent>
                  </Card>
                ) : (
                  editableTimeSlots.map((slot, index) => (
                    <Card key={`${slot.date}-${slot.slot.label}`}>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTimeSlot(index)}
                          className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 h-auto"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* 希望店舗 */}
            <div>
              <h2 className="text-base font-semibold mb-3">希望店舗</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    希望する店舗を選択してください（複数選択可）
                  </p>
                  <div className="space-y-2">
                    {displayStores.map((store: any) => {
                      const isSelected = selectedStoreIds.includes(store.id)
                      const isUnavailable = scenarioAvailableSet !== null && !scenarioAvailableSet.has(store.id)
                      
                      return (
                        <label
                          key={store.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            isUnavailable
                              ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'border-purple-300 bg-purple-50 cursor-pointer'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isUnavailable}
                            onChange={() => {
                              if (isUnavailable) return
                              setSelectedStoreIds(prev =>
                                isSelected
                                  ? prev.filter(id => id !== store.id)
                                  : [...prev, store.id]
                              )
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isUnavailable ? 'text-gray-400' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-medium ${isUnavailable ? 'text-gray-400' : ''}`}>{store.name}</span>
                              {isUnavailable && (
                                <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">対応不可</span>
                              )}
                            </div>
                            {store.address && (
                              <p className={`text-xs mt-0.5 ml-5.5 ${isUnavailable ? 'text-gray-400' : 'text-muted-foreground'}`}>{store.address}</p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  {selectedStoreIds.length === 0 && (
                    <p className="text-xs text-orange-600">
                      ※ 店舗を1つ以上選択してください
                    </p>
                  )}
                  {selectedStoreIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
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
                    <Label className="text-sm font-medium mb-1.5 block">ニックネーム</Label>
                    <Input
                      value={customerNickname}
                      onChange={(e) => setCustomerNickname(e.target.value)}
                      placeholder="タロウ"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">店舗で呼ばれる際のお名前（任意）</p>
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

