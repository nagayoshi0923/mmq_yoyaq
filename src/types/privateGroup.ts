// ================================================
// 貸切グループ関連の型定義
// ================================================

// グループのステータス
export type PrivateGroupStatus = 'gathering' | 'date_adjusting' | 'booking_requested' | 'confirmed' | 'cancelled'

// メンバーのステータス
export type PrivateGroupMemberStatus = 'pending' | 'joined' | 'declined'

// 日程回答
export type DateResponse = 'ok' | 'ng' | 'maybe'

// 貸切グループ
export interface PrivateGroup {
  id: string
  organization_id: string
  scenario_master_id: string | null
  organizer_id: string
  name: string | null
  invite_code: string
  status: PrivateGroupStatus
  reservation_id: string | null
  target_participant_count: number | null
  preferred_store_ids: string[]
  notes: string | null
  character_assignment_method?: 'survey' | 'self' | null
  character_assignments?: Record<string, string> | null
  created_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  scenario_masters?: {
    id: string
    title: string
    key_visual_url: string | null
    survey_enabled?: boolean
    characters?: Array<{
      name: string
      gender?: string
      age?: string
      occupation?: string
      description?: string
      image_url?: string
      sort_order?: number
    }>
  } | null
  organizer?: { id: string; email: string; nickname?: string } | null
  members?: PrivateGroupMember[]
  candidate_dates?: PrivateGroupCandidateDate[]
}

// グループメンバー
export interface PrivateGroupMember {
  id: string
  group_id: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  guest_phone: string | null
  is_organizer: boolean
  status: PrivateGroupMemberStatus
  joined_at: string | null
  created_at: string
  // JOIN時の拡張フィールド
  users?: { id: string; email: string; nickname?: string } | null
  date_responses?: PrivateGroupDateResponse[]
}

// 候補日時
export interface PrivateGroupCandidateDate {
  id: string
  group_id: string
  date: string
  /** DB では夜帯は「夜間」で返ることがある */
  time_slot: '午前' | '午後' | '夜' | '夜間'
  start_time: string
  end_time: string
  order_num: number
  created_at: string
  /** 候補日のステータス: active=有効, rejected=却下済み */
  status?: 'active' | 'rejected'
  // JOIN時の拡張フィールド
  responses?: PrivateGroupDateResponse[]
}

// 日程回答
export interface PrivateGroupDateResponse {
  id: string
  group_id: string
  member_id: string
  candidate_date_id: string
  response: DateResponse
  created_at: string
  updated_at: string
}

// グループチャットメッセージ
export interface PrivateGroupMessage {
  id: string
  group_id: string
  member_id: string | null  // NULLの場合は退出したメンバー
  message: string
  created_at: string
  // JOIN時の拡張フィールド
  member?: PrivateGroupMember
}

// 招待ステータス
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

// グループ招待
export interface PrivateGroupInvitation {
  id: string
  group_id: string
  invited_user_id: string | null
  invited_email: string
  invited_by: string
  status: InvitationStatus
  created_at: string
  responded_at: string | null
  // JOIN時の拡張フィールド
  invited_user?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  inviter?: {
    id: string
    display_name: string | null
  }
}
