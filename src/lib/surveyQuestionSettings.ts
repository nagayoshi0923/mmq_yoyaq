import { supabase } from '@/lib/supabase'
import type { SurveyQuestion } from '@/types'

export interface SurveyQuestionSnapshot {
  questions: SurveyQuestion[]
  revision: string
}
export interface SurveyQuestionSource {
  id: string
  org_scenario_id: string
  title: string
  questionCount: number
}
function snapshot(data: unknown): SurveyQuestionSnapshot {
  const value = data as SurveyQuestionSnapshot | null
  if (!value || !Array.isArray(value.questions) || typeof value.revision !== 'string') {
    throw new Error('アンケート設定を取得できませんでした。画面を開き直してください。')
  }
  return value
}
export async function readSurveyQuestionSettings(id: string): Promise<SurveyQuestionSnapshot> {
  const { data, error } = await supabase.rpc('read_survey_question_settings', { p_org_scenario_id: id })
  if (error) throw error
  return snapshot(data)
}
export async function saveSurveyQuestionSettings(id: string, questions: Pick<SurveyQuestion, 'id' | 'question_text' | 'question_type' | 'options' | 'is_required' | 'order_num'>[], revision: string): Promise<SurveyQuestionSnapshot> {
  const { data, error } = await supabase.rpc('save_survey_question_settings', {
    p_org_scenario_id: id, p_questions: questions, p_revision: revision,
  })
  if (error) {
    if (error.code === '55P03') throw new Error('他の操作で設問を更新中です。少し待ってから保存し直してください。')
    if (error.code === '40001') throw new Error('設問が別の操作で変更されました。画面を開き直して変更内容を確認してください。')
    throw error
  }
  return snapshot(data)
}
export async function listSurveyQuestionSources(organizationId: string): Promise<SurveyQuestionSource[]> {
  const { data, error } = await supabase.rpc('list_survey_question_sources', { p_organization_id: organizationId })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('アンケートのコピー元を取得できませんでした。')
  return data as SurveyQuestionSource[]
}
