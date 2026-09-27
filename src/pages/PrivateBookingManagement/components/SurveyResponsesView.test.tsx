// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyResponsesView } from './SurveyResponsesView'
import { readPrivateGroupByReservation, readPrivateGroupSurveyResponses, type PrivateGroupSnapshot } from '@/lib/privateGroupRead'
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupByReservation: vi.fn(), readPrivateGroupSurveyResponses: vi.fn() }))
vi.mock('@/lib/groupSurveySettings', () => ({ getGroupSurveySettings: vi.fn(async () => ({ survey_enabled: true, org_scenario_id: 'scenario' })) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: 'q', question_text: '質問', question_type: 'text', options: [], is_required: false }], error: null }) }) }) }) } }))
const snapshot = (id: string) => ({ group: { id, members: [{ id: 'member', guest_name: 'ニックネーム未設定', staff_display_name: id }] } }) as unknown as PrivateGroupSnapshot
let root: Root
let container: HTMLDivElement
const render = async (id: string) => { await act(async () => root.render(<SurveyResponsesView reservationId={id} scenarioId="scenario" />)) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  container = document.createElement('div'); root = createRoot(container)
  vi.mocked(readPrivateGroupByReservation).mockImplementation(async id => snapshot(id))
  vi.mocked(readPrivateGroupSurveyResponses).mockResolvedValue([{ member_id: 'member', responses: { q: '回答' }, submitted_at: '2026-09-27T00:00:00Z' }])
})
afterEach(async () => { await act(async () => root.unmount()) })
describe('管理側アンケートの読み取り', () => {
  it('スタッフ用の表示名を使用し、回答内容を表示する', async () => {
    await render('スタッフ用氏名')
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toContain('スタッフ用氏名:')
    expect(container.textContent).toContain('回答')
    expect(container.textContent).not.toContain('ニックネーム未設定')
  })
  it('予約切替後に到着した旧予約の応答を表示しない', async () => {
    let resolve!: (value: PrivateGroupSnapshot) => void
    vi.mocked(readPrivateGroupByReservation).mockReturnValueOnce(new Promise(r => { resolve = r }))
    await render('old')
    await render('new')
    await act(async () => resolve(snapshot('old')))
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toContain('new:')
    expect(container.textContent).not.toContain('old:')
  })
  it('拒否や取得失敗をアンケートなしとして隠さない', async () => {
    vi.mocked(readPrivateGroupSurveyResponses).mockRejectedValueOnce(new Error('42501'))
    await render('denied')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('取得できません')
  })
})
