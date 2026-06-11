export interface Staff {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  name: string
  display_name?: string // 追加
  line_name?: string
  x_account?: string
  discord_id?: string
  discord_channel_id?: string
  role: string[]
  stores: string[]
  ng_days: string[]
  want_to_learn: string[]
  available_scenarios: string[]
  notes?: string
  phone?: string
  email?: string
  user_id?: string | null
  availability: string[]
  experience: number
  special_scenarios: string[]
  /** GM可能シナリオごとのメイン/サブ（一覧バッジ色分け用・assignments 読込時のみ） */
  gm_scenario_modes?: Record<string, 'main_only' | 'sub_only' | 'main_and_sub'>
  experienced_scenarios?: string[]
  status: 'active' | 'inactive' | 'on-leave'
  avatar_url?: string | null
  avatar_color?: string | null
  created_at: string
  updated_at: string
}

// 料金修正ルール
