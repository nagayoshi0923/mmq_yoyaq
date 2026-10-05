// 貸切予約管理の一覧の1件分の型。読み込みは useBookingRequests が行う
// （以前ここにあったタブ別・1件ずつの読み込み処理は画面から使われておらず、2026-10-05 に削除。#835）
import type { GmScenarioMode } from '@/lib/gmScenarioMode'

export interface PrivateBookingRequest {
  id: string
  reservation_number: string
  scenario_master_id?: string
  /** organization_scenarios.gm_count（担当作品と同じ解釈）。一覧取得時に付与、未設定は1 */
  required_gm_count?: number
  /** 同じ候補で在籍・主副GM資格と必要人数が揃う（サーバー判定） */
  gm_team_ready?: boolean
  /** 候補の終了表示・承認時に使用（organization_scenarios 優先） */
  scenario_timing?: {
    duration: number
    weekend_duration: number | null
    extra_preparation_time?: number
  } | null
  scenario_title: string
  customer_name: string
  customer_email: string
  customer_phone: string
  response_candidate_snapshot?: unknown[]
  candidate_datetimes: {
    candidates: Array<{
      order: number
      gm_response_index?: number | null
      date: string
      timeSlot: string
      startTime: string
      endTime: string
      status: string
    }>
    requestedStores?: Array<{
      storeId: string
      storeName: string
    }>
    confirmedStore?: {
      storeId: string
      storeName: string
    }
  }
  participant_count: number
  /** 貸切グループありのとき、private_group_members.status = joined の人数（主催のみ等と予定人数がずれることがある） */
  joined_member_count?: number
  /** マスタ＋組織別上書きを解決したシナリオの推奨人数帯（取得できないときは null） */
  scenario_player_count_range?: { min: number; max: number } | null
  notes: string
  status: string
  /** 承認者（confirmed_by → staff.name） */
  approver_name?: string
  /** 承認日時（confirmed のときに updated_at を流用） */
  approved_at?: string
  /** キャンセル/却下の操作者（cancelled_by → staff.name。顧客自身のキャンセルは undefined） */
  canceller_name?: string
  cancelled_at?: string
  gm_responses?: Array<{
    id: string
    staff_id?: string
    gm_name?: string
    response_status: string
    available_candidates?: number[] | null
    selected_candidate_index?: number | null
    notes?: string | null
    response_datetime?: string | null
    responded_at?: string | null
    updated_at?: string | null
    created_at?: string | null
  }>
  created_at: string
  invite_code?: string
  /** 回答したGMが、この作品でメイン・サブのどちらを担当できるか（スタッフID → 区分、#827） */
  gm_role_by_staff?: Record<string, GmScenarioMode | 'none'>
}
