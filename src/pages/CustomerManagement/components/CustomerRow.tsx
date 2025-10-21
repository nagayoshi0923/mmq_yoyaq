import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Edit2, Mail, Phone } from 'lucide-react'
import type { Customer, Reservation } from '@/types'
import { supabase } from '@/lib/supabase'

interface CustomerRowProps {
  customer: Customer
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
}

export function CustomerRow({ customer, isExpanded, onToggleExpand, onEdit }: CustomerRowProps) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)

  // 展開時に予約履歴を取得
  useEffect(() => {
    if (isExpanded && reservations.length === 0) {
      fetchReservations()
    }
  }, [isExpanded])

  const fetchReservations = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (error) throw error
      setReservations(data || [])
    } catch (error) {
      console.error('予約履歴の取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return '未設定'
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  const formatDateTime = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* メイン行（高さ60px） */}
      <div className="grid grid-cols-12 gap-4 px-4 items-center h-[60px] hover:bg-muted/50 transition-colors">
        <div className="col-span-2 font-medium truncate">{customer.name}</div>
        <div className="col-span-2 text-sm text-muted-foreground truncate flex items-center gap-2">
          {customer.email ? (
            <>
              <Mail className="h-3 w-3" />
              {customer.email}
            </>
          ) : (
            <span className="text-muted-foreground/50">未登録</span>
          )}
        </div>
        <div className="col-span-2 text-sm text-muted-foreground truncate flex items-center gap-2">
          {customer.phone ? (
            <>
              <Phone className="h-3 w-3" />
              {customer.phone}
            </>
          ) : (
            <span className="text-muted-foreground/50">未登録</span>
          )}
        </div>
        <div className="col-span-1 text-center">
          <Badge variant="secondary">{customer.visit_count}回</Badge>
        </div>
        <div className="col-span-2 text-right font-medium">
          {formatCurrency(customer.total_spent)}
        </div>
        <div className="col-span-2 text-sm text-muted-foreground">
          {formatDate(customer.last_visit)}
        </div>
        <div className="col-span-1 flex items-center justify-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 展開エリア（詳細情報） */}
      {isExpanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {/* 顧客詳細 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">顧客情報</h4>
              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">LINE ID:</span> {customer.line_id || '未登録'}</div>
                <div><span className="text-muted-foreground">登録日:</span> {formatDate(customer.created_at)}</div>
                {customer.preferences && customer.preferences.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">好み:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {customer.preferences.map((pref, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">{pref}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">メモ</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {customer.notes || 'メモなし'}
              </p>
            </div>
          </div>

          {/* 予約履歴 */}
          <div>
            <h4 className="font-medium mb-2">予約履歴 ({reservations.length}件)</h4>
            {loading ? (
              <div className="text-center py-4 text-sm text-muted-foreground">読み込み中...</div>
            ) : reservations.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">予約履歴がありません</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {reservations.map((reservation) => (
                  <div key={reservation.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                    <div className="flex-1">
                      <div className="font-medium">{reservation.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDateTime(reservation.requested_datetime)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">参加人数</div>
                        <div className="font-medium">{reservation.participant_count}名</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">金額</div>
                        <div className="font-medium">{formatCurrency(reservation.final_price)}</div>
                      </div>
                      <Badge
                        variant={
                          reservation.status === 'confirmed' ? 'default' :
                          reservation.status === 'cancelled' ? 'destructive' :
                          'secondary'
                        }
                      >
                        {reservation.status === 'confirmed' ? '確定' :
                         reservation.status === 'cancelled' ? 'キャンセル' :
                         reservation.status === 'pending' ? '保留' : reservation.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

