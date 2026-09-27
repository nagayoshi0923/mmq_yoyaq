import { beforeEach, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import { readSurveyQuestionSettings, saveSurveyQuestionSettings, listSurveyQuestionSources } from './surveyQuestionSettings'
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())
it('読み込み失敗と不正応答を空の設問一覧として返さない', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('failed') } as never)
  await expect(readSurveyQuestionSettings('scenario')).rejects.toThrow('failed')
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: {}, error: null } as never)
  await expect(readSurveyQuestionSettings('scenario')).rejects.toThrow('取得できません')
})
it.each(['40001', '55P03'])('競合 %s を成功扱いせず再確認方法を表示する', async code => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { code } } as never)
  await expect(saveSurveyQuestionSettings('scenario', [], 'loaded-revision')).rejects.toThrow(code === '40001' ? '別の操作' : '更新中')
})
it('取得した版を渡し保存後の版に更新する', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { questions: [], revision: 'next' }, error: null } as never)
  expect((await saveSurveyQuestionSettings('scenario', [], 'loaded')).revision).toBe('next')
  expect(supabase.rpc).toHaveBeenCalledWith('save_survey_question_settings', { p_org_scenario_id: 'scenario', p_questions: [], p_revision: 'loaded' })
})
it('コピー元取得の権限エラーを一覧なしに置き換えない', async () => {
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('denied') } as never)
  await expect(listSurveyQuestionSources('org')).rejects.toThrow('denied')
})
