// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { BookingCancellationTerms } from './BookingCancellationTerms'

let root: Root
let host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })

const base = {
  summary: '公演の48時間前まで無料で取消できます（マイページから）。それ以降のキャンセル料: 48時間前から 50%、24時間前から 100%、開演後・無断は 100%。',
  freeDeadlineLabel: '10/27(火) 19:00',
  freeHoursLabel: '48時間前',
  changeDeadlineLabel: '24時間前',
}

it('期限前の公演は要点と「無料で取消できる期限」を出し、注意は出さない（点検 20）', () => {
  act(() => root.render(<MemoryRouter><BookingCancellationTerms terms={{ ...base, insideNoFreeCancelWindow: false }} agreed={false} onAgreedChange={() => {}} eventId="e" organizationSlug="org" /></MemoryRouter>))
  expect(host.textContent).toContain('48時間前から 50%')
  expect(host.textContent).toContain('10/27(火) 19:00 までです')
  expect(host.textContent).toContain('人数の変更（減らす・増やす）は公演の24時間前まで')
  expect(host.querySelector('[data-testid="booking-late-cancel-warning"]')).toBeNull()
})

it('48 時間を切った公演は「マイページから取消できません」と同意のチェックを出す（点検 34）', () => {
  const onAgreed = vi.fn()
  act(() => root.render(<MemoryRouter><BookingCancellationTerms terms={{ ...base, insideNoFreeCancelWindow: true }} agreed={false} onAgreedChange={onAgreed} eventId="e" organizationSlug="org" /></MemoryRouter>))
  const warning = host.querySelector('[data-testid="booking-late-cancel-warning"]')!
  expect(warning.textContent).toContain('この公演はマイページから取消できません')
  expect(warning.textContent).toContain('開演まで48時間を切っているため')
  act(() => (host.querySelector('[data-testid="booking-late-cancel-agree"]') as HTMLButtonElement).click())
  expect(onAgreed).toHaveBeenCalledWith(true)
})
