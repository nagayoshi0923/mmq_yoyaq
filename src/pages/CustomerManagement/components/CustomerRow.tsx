import { useState, useEffect } from 'react'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Edit2, Mail, Phone, Calendar } from 'lucide-react'
import type { Customer, Reservation } from '@/types'
import { supabase } from '@/lib/supabase'
import { devDb } from '@/components/ui/DevField'

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded])

  const fetchReservations = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, organization_id, reservation_number, reservation_page_id, title, scenario_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, candidate_datetimes')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (error) throw error
      setReservations(data || [])
    } catch (error) {
      logger.error('予約履歴の取得エラー:', error)
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
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* PC View */}
      <div className="hidden md:grid grid-cols-12 gap-4 px-4 items-center h-[60px] hover:bg-muted/50 transition-colors cursor-pointer" onClick={onToggleExpand}>
        <div className="col-span-2 truncate font-medium" {...devDb('customers.name')}>{customer.name}</div>
        <div className="col-span-2 text-xs text-muted-foreground truncate flex items-center gap-2">
          {customer.email ? (
            <>
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate" {...devDb('customers.email')}>{customer.email}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50">未登録</span>
          )}
        </div>
        <div className="col-span-2 text-xs text-muted-foreground truncate flex items-center gap-2">
          {customer.phone ? (
            <>
              <Phone className="h-3 w-3 flex-shrink-0" />
              <span className="truncate" {...devDb('customers.phone')}>{customer.phone}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50">未登録</span>
          )}
        </div>
        <div className="col-span-1 text-center">
          <Badge variant="secondary" className="font-normal" {...devDb('customers.visit_count')}>{customer.visit_count}回</Badge>
        </div>
        <div className="col-span-2 text-right font-medium" {...devDb('customers.total_spent')}>
          {formatCurrency(customer.total_spent)}
        </div>
        <div className="col-span-2 text-xs text-muted-foreground truncate">
          {formatDate(customer.last_visit ?? null)}
        </div>
        <div className="col-span-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleExpand}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile View */}
      <div className="md:hidden p-3 hover:bg-muted/50 transition-colors cursor-pointer" onClick={onToggleExpand}>
        <div className="flex justify-between items-start mb-2">
          <div className="font-bold">{customer.name}</div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-normal">{customer.visit_count}回</Badge>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        
        <div className="space-y-1 mb-2">
            {customer.email && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{customer.phone}</span>
              </div>
            )}
        </div>

        <div className="flex justify-between items-center text-sm pt-2 border-t border-dashed">
          <div className="font-bold">{formatCurrency(customer.total_spent)}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(customer.last_visit ?? null)}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit2 className="h-3 w-3 mr-1" />
              編集
            </Button>
          </div>
        </div>
      </div>

      {/* 展開エリア（詳細情報） */}
      {isExpanded && (
        <div className="border-t bg-muted/20 p-4 space-y-4">
          {/* 顧客詳細 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="mb-2 font-bold text-sm">顧客情報</h4>
              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">LINE ID:</span> {customer.line_id || '未登録'}</div>
                <div><span className="text-muted-foreground">登録日:</span> {formatDate(customer.created_at)}</div>
                {customer.preferences && customer.preferences.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">好み:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {customer.preferences.map((pref, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs font-normal">{pref}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 font-bold text-sm">メモ</h4>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-white p-2 rounded border min-h-[60px]">
                {customer.notes || 'メモなし'}
              </p>
            </div>
          </div>

          {/* 予約履歴 */}
          <div>
            <h4 className="mb-2 font-bold text-sm">予約履歴 ({reservations.length}件)</h4>
            {loading ? (
              <div className="text-center py-4 text-xs text-muted-foreground">読み込み中...</div>
            ) : reservations.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">予約履歴がありません</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {reservations.map((reservation) => (
                  <div key={reservation.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-background rounded-lg border gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{reservation.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(reservation.requested_datetime)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">人数</div>
                        <div className="text-sm">{reservation.participant_count}名</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">金額</div>
                        <div className="text-sm font-medium">{formatCurrency(reservation.final_price)}</div>
                      </div>
                      <Badge
                        // @ts-ignore
                        variant={
                          reservation.status === 'confirmed' ? 'success' :
                          reservation.status === 'cancelled' ? 'gray' :
                          'warning'
                        }
                        className="font-normal w-20 justify-center"
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
