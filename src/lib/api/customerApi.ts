/**
 * 顧客管理関連API
 *
 * 顧客管理の取得・保存はバックエンド API (/api/customers) 経由。
 * org_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 */
import { apiClient } from '@/lib/apiClient'
import type { Customer, Reservation } from '@/types'

// get_org_customers_with_stats RPC が customers の列に加えて返す集計フィールド
export interface CustomerWithStats extends Customer {
  reservation_count: number
  total_paid: number
  last_visit: string | null
  visit_count: number
  total_coupons: number
  used_coupons: number
  remaining_coupons: number
}

export interface ListCustomersWithStatsResult {
  customers: CustomerWithStats[]
  totalCount: number
}

export type CustomerReservationHistory = Pick<Reservation, 'id' | 'title' | 'scenario_master_id' | 'requested_datetime' | 'participant_count' | 'final_price' | 'status'>

export type CustomerFormInput = Pick<Customer, 'name'> & {
  email: string | null
  phone: string | null
  line_id: string | null
}

export const customerApi = {
  async reservationHistory(customerId: string): Promise<CustomerReservationHistory[]> {
    return apiClient.get<CustomerReservationHistory[]>(`/api/customers?action=reservationHistory&customerId=${encodeURIComponent(customerId)}`)
  },
  async create(customer: CustomerFormInput): Promise<Customer> {
    return apiClient.post<Customer>('/api/customers', { customer })
  },
  async update(id: string, updates: CustomerFormInput): Promise<Customer> {
    return apiClient.patch<Customer>(`/api/customers?id=${encodeURIComponent(id)}`, { updates })
  },
  // 顧客一覧をサーバ集計＋ページングで取得（顧客管理ページ用）
  async listWithStats(params: { search?: string; page?: number; pageSize?: number }): Promise<ListCustomersWithStatsResult> {
    const query = new URLSearchParams({ action: 'listWithStats' })
    if (params.search) query.set('search', params.search)
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    return apiClient.get<ListCustomersWithStatsResult>(`/api/customers?${query.toString()}`)
  },
}
