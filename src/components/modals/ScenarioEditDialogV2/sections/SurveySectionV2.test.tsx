// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest' 
import { ImportQuestionsDialog } from './SurveySectionV2'
import { listSurveyQuestionSources, readSurveyQuestionSettings } from '@/lib/surveyQuestionSettings'
vi.mock('@/lib/surveyQuestionSettings', () => ({ listSurveyQuestionSources: vi.fn(), readSurveyQuestionSettings: vi.fn() }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => 'org' }))
vi.mock('@/hooks/useOperatingSettings', () => ({ useOperatingSettings: vi.fn() }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
let container: HTMLDivElement
let root: Root
beforeEach(() => {
 vi.resetAllMocks()
 Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
 container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const render = async (element: React.ReactNode) => { await act(async () => root.render(element)) }
const click = async (text: string) => { await act(async () => {
 const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes(text))
 if (!button) throw new Error('Button missing: '+text)
 button.click()
}) }
const body = () => document.body.textContent || '' 
const sources = ['A', 'B'].map(id => ({ id, org_scenario_id: id, title: `作品${id}`, questionCount: 1 }))
const data = (text: string) => ({ revision: text, questions: [{ id: text, org_scenario_id: text, question_text: text, question_type: 'text' as const, options: [], is_required: false, order_num: 1, created_at: '', updated_at: '' }] })
it('一覧取得失敗を設問なしと表示しない', async () => {
  vi.mocked(listSurveyQuestionSources).mockRejectedValueOnce(new Error('network'))
  await render(<ImportQuestionsDialog open onOpenChange={() => {}} onImport={() => {}} />)
  expect(body()).toContain('コピー元を取得できません')
  expect(body()).not.toContain('アンケートが設定されたシナリオがありません')
})
it('遅れて到着した別作品の設問をコピーしない', async () => {
  vi.mocked(listSurveyQuestionSources).mockResolvedValue(sources)
  let resolveA!: (value: ReturnType<typeof data>) => void
  vi.mocked(readSurveyQuestionSettings).mockImplementation(id => id === 'A' ? new Promise(resolve => { resolveA = resolve }) : Promise.resolve(data('Bの設問')))
  const onImport = vi.fn()
  await render(<ImportQuestionsDialog open onOpenChange={() => {}} onImport={onImport} />)
  await click('作品A')
  await click('作品B')
  expect(body()).toContain('Bの設問')
  await act(async () => { resolveA(data('Aの設問')) })
  expect(body()).not.toContain('Aの設問')
  await click('1件の質問を追加')
  expect(onImport.mock.calls[0][0][0].question_text).toBe('Bの設問')
})
it('プレビュー失敗後に前の設問をコピーできない', async () => {
  vi.mocked(listSurveyQuestionSources).mockResolvedValue(sources)
  vi.mocked(readSurveyQuestionSettings).mockResolvedValueOnce(data('Aの設問')).mockRejectedValueOnce(new Error('failed'))
  await render(<ImportQuestionsDialog open onOpenChange={() => {}} onImport={() => {}} />)
  await click('作品A'); expect(body()).toContain('Aの設問')
  await click('作品B')
  expect(body()).toContain('設問を取得できません')
  expect(body()).not.toContain('件の質問を追加')
})
