// 予約者一覧タブコンポーネント

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { ChevronDown, ChevronUp, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { EmailPreview } from './EmailPreview'
import type { Reservation, Customer, Staff } from '@/types'
import type { NewParticipant, EmailContent } from '../types'

interface ReservationsTabProps {
  reservations: Reservation[]
  loadingReservations: boolean
  selectedReservations: Set<string>
  setSelectedReservations: (set: Set<string>) => void
  expandedReservation: string | null
  setExpandedReservation: (id: string | null) => void
  staff: Staff[]
  onAddParticipant: (participant: NewParticipant) => Promise<void>
  onUpdateStatus: (reservationId: string, status: Reservation['status']) => Promise<void>
}

export function ReservationsTab({
  reservations,
  loadingReservations,
  selectedReservations,
  setSelectedReservations,
  expandedReservation,
  setExpandedReservation,
  staff,
  onAddParticipant,
  onUpdateStatus
}: ReservationsTabProps) {
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [newParticipant, setNewParticipant] = useState<NewParticipant>({
    customer_name: '',
    participant_count: 1,
    payment_method: 'onsite',
    notes: ''
  })
  const [customerNames, setCustomerNames] = useState<string[]>([])
  
  // メール関連
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  
  // キャンセル関連
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isEmailConfirmOpen, setIsEmailConfirmOpen] = useState(false)
  const [cancellingReservation, setCancellingReservation] = useState<Reservation | null>(null)
  const [emailContent, setEmailContent] = useState<EmailContent>({
    customerEmail: '',
    customerName: '',
    cancellationReason: '店舗都合によるキャンセル',
    scenarioTitle: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    storeName: '',
    participantCount: 0,
    totalPrice: 0,
    reservationNumber: '',
    cancellationFee: 0
  })

  // 顧客名リストを取得
  useEffect(() => {
    const loadCustomerNames = async () => {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('name')
          .order('name')
        
        if (error) throw error
        setCustomerNames(data?.map(c => c.name) || [])
      } catch (error) {
        logger.error('顧客名取得エラー:', error)
      }
    }
    loadCustomerNames()
  }, [])

  const handleAddParticipant = async () => {
    if (!newParticipant.customer_name) {
      alert('参加者名を入力してください')
      return
    }
    
    try {
      await onAddParticipant(newParticipant)
      setIsAddingParticipant(false)
      setNewParticipant({
        customer_name: '',
        participant_count: 1,
        payment_method: 'onsite',
        notes: ''
      })
    } catch (error) {
      logger.error('参加者追加エラー:', error)
      alert('参加者の追加に失敗しました')
    }
  }

  const handleBulkEmailSend = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      alert('件名と本文を入力してください')
      return
    }

    setSendingEmail(true)
    try {
      const selectedEmails = reservations
        .filter(r => selectedReservations.has(r.id))
        .map(r => {
          if (r.customers) {
            if (Array.isArray(r.customers)) {
              return r.customers[0]?.email
            }
            return (r.customers as Customer).email
          }
          return null
        })
        .filter((email): email is string => email !== null && email !== undefined)
      
      if (selectedEmails.length === 0) {
        alert('送信先のメールアドレスが見つかりませんでした')
        return
      }

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          recipients: selectedEmails,
          subject: emailSubject,
          body: emailBody
        }
      })
      
      if (error) throw error

      alert(`${selectedEmails.length}件のメールを送信しました`)
      setIsEmailModalOpen(false)
      setEmailSubject('')
      setEmailBody('')
      setSelectedReservations(new Set())
    } catch (error) {
      logger.error('メール送信エラー:', error)
      alert('メール送信に失敗しました')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleStatusChange = async (reservationId: string, newStatus: Reservation['status']) => {
    const reservation = reservations.find(r => r.id === reservationId)
    if (!reservation) return

    // キャンセルの場合はダイアログ表示
    if (newStatus === 'cancelled' && reservation.status !== 'cancelled') {
      setCancellingReservation(reservation)
      setIsCancelDialogOpen(true)
      return
    }

    await onUpdateStatus(reservationId, newStatus)
  }

  const handleCancelConfirm = async () => {
    if (!cancellingReservation) return
    
    try {
      await onUpdateStatus(cancellingReservation.id, 'cancelled')
      setIsCancelDialogOpen(false)
      setIsEmailConfirmOpen(true)
    } catch (error) {
      logger.error('予約キャンセルエラー:', error)
      alert('予約のキャンセルに失敗しました')
    }
  }

  const handleSendCancellationEmail = async () => {
    setSendingEmail(true)
    try {
      await supabase.functions.invoke('send-cancellation-confirmation', {
        body: emailContent
      })

      alert('キャンセル通知メールを送信しました')
      setIsEmailConfirmOpen(false)
      setCancellingReservation(null)
    } catch (error) {
      logger.error('メール送信エラー:', error)
      alert('メール送信に失敗しました')
    } finally {
      setSendingEmail(false)
    }
  }

  if (loadingReservations) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs md:text-sm">
        読み込み中...
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 md:space-y-4">
        {/* 参加者追加ボタン */}
        <div>
          {!isAddingParticipant ? (
            <Button
              onClick={() => setIsAddingParticipant(true)}
              size="sm"
              className="text-xs md:text-sm h-8 md:h-9"
            >
              + 参加者を追加
            </Button>
          ) : (
            <div className="border rounded-lg p-3 md:p-4 bg-muted/30">
              <h4 className="font-medium mb-2 md:mb-3 text-xs md:text-sm">新しい参加者を追加</h4>
              <div className="space-y-2 md:space-y-3">
                <div>
                  <Label htmlFor="customer_name" className="text-xs md:text-sm">参加者名 *</Label>
                  <AutocompleteInput
                    value={newParticipant.customer_name}
                    onChange={(value) => setNewParticipant(prev => ({ ...prev, customer_name: value }))}
                    placeholder="参加者名を入力"
                    staffOptions={staff.map(s => ({ value: s.name, label: s.name, type: 'staff' as const }))}
                    customerOptions={customerNames.map(name => ({ value: name, label: name, type: 'customer' as const }))}
                    showStaffOnFocus={true}
                    className="text-xs md:text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  <div>
                    <Label htmlFor="participant_count" className="text-xs md:text-sm">人数</Label>
                    <Input
                      id="participant_count"
                      type="number"
                      min="1"
                      value={newParticipant.participant_count}
                      onChange={(e) => setNewParticipant(prev => ({ ...prev, participant_count: parseInt(e.target.value) || 1 }))}
                      className="text-xs md:text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment_method" className="text-xs md:text-sm">支払い方法</Label>
                    <Select
                      value={newParticipant.payment_method}
                      onValueChange={(value: 'onsite' | 'online' | 'staff') => setNewParticipant(prev => ({ ...prev, payment_method: value }))}
                    >
                      <SelectTrigger className="text-xs md:text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onsite" className="text-xs md:text-sm">現地決済</SelectItem>
                        <SelectItem value="online" className="text-xs md:text-sm">事前決済</SelectItem>
                        <SelectItem value="staff" className="text-xs md:text-sm">スタッフ参加（無料）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes" className="text-xs md:text-sm">メモ</Label>
                  <Textarea
                    id="notes"
                    value={newParticipant.notes}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="特記事項があれば入力"
                    rows={2}
                    className="text-xs md:text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs md:text-sm h-7 md:h-8"
                    onClick={() => {
                      setIsAddingParticipant(false)
                      setNewParticipant({
                        customer_name: '',
                        participant_count: 1,
                        payment_method: 'onsite',
                        notes: ''
                      })
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs md:text-sm h-7 md:h-8"
                    onClick={handleAddParticipant}
                  >
                    追加
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {reservations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs md:text-sm">
            予約はありません
          </div>
        ) : (
          <div className="space-y-3">
            {selectedReservations.size > 0 && (
              <div className="p-2 md:p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                <span className="text-xs md:text-sm font-medium">
                  {selectedReservations.size}件選択中
                </span>
                <Button
                  size="sm"
                  className="text-xs md:text-sm h-7 md:h-8"
                  onClick={() => {
                    const selectedEmails = reservations
                      .filter(r => selectedReservations.has(r.id))
                      .map(r => {
                        if (r.customers) {
                          if (Array.isArray(r.customers)) return r.customers[0]?.email
                          return (r.customers as Customer).email
                        }
                        return null
                      })
                      .filter(Boolean)
                    if (selectedEmails.length > 0) {
                      setIsEmailModalOpen(true)
                    } else {
                      alert('選択した予約にメールアドレスが設定されていません')
                    }
                  }}
                >
                  <Mail className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden md:inline">メール送信</span>
                  <span className="md:hidden">送信</span>
                </Button>
              </div>
            )}

            {/* ヘッダー（PCのみ表示） */}
            <div className="hidden md:block border rounded-t-lg bg-muted/30 p-3 h-[50px]">
              <div className="flex items-center justify-between font-medium text-sm">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-[40px] flex items-center justify-center">
                    <Checkbox
                      checked={selectedReservations.size === reservations.length && reservations.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedReservations(new Set(reservations.map(r => r.id)))
                        } else {
                          setSelectedReservations(new Set())
                        }
                      }}
                    />
                  </div>
                  <span className="w-[100px]">顧客名</span>
                  <span className="w-[60px]">人数</span>
                  <span className="w-[100px]">支払い</span>
                  <span className="w-[140px]">申し込み日時</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-[100px]">ステータス</span>
                  <span className="w-[80px]"></span>
                </div>
              </div>
            </div>
            
            {/* データ行 */}
            <div className="border rounded-lg md:rounded-t-none md:border-t-0">
              {reservations.map((reservation, index) => {
                const isExpanded = expandedReservation === reservation.id
                const isLast = index === reservations.length - 1
                const customerName = reservation.customer_name || 
                  (Array.isArray(reservation.customers) ? reservation.customers[0]?.name : reservation.customers?.name) ||
                  reservation.customer_notes || '顧客名なし'
                
                const isCancelled = reservation.status === 'cancelled'
                
                return (
                  <div 
                    key={reservation.id} 
                    className={`${isLast ? '' : 'border-b'} p-2 md:p-3 ${isCancelled ? 'bg-gray-50' : ''}`}
                  >
                    {/* モバイル表示 */}
                    <div className={`md:hidden space-y-2 ${isCancelled ? 'opacity-70' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Checkbox
                            checked={selectedReservations.has(reservation.id)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedReservations)
                              if (checked) newSelected.add(reservation.id)
                              else newSelected.delete(reservation.id)
                              setSelectedReservations(newSelected)
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs truncate">{customerName}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">
                                {reservation.participant_count ? `${reservation.participant_count}名` : '-'}
                              </span>
                              <Badge 
                                variant={reservation.payment_method === 'onsite' ? 'outline' : reservation.payment_method === 'online' ? 'default' : 'secondary'} 
                                className="text-[10px] h-4 px-1"
                              >
                                {reservation.payment_method === 'onsite' ? '現地' : reservation.payment_method === 'online' ? '事前' : '未設定'}
                              </Badge>
                              {isCancelled && (
                                <Badge 
                                  variant="outline" 
                                  className="text-[10px] h-4 px-1 bg-red-50 text-red-600 border-red-200"
                                >
                                  キャンセル済み
                                </Badge>
                              )}
                              {reservation.created_at && (
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(reservation.created_at).toLocaleString('ja-JP', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <Select 
                            value={reservation.status} 
                            onValueChange={(value) => handleStatusChange(reservation.id, value as Reservation['status'])}
                          >
                            <SelectTrigger className="w-20 h-6 text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="confirmed" className="text-xs">確定</SelectItem>
                              <SelectItem value="cancelled" className="text-xs">キャンセル</SelectItem>
                              <SelectItem value="pending" className="text-xs">保留中</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-[10px]"
                            onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                          >
                            詳細
                            {isExpanded ? <ChevronUp className="ml-0.5 h-2.5 w-2.5" /> : <ChevronDown className="ml-0.5 h-2.5 w-2.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* PC表示 */}
                    <div className={`hidden md:flex items-center justify-between ${isCancelled ? 'opacity-70' : ''}`}>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-[40px] flex items-center justify-center">
                          <Checkbox
                            checked={selectedReservations.has(reservation.id)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedReservations)
                              if (checked) newSelected.add(reservation.id)
                              else newSelected.delete(reservation.id)
                              setSelectedReservations(newSelected)
                            }}
                          />
                        </div>
                        <span className="font-medium truncate w-[100px]">{customerName}</span>
                        <span className="text-sm text-muted-foreground flex-shrink-0 w-[60px]">
                          {reservation.participant_count ? `${reservation.participant_count}名` : '-'}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0 w-[100px]">
                          <Badge 
                            variant={reservation.payment_method === 'onsite' ? 'outline' : reservation.payment_method === 'online' ? 'default' : 'secondary'} 
                            className="flex-shrink-0 justify-center"
                          >
                            {reservation.payment_method === 'onsite' ? '現地決済' : reservation.payment_method === 'online' ? '事前決済' : '未設定'}
                          </Badge>
                        </div>
                        {isCancelled ? (
                          <Badge 
                            variant="outline" 
                            className="text-xs h-6 px-2 bg-red-50 text-red-600 border-red-200 w-[140px] justify-center"
                          >
                            キャンセル済み
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground w-[140px]">
                            {reservation.created_at ? new Date(reservation.created_at).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select 
                          value={reservation.status} 
                          onValueChange={(value) => handleStatusChange(reservation.id, value as Reservation['status'])}
                        >
                          <SelectTrigger className="w-[100px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">確定</SelectItem>
                            <SelectItem value="cancelled">キャンセル</SelectItem>
                            <SelectItem value="pending">保留中</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedReservation(isExpanded ? null : reservation.id)}
                        >
                          詳細
                          {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    
                    {/* 詳細エリア */}
                    {isExpanded && (
                      <div className="mt-2 md:mt-0 md:px-3 md:pb-3 md:pt-0 md:border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm md:mt-3">
                          {/* TODO: 詳細情報の実装 */}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* メール送信モーダル */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="max-w-[90vw] md:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-sm md:text-base">メール送信</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              選択した{selectedReservations.size}件の予約者にメールを送信します
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4">
            <div>
              <Label htmlFor="email-subject" className="text-xs md:text-sm">件名</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="例: 公演のご案内"
                className="text-xs md:text-sm"
              />
            </div>

            <div>
              <Label htmlFor="email-body" className="text-xs md:text-sm">本文</Label>
              <Textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="メール本文を入力してください..."
                rows={8}
                className="text-xs md:text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 md:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEmailModalOpen(false)
                  setEmailSubject('')
                  setEmailBody('')
                }}
                disabled={sendingEmail}
                className="text-xs md:text-sm h-8 md:h-9"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleBulkEmailSend}
                disabled={sendingEmail}
                className="text-xs md:text-sm h-8 md:h-9"
              >
                {sendingEmail ? '送信中...' : '送信'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* キャンセル確認ダイアログ */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-[90vw] md:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-sm md:text-base">予約をキャンセル</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              この予約をキャンセルしますか？
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 md:space-y-4">
            <div>
              <Label htmlFor="cancellation_reason" className="text-xs md:text-sm">キャンセル理由</Label>
              <Textarea
                id="cancellation_reason"
                value={emailContent.cancellationReason}
                onChange={(e) => setEmailContent(prev => ({ ...prev, cancellationReason: e.target.value }))}
                placeholder="キャンセル理由を入力してください"
                rows={3}
                className="text-xs md:text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 md:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsCancelDialogOpen(false)}
                className="text-xs md:text-sm h-8 md:h-9"
              >
                戻る
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelConfirm}
                className="text-xs md:text-sm h-8 md:h-9"
              >
                キャンセル実行
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* キャンセルメール確認ダイアログ */}
      <Dialog open={isEmailConfirmOpen} onOpenChange={setIsEmailConfirmOpen}>
        <DialogContent className="max-w-[90vw] md:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm md:text-base">キャンセル通知メール確認</DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              以下の内容でメールを送信します
            </DialogDescription>
          </DialogHeader>

          <EmailPreview content={emailContent} />

          <div className="flex justify-end gap-2 pt-3 md:pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsEmailConfirmOpen(false)}
              disabled={sendingEmail}
              className="text-xs md:text-sm h-8 md:h-9"
            >
              送信しない
            </Button>
            <Button
              onClick={handleSendCancellationEmail}
              disabled={sendingEmail}
              className="text-xs md:text-sm h-8 md:h-9"
            >
              {sendingEmail ? '送信中...' : 'メール送信'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

