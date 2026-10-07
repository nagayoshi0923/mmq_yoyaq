/**
 * 顧客管理関連API
 *
 * 顧客管理の取得・保存はバックエンド API (/api/customers) 経由。
 * org_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 */
import { validateCustomerContact } from '@/lib/customerContactValidation'
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
  /** 省略したときは nickname 列を更新も作成もしない（貸切グループの申込は従来 nickname を扱わない） */
  nickname?: string | null
  phone: string
  email: string
  organizationId: string | null
  /** 既存行の検索・更新を組織でも絞る（キャンセル待ち登録）。false のときは user_id だけで探す */
  scopeByOrganization?: boolean
  throwOnError?: boolean
}
export async function upsertOwnCustomer(input: UpsertOwnCustomerInput): Promise<string | null> {
  const { userId, name, nickname, phone, email, organizationId, scopeByOrganization = false, throwOnError = false } = input
  validateCustomerContact(email, phone)
  let find = supabase.from('customers').select('id, email, organization_id').eq('user_id', userId)
  if (scopeByOrganization) find = find.eq('organization_id', organizationId as string)
  const { data: candidates, error: lookupError } = await find.order('created_at').order('id')
  if (lookupError) throw lookupError
  // RPCは共通顧客または申込先と同じ組織の顧客だけを受け付ける。
  const compatible = candidates?.filter(row => row.organization_id == null || row.organization_id === organizationId)
  const existing = candidates?.find(row => row.email?.toLowerCase() === email.toLowerCase())
    ?? compatible?.find(row => row.organization_id === null)
    ?? compatible?.find(row => row.organization_id === organizationId)
    ?? compatible?.[0]
  if (existing) {
    // 本人のメール一致行のIDと履歴を保持し、platform予約では所属を共通形へ正す。
    const normalizeOrganization = !scopeByOrganization && existing.organization_id != null && existing.organization_id !== organizationId
    const updateValues = { ...(nickname === undefined ? { name, phone, email } : { name, nickname, phone, email }), ...(normalizeOrganization ? { organization_id: null } : {}) }
    let upd = supabase.from('customers').update(updateValues).eq('id', existing.id).eq('user_id', userId)
    if (scopeByOrganization) upd = upd.eq('organization_id', organizationId as string)
    const { error } = await upd
    if (error && (throwOnError || normalizeOrganization)) throw error
    return existing.id
  }
  const insertValues = nickname === undefined
    ? { user_id: userId, name, phone, email, organization_id: organizationId }
    : { user_id: userId, name, nickname, phone, email, organization_id: organizationId }
  const { data: created, error } = await supabase.from('customers')
    .insert(insertValues)
    .select('id').single()
  if (error && throwOnError) throw error
  return created?.id ?? null
}

/**
 * マイページ・お気に入りなど「本人の顧客行」を書く操作（整備 Phase 2: 画面からの直接書き込みをここに集約）。
 * どれも本人の行（user_id = 自分）か、本人のメールの行だけを RLS の下で書く。戻り値は supabase の { data, error } をそのまま返す。
 */
export interface OwnProfileFields {
  name: string
  nickname: string | null
  phone: string | null
  address: string | null
  line_id: string | null
  email: string | null
}
export const ownCustomerApi = {
  /** プロフィールを更新する（id で絞り、userId を渡したときは user_id でも絞る）。更新された行の id を返す */
  async updateProfileById(customerId: string, fields: OwnProfileFields, userId?: string | null) {
    validateCustomerContact(fields.email, fields.phone || undefined)
    let q = supabase.from('customers').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', customerId)
    if (userId) q = q.eq('user_id', userId)
    return q.select('id')
  },
  /** 本人の顧客行が無いときに作成する（マイページ初回保存）。organization_id は呼び出し側が決める */
  async insertProfile(userId: string, fields: OwnProfileFields, organizationId: string | null) {
    validateCustomerContact(fields.email, fields.phone || undefined)
    return supabase.from('customers').insert({ user_id: userId, ...fields, organization_id: organizationId }).select('id')
  },
  /** 通知設定だけを更新する */
  async updateNotificationSettings(customerId: string, settings: Record<string, unknown>) {
    return supabase.from('customers').update({ notification_settings: settings }).eq('id', customerId)
  },
  /** アバター画像の URL を、本人のメールの顧客行に保存する */
  async updateAvatarByEmail(email: string, avatarUrl: string) {
    return supabase.from('customers').update({ avatar_url: avatarUrl }).eq('email', email)
  },
  /** メールだけが一致していた顧客行に user_id を紐付ける（お気に入りの初回） */
  async linkUserId(customerId: string, userId: string) {
    return supabase.from('customers').update({ user_id: userId }).eq('id', customerId)
  },
  /** お気に入り用に顧客行を新規作成する（メール・名前・user_id・組織つき） */
  async insertForFavorites(row: { email: string; name: string; user_id: string; organization_id: string }) {
    return supabase.from('customers').insert(row).select('id').single()
  },
}

/**
 * 初回プロフィール登録（CompleteProfile）の顧客行の書き込み。
 * 重複メール（23505）の競合解消の分岐は画面側に残し、ここは「どの条件で何を書くか」だけを名前付きにしたもの（整備 Phase 2）。
 * 戻り値は supabase の { error } をそのまま返す（呼び出し側が code === '23505' などを見る）。
 */
export const profileRegistrationApi = {
  /** 自分の既存行を更新する（id と user_id で絞る） */
  async updateOwnRow(customerId: string, userId: string, payload: Record<string, unknown>) {
    return supabase.from('customers').update(payload).eq('id', customerId).eq('user_id', userId)
  },
  /** 自分の users 行を作る・更新する（id が競合したら更新） */
  async upsertUserRow(row: Record<string, unknown>) {
    return supabase.from('users').upsert(row, { onConflict: 'id' })
  },
  /** 新規に自分の顧客行を作る */
  async insertOwnRow(row: Record<string, unknown>) {
    return supabase.from('customers').insert(row)
  },
  /** user_id が未設定の同メール顧客（店舗で登録済み）に、自分の user_id とプロフィールを紐付ける */
  async linkToEmailCustomer(customerId: string, userId: string, payload: Record<string, unknown>) {
    return supabase.from('customers').update({ user_id: userId, ...payload }).eq('id', customerId).is('user_id', null)
  },
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
