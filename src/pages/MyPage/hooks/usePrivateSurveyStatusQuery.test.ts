import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { isSurveyPending } from './usePrivateSurveyStatusQuery'

const NOW = new Date('2026-10-09T12:00:00+09:00')
const base = { survey_enabled: true, survey_url: '', questions: [{}], existing_response_id: null, survey_deadline_at: '2026-10-24T23:59:59+09:00' }

it('有効・質問あり・未回答・締切前なら未回答扱い', () => {
  expect(isSurveyPending(base, NOW)).toBe(true)
})

it('回答済み・無効・外部フォーム・質問なし・締切後は出さない', () => {
  expect(isSurveyPending({ ...base, existing_response_id: 'x' }, NOW)).toBe(false)
  expect(isSurveyPending({ ...base, survey_enabled: false }, NOW)).toBe(false)
  expect(isSurveyPending({ ...base, survey_url: 'https://example.test/form' }, NOW)).toBe(false)
  expect(isSurveyPending({ ...base, questions: [] }, NOW)).toBe(false)
  expect(isSurveyPending({ ...base, survey_deadline_at: '2026-10-08T23:59:59+09:00' }, NOW)).toBe(false)
  expect(isSurveyPending(null, NOW)).toBe(false)
})
