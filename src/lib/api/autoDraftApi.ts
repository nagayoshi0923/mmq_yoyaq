/**
 * 公演スケジュールの下書き自動作成（QW-20261113-001）の API。
 * 組織での絞り込みはサーバー（/api/schedule、ログイン中のスタッフの組織）で行う。
 * 下書きの公演そのものは scheduleApi.create（/api/schedule）で作る。
 */
import { apiClient } from '@/lib/apiClient'
import type { TimeSlotEn } from '@/lib/timeSlot'

export interface SlotRuleRow {
  store_id: string
  weekday: number
  time_slot: TimeSlotEn
  is_open: boolean
}

export interface ScenarioCandidateRow {
  id: string
  org_scenario_id: string | null
  title: string | null
  status: string | null
  player_count_max: number | null
  duration: number | null
  weekend_duration: number | null
  available_stores: string[] | null
  kit_count: number | null
  scenario_kind: string | null
  available_from: string | null
  available_until: string | null
  created_at: string | null
}

export interface DraftEventRow {
  date: string
  store_id: string | null
  time_slot: string | null
  start_time: string | null
  scenario_master_id: string | null
  category: string | null
  current_participants: number | null
  max_participants: number | null
}

export interface AutoDraftData {
  rules: SlotRuleRow[]
  scenarios: ScenarioCandidateRow[]
  /** 作品（scenario_master_id）ごとのメインGMを担当できる在籍スタッフの人数 */
  main_gm_counts: Record<string, number>
  /** 下書きを作る期間（前後 7 日を含む）の中止でない公演 */
  nearby_events: DraftEventRow[]
  /** 予約の入りやすさを見る期間の中止でない公演 */
  demand_events: DraftEventRow[]
  blocked_slots: Array<{ date: string; store_id: string; time_slot: string }>
}

export const autoDraftApi = {
  async getData(params: { start: string; end: string; demandFrom: string; demandTo: string }): Promise<AutoDraftData> {
    const query = new URLSearchParams({
      type: 'auto-draft-data',
      start: params.start,
      end: params.end,
      demand_from: params.demandFrom,
      demand_to: params.demandTo,
    })
    return await apiClient.get<AutoDraftData>(`/api/schedule?${query.toString()}`)
  },

  /** 固定枠だけ読む */
  async listSlotRules(): Promise<SlotRuleRow[]> {
    const data = await apiClient.get<{ rules: SlotRuleRow[] }>('/api/schedule?type=auto-draft-rules')
    return data.rules
  },

  /** 1 店舗分の固定枠をまとめて置き換える。is_open が null の枠は「未設定」として消す。保存後の全店舗の固定枠を返す */
  async saveStoreSlotRules(
    storeId: string,
    cells: Array<{ weekday: number; time_slot: TimeSlotEn; is_open: boolean | null }>,
  ): Promise<SlotRuleRow[]> {
    const data = await apiClient.patch<{ rules: SlotRuleRow[] }>('/api/schedule?action=auto-draft-rules', { store_id: storeId, cells })
    return data.rules
  },
}
