// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('@/lib/privateGroupGuestSession', () => ({ getPrivateGroupGuestToken: () => 'tok' }))
import { reportSurveyEvent, resetSurveyEventCountForTest } from './surveyDiagnostics'
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); resetSurveyEventCountForTest() })
it('本人確認の印と画面の情報を付けて送り、1画面40件で止める', () => {
  reportSurveyEvent('g', 'm', 'open', { a: 1 })
  expect(rpc).toHaveBeenCalledWith('record_private_group_survey_event', expect.objectContaining({ p_group_id: 'g', p_member_id: 'm', p_guest_token: 'tok', p_event: 'open', p_detail: expect.objectContaining({ a: 1, ua: expect.any(String), vw: expect.any(Number) }) }))
  for (let i = 0; i < 60; i++) reportSurveyEvent('g', 'm', 'open')
  expect(rpc).toHaveBeenCalledTimes(40)
})
it('送信に失敗しても例外を外へ出さない', () => {
  rpc.mockImplementation(() => { throw new Error('offline') })
  expect(() => reportSurveyEvent('g', 'm', 'open')).not.toThrow()
  rpc.mockRejectedValue(new Error('offline'))
  expect(() => reportSurveyEvent('g', 'm', 'open')).not.toThrow()
})
