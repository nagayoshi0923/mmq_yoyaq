// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ method: vi.fn(), pick: vi.fn(), decide: vi.fn() }))
vi.mock('./castingActions', () => ({ saveCastingMethod: mocks.method, saveCharacterPreference: mocks.pick, saveCastingDecisions: mocks.decide }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('./useGroupCasting', () => ({ useGroupCasting: () => ({}) }))
import { CastingScreen, type CastingScreenProps } from './CastingScreen'
import { CastingSection } from '../overview/CastingSection'

let root: Root
let host: HTMLDivElement
const members = [
  { memberId: 'a', name: 'いちこ', isMe: true, isGuest: false },
  { memberId: 'b', name: '二郎', isMe: false, isGuest: false },
]
const characters = [{ id: 'x', name: '女将' }, { id: 'y', name: '画家' }]
const props = (over: Partial<CastingScreenProps> = {}): CastingScreenProps => ({
  sheet: 'casting-confirm', groupId: 'g', myMemberId: 'a', isOrganizer: true, method: 'self', assignments: { a: 'x', b: 'x' }, confirmed: false,
  characters, members, requiredCount: 2, surveyAvailable: true, onRemind: vi.fn(async () => {}), onChanged: vi.fn(), onBack: vi.fn(), ...over,
})
const render = (node: React.ReactNode) => act(async () => { root.render(<MemoryRouter>{node}</MemoryRouter>) })
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); vi.clearAllMocks() })

it('③ 重なりは琥珀色で警告し、直すまで確定できない。直すと期待値つきで保存する', async () => {
  const p = props()
  await render(<CastingScreen {...p} />)
  const submit = host.querySelector('[data-testid="casting-confirm-submit"]') as HTMLButtonElement
  expect(submit.disabled).toBe(true)
  expect(host.querySelectorAll('[data-dup="true"]').length).toBe(2)
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('女将が 2 人')
  const select = host.querySelectorAll('select')[1] as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, 'y')
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(submit.disabled).toBe(false)
  await act(async () => submit.click())
  expect(mocks.decide).toHaveBeenCalledWith('g', { a: 'x', b: 'y' }, { a: 'x', b: 'x' })
  expect(p.onBack).toHaveBeenCalled()
})

it('② キャラクターを押すと希望を保存する。③ 未回答の人に知らせる', async () => {
  await render(<CastingScreen {...props({ sheet: 'casting-pick', assignments: {} })} />)
  await act(async () => (host.querySelector('[data-testid="casting-character"]') as HTMLButtonElement).click())
  expect(mocks.pick).toHaveBeenCalledWith('g', 'a', 'x')
  const p = props({ assignments: { a: 'x' } })
  await render(<CastingScreen {...p} />)
  await act(async () => (host.querySelector('[data-testid="casting-remind"]') as HTMLButtonElement).click())
  expect(p.onRemind).toHaveBeenCalledWith(['b'])
})

it('概要タブ: アンケートの未回答の名前は主催者だけ、メンバーには「あなたは未回答」', async () => {
  const base = { myMemberId: 'a', method: 'survey', confirmed: false, assignments: {}, characters, members, surveyAvailable: true,
    onChangeMethod: vi.fn(), onChangeCasting: vi.fn(), onOpenSurvey: vi.fn(), onRemindSurvey: vi.fn(async () => {}) }
  const status = { survey_enabled: true, question_count: 1, answered_count: 1, target_count: 2, i_answered: false, deadline_at: '2099-11-05T14:59:59Z' }
  await render(<CastingSection {...base} isOrganizer status={{ ...status, unanswered: [{ member_id: 'a', name: 'いちこ' }, { member_id: 'b', name: '二郎' }] }} />)
  expect(host.querySelector('[data-testid="casting-survey-count"]')?.textContent).toBe('回答済み 1/2 名')
  expect(host.querySelector('[data-testid="casting-survey-unanswered"]')?.textContent).toBe('未回答: あなた・二郎')
  await act(async () => (host.querySelector('[data-testid="casting-survey-remind"]') as HTMLButtonElement).click())
  expect(base.onRemindSurvey).toHaveBeenCalledWith(['b'])
  await render(<CastingSection {...base} isOrganizer={false} status={{ ...status, unanswered: null }} />)
  expect(host.querySelector('[data-testid="casting-survey-unanswered"]')).toBeNull()
  expect(host.querySelector('[data-testid="casting-survey-me"]')?.textContent).toBe('あなたは未回答')
  expect(host.querySelector('[data-testid="casting-survey-remind"]')).toBeNull()
  expect(host.textContent).not.toContain('決め方を変える')
})
