import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { logger } from '@/utils/logger'
import type { Reservation } from '@/types'

// 予約管理画面用の拡張型
// Reservationのstatus/payment_statusを上書きするためOmitで除外してから拡張
export interface ReservationWithDetails extends Omit<Reservation, 'status' | 'payment_status' | 'candidate_datetimes'> {
  customer_name?: string
  event_date?: string
  event_time?: string
  end_time?: string // 追加
  scenario_title?: string
  store_name?: string
  // UI表示用に追加または型拡張
  candidate_datetimes?: {
    candidates: Array<{
      date: string
      startTime: string
      endTime: string
    }>
  }
  // 実際のDB値と型定義の不一致を許容するための拡張
  status: Reservation['status'] | 'pending_gm' | 'pending_store'
  payment_status: Reservation['payment_status'] | 'unpaid'
  total_amount?: number // 後方互換性またはエイリアス用
}

interface Filters {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  typeFilter: string
}

interface Pagination {
  page: number
  pageSize: number
}

/**
 * 予約データの取得とフィルタリングを管理するフック
 */
export function useReservationData(filters: Filters, pagination: Pagination) {
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const loadReservations = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // organization_idを取得（マルチテナント対応）
      const orgId = await getCurrentOrganizationId()
      
      // Supabaseから予約データを取得
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id (title),
          stores:store_id (name)
        `, { count: 'exact' })
      
      // 組織フィルタ
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      // フィルタ（サーバー側）
      if (filters.statusFilter !== 'all') {
        query = query.eq('status', filters.statusFilter)
      }
      if (filters.paymentFilter !== 'all') {
        query = query.eq('payment_status', filters.paymentFilter)
      }
      if (filters.typeFilter !== 'all') {
        query = query.eq('reservation_source', filters.typeFilter)
      }
      if (filters.searchTerm && filters.searchTerm.trim().length > 0) {
        const term = sanitizeForPostgRestFilter(filters.searchTerm.trim())
        if (term) {
          // reservation_number / customer_name / title で部分一致
          query = query.or(
            `reservation_number.ilike.%${term}%,customer_name.ilike.%${term}%,title.ilike.%${term}%`
          )
        }
      }

      // ページング（サーバー側）
      const safePage = Math.max(1, Math.floor(pagination.page || 1))
      const safePageSize = Math.min(200, Math.max(10, Math.floor(pagination.pageSize || 50)))
      const from = (safePage - 1) * safePageSize
      const to = from + safePageSize - 1
      
      const { data, error, count } = await query
        // 新しい予約が上に来るように（UI側のDateパース失敗でも表示が崩れにくい）
        .order('created_at', { ascending: false })
        // priority がある場合は同日時内で優先（NULLは末尾）
        .order('priority', { ascending: false, nullsFirst: false })
        .range(from, to)
      
      if (error) {
        logger.error('予約データ取得エラー:', error)
        setReservations([])
        setTotalCount(0)
        return
      }

      setTotalCount(count ?? 0)
      
      // データを整形
      const formattedData: ReservationWithDetails[] = (data || []).map((reservation: any) => {
        let eventDate = ''
        let eventTime = ''
        let endTime = ''
        
        if (reservation.requested_datetime) {
          const dateStr = reservation.requested_datetime
          const parts = dateStr.split('T')
          if (parts.length === 2) {
            eventDate = parts[0]
            eventTime = parts[1].slice(0, 5)
          } else {
            const spaceParts = dateStr.split(' ')
            if (spaceParts.length >= 2) {
              eventDate = spaceParts[0]
              eventTime = spaceParts[1].slice(0, 5)
            }
          }

          // 終了時間の計算
          if (eventTime && reservation.duration) {
            const [hours, minutes] = eventTime.split(':').map(Number)
            const date = new Date()
            date.setHours(hours, minutes + reservation.duration)
            endTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
          }
        }
        
        return {
          ...reservation,
          scenario_title: reservation.scenarios?.title || reservation.title,
          store_name: reservation.stores?.name || '',
          event_date: eventDate,
          event_time: eventTime,
          end_time: endTime,
          total_amount: reservation.final_price || reservation.total_price || 0 // 金額フィールドの統一
        }
      })
      
      setReservations(formattedData)
    } catch (error) {
      logger.error('予約データの読み込みエラー:', error)
      setReservations([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [filters.paymentFilter, filters.searchTerm, filters.statusFilter, filters.typeFilter, pagination.page, pagination.pageSize])

  useEffect(() => {
    loadReservations()
  }, [loadReservations])

  // 追加の表示フィルタ（サーバー側で拾いきれないもの用）
  const filteredReservations = useMemo(() => reservations, [reservations])

  return {
    reservations: filteredReservations,
    isLoading,
    loadReservations,
    totalCount,
  }
}
