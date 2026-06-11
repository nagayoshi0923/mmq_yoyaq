import type { PrivateGroupMember } from './privateGroup'

// ================================================
// 公演前アンケート関連の型定義
// ================================================

// 質問タイプ
export type SurveyQuestionType = 'text' | 'single_choice' | 'multiple_choice' | 'character_selection' | 'rating'

// 質問の選択肢
export interface SurveyQuestionOption {
  value: string
  label: string
}

// アンケート質問
export interface SurveyQuestion {
  id: string
  org_scenario_id: string
  question_text: string
  question_type: SurveyQuestionType
  options: SurveyQuestionOption[]
  is_required: boolean
  order_num: number
  created_at: string
  updated_at: string
}

// アンケート回答
export interface SurveyResponse {
  id: string
  group_id: string
  member_id: string
  responses: Record<string, string | string[]>
  submitted_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  member?: PrivateGroupMember
}
