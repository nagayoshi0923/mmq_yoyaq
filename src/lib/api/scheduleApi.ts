/**
 * スケジュール関連API
 *
 * 公演スケジュールの取得・作成・更新・削除を行う。
 * すべてバックエンド API (/api/schedule) 経由で、organization_id は
 * サーバ側で JWT から強制される。
 */
import { apiClient } from '@/lib/apiClient'
import type { ScheduleEvent } from '@/types/schedule'

// API が返す schedule_events_staff_view 行（ScheduleEvent + DB のみの列）
type ScheduleEventRow = ScheduleEvent & {
  store_id: string
  capacity?: number
}

// 公演スケジュール関連のAPI
export const scheduleApi = {
  // 自分のスケジュールを取得（期間指定）
  // バックエンド API (/api/schedule?type=my-schedule) 経由で取得
  async getMySchedule(staffName: string, startDate: string, endDate: string) {
    const params = new URLSearchParams({
      type: 'my-schedule',
      staff_name: staffName,
      start: startDate,
      end: endDate,
    })
    return await apiClient.get<unknown[]>(`/api/schedule?${params.toString()}`)
  },

  // 指定月の公演を取得（通常公演 + 確定した貸切公演）
  // organizationId / skipOrgFilter: 互換のため残すがバックエンド側で JWT から取得する（無視される）
  // skipPrivateBookings: trueの場合、確定貸切予約のクエリをスキップ
  async getByMonth(year: number, month: number, _organizationId?: string, _skipOrgFilter?: boolean, skipPrivateBookings?: boolean) {
    const params = new URLSearchParams({
      type: 'by-month',
      year: String(year),
      month: String(month),
    })
    if (skipPrivateBookings) {
      params.set('skip_private_bookings', 'true')
    }
    return await apiClient.get<unknown[]>(`/api/schedule?${params.toString()}`)
  },

  // 日付範囲でスケジュールを取得（キット管理用）
  async getByDateRange(startDate: string, endDate: string, _organizationId?: string, includeCancelled = false) {
    const params = new URLSearchParams({
      type: 'by-date-range',
      start: startDate,
      end: endDate,
    })
    if (includeCancelled) {
      params.set('include_cancelled', 'true')
    }
    type ScheduleEventRow = {
      id: string
      date: string
      venue: string
      store_id: string
      scenario: string
      scenario_id?: string | null
      scenario_master_id?: string | null
      start_time: string
      end_time: string
      category: string
      is_cancelled: boolean
      current_participants: number
      capacity: number
    }
    return await apiClient.get<ScheduleEventRow[]>(`/api/schedule?${params.toString()}`)
  },

  // シナリオIDで指定期間の公演を取得
  async getByScenarioId(scenarioId: string, startDate: string, endDate: string, _organizationId?: string) {
    const params = new URLSearchParams({
      type: 'by-scenario',
      scenario_id: scenarioId,
      start: startDate,
      end: endDate,
    })
    return await apiClient.get<unknown[]>(`/api/schedule?${params.toString()}`)
  },

  // 公演を作成
  // バックエンド API (POST /api/schedule) 経由。organization_id はサーバ側で JWT から強制。
  async create(eventData: {
    date: string
    store_id: string
    venue?: string
    scenario?: string
    scenario_master_id?: string | null
    organization_scenario_id?: string | null
    category: string
    start_time: string
    end_time: string
    capacity?: number
    gms?: string[]
    gm_roles?: Record<string, string>
    notes?: string
    time_slot?: string | null
    is_reservation_enabled?: boolean
    is_tentative?: boolean
    venue_rental_fee?: number
    organization_id?: string  // 互換のため受けるがサーバ側で無視される
    reservation_name?: string | null
    is_reservation_name_overwritten?: boolean
    is_private_request?: boolean
    reservation_id?: string | null
  }) {
    // organization_id はサーバ側で JWT から強制するので渡しても無視される
    return await apiClient.post<ScheduleEventRow>('/api/schedule', eventData)
  },

  // 公演を更新
  // バックエンド API (PATCH /api/schedule?id=...) 経由。organizationId は無視される。
  async update(
    id: string,
    updates: Partial<{
      date: string
      store_id: string
      venue: string
      scenario_master_id: string
      organization_scenario_id: string
      scenario: string
      category: string
      start_time: string
      end_time: string
      capacity: number
      gms: string[]
      gm_roles: Record<string, string>
      notes: string
      is_cancelled: boolean
      is_tentative: boolean
      is_reservation_enabled: boolean
      time_slot: string | null
      venue_rental_fee: number
      reservation_name: string | null
      is_reservation_name_overwritten: boolean
      is_private_request: boolean
      reservation_id: string | null
    }>,
    _organizationId?: string,
    expectedUpdatedAt?: string,
  ) {
    const params = new URLSearchParams({ id })
    if (expectedUpdatedAt) {
      params.set('expected_updated_at', expectedUpdatedAt)
    }
    return await apiClient.patch<ScheduleEventRow>(`/api/schedule?${params.toString()}`, updates)
  },

  // 公演を削除（関連する予約はDB側のFK設定に従って処理）
  async delete(id: string) {
    await apiClient.delete<void>(`/api/schedule?id=${encodeURIComponent(id)}`)
  },

  // 公演をキャンセル/復活
  async toggleCancel(id: string, isCancelled: boolean, cancellationReason?: string) {
    const params = new URLSearchParams({ id, action: 'toggle-cancel' })
    return await apiClient.patch<ScheduleEventRow>(`/api/schedule?${params.toString()}`, {
      is_cancelled: isCancelled,
      cancellation_reason: cancellationReason ?? null,
    })
  },

  // 中止でない全公演にデモ参加者を満席まで追加（既存データの修復も含む）
  async addDemoParticipantsToAllActiveEvents() {
    return await apiClient.post<{
      success: boolean
      message?: string
      successCount?: number
      errorCount?: number
    }>('/api/schedule?action=add-demo-participants', {})
  },

  // 誤って追加されたデモ予約を全削除
  async removeAllDemoReservations() {
    return await apiClient.post<{
      success: boolean
      deletedCount?: number
    }>('/api/schedule?action=remove-demo-reservations', {})
  },
}
