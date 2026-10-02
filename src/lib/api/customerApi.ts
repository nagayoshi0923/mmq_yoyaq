/**
 * 顧客管理関連API
 *
 * 顧客管理の取得・保存はバックエンド API (/api/customers) 経由。
 * org_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 */
import { apiClient } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import type { Customer, Reservation } from '@/types'
import type { CustomerListOptions } from '@/types/customerList'

// get_org_customers_with_stats RPC が customers の列に加えて返す集計フィールド
export interface CustomerWithStats extends Customer {
  reservation_count: number
  total_paid: number
  reservation_amount: number | null
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

/**
 * 予約・貸切申込の入口で、ログイン中の本人の顧客行を「あれば更新・無ければ作成」して id を返す。
 * 3 か所（通常予約 hook、貸切申込 hook、キャンセル待ち登録）で同じ形だった直接書き込みの集約（整備 Phase 2）。
 * 本人の行（user_id = 自分）だけを RLS の下で書く。organizationId を渡したときは組織でも絞る（キャンセル待ち登録）。
 * 戻り値は customer id。作成に失敗したときは null（呼び出し側が従来どおりエラー化する）。
 * throwOnError = true のときは更新・作成の失敗を投げる（キャンセル待ち登録の従来の挙動）。
 */
export interface UpsertOwnCustomerInput {
  userId: string
  name: string
  nickname: string | null
  phone: string
  email: string
  organizationId: string | null
  /** 既存行の検索・更新を組織でも絞る（キャンセル待ち登録）。false のときは user_id だけで探す */
  scopeByOrganization?: boolean
  throwOnError?: boolean
}
export async function upsertOwnCustomer(input: UpsertOwnCustomerInput): Promise<string | null> {
  const { userId, name, nickname, phone, email, organizationId, scopeByOrganization = false, throwOnError = false } = input
  let find = supabase.from('customers').select('id').eq('user_id', userId)
  if (scopeByOrganization) find = find.eq('organization_id', organizationId as string)
  const { data: existing } = await find.maybeSingle()
  if (existing) {
    let upd = supabase.from('customers').update({ name, nickname, phone, email }).eq('id', existing.id).eq('user_id', userId)
    if (scopeByOrganization) upd = upd.eq('organization_id', organizationId as string)
    const { error } = await upd
    if (error && throwOnError) throw error
    return existing.id
  }
  const { data: created, error } = await supabase.from('customers')
    .insert({ user_id: userId, name, nickname, phone, email, organization_id: organizationId })
    .select('id').single()
  if (error && throwOnError) throw error
  return created?.id ?? null
}

export const customerApi = {
  async playedScenarioOptions(): Promise<Array<{ scenario_master_id: string; title: string }>> {
    return apiClient.get('/api/customers?action=playedScenarioOptions')
  },
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
  async listWithStats(params: CustomerListOptions & { search?: string; page?: number; pageSize?: number }): Promise<ListCustomersWithStatsResult> {
    const query = new URLSearchParams({ action: 'listWithStats' })
    for (const [key,value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query.set(key, String(value))
    }
    return apiClient.get<ListCustomersWithStatsResult>(`/api/customers?${query.toString()}`)
  },
}
