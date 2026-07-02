/**
 * 顧客管理関連API
 *
 * read 系メソッドはバックエンド API (/api/customers) 経由。
 * org_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 */
import { apiClient } from '@/lib/apiClient'
import type { Customer } from '@/types'

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

export const customerApi = {
  // 顧客一覧をサーバ集計＋ページングで取得（顧客管理ページ用）
  async listWithStats(params: { search?: string; page?: number; pageSize?: number }): Promise<ListCustomersWithStatsResult> {
    const query = new URLSearchParams({ action: 'listWithStats' })
    if (params.search) query.set('search', params.search)
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    return apiClient.get<ListCustomersWithStatsResult>(`/api/customers?${query.toString()}`)
  },
}
