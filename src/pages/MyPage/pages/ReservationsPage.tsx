import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import type { Reservation } from '@/types'

export function ReservationsPage() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.email) {
      fetchReservations()
    }
  }, [user])

  const fetchReservations = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setReservations([])
        return
      }

      // 予約を取得（決済方法も含む）
      const { data, error } = await supabase
        .from('reservations')
        .select('*, payment_method, payment_status')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (error) throw error
      setReservations(data || [])
    } catch (error) {
      logger.error('予約履歴取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  const getPaymentMethodLabel = (method: string | null | undefined) => {
    if (!method) return '未設定'
    switch (method) {
      case 'cash':
        return '現地決済（現金）'
      case 'credit_card':
        return 'クレジットカード'
      case 'online':
        return 'オンライン決済'
      case 'bank_transfer':
        return '銀行振込'
      case 'paypay':
        return 'PayPay'
      case 'line_pay':
        return 'LINE Pay'
      default:
        return method
    }
  }

  const getPaymentMethodBadgeColor = (method: string | null | undefined) => {
    if (!method) return 'bg-gray-100 text-gray-800'
    switch (method) {
      case 'cash':
        return 'bg-green-100 text-green-800'
      case 'credit_card':
      case 'online':
        return 'bg-blue-100 text-blue-800'
      case 'bank_transfer':
        return 'bg-purple-100 text-purple-800'
      case 'paypay':
      case 'line_pay':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  const upcomingReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) >= new Date() && r.status === 'confirmed'
  )
  const pastReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
  )
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled')

  return (
    <div className="space-y-6">
      {/* 参加予定の予約 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            参加予定の予約 ({upcomingReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              参加予定の予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-blue-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{reservation.title}</span>
                      <Badge variant="default" className="bg-blue-100 text-blue-800">
                        <Clock className="h-3 w-3 mr-1" />
                        参加予定
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">参加人数</div>
                    <div className="font-medium">{reservation.participant_count}名</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm text-muted-foreground">金額</div>
                    <div className="font-medium">{formatCurrency(reservation.final_price)}</div>
                  </div>
                  <div className="ml-4">
                    <Badge className={getPaymentMethodBadgeColor(reservation.payment_method)}>
                      {getPaymentMethodLabel(reservation.payment_method)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参加済みの予約 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            参加済みの予約 ({pastReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              参加済みの予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {pastReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{reservation.title}</span>
                      <Badge variant="secondary">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        参加済み
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">参加人数</div>
                    <div className="font-medium">{reservation.participant_count}名</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm text-muted-foreground">金額</div>
                    <div className="font-medium">{formatCurrency(reservation.final_price)}</div>
                  </div>
                  <div className="ml-4">
                    <Badge className={getPaymentMethodBadgeColor(reservation.payment_method)}>
                      {getPaymentMethodLabel(reservation.payment_method)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* キャンセル済みの予約 */}
      {cancelledReservations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              キャンセル済み ({cancelledReservations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cancelledReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors opacity-60"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium line-through">{reservation.title}</span>
                      <Badge variant="destructive">キャンセル</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">参加人数</div>
                    <div className="font-medium">{reservation.participant_count}名</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm text-muted-foreground">金額</div>
                    <div className="font-medium">{formatCurrency(reservation.final_price)}</div>
                  </div>
                  <div className="ml-4">
                    <Badge className={getPaymentMethodBadgeColor(reservation.payment_method)}>
                      {getPaymentMethodLabel(reservation.payment_method)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

