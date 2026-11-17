// @vitest-environment jsdom
// 作品ページ「貸切で遊ぶ」: 空いている日を近い順に並べる・読めないときは枠を出さない・候補の順番（お客様画面の刷新 QW-20261114-001）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkPrivateTab } from './WorkPrivateTab'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const slot = (label: '午前' | '午後' | '夜', startTime: string) => ({ key: label === '夜' ? 'evening' as const : label === '午後' ? 'afternoon' as const : 'morning' as const, label, startTime, endTime: '23:00' })
const base = {
  summary: '6人で貸切（この作品の定員）・1人 4,000円〜',
  stores: [{ id: 's1', name: '馬場店', short_name: '馬場' }, { id: 's2', name: '大久保店', short_name: '大久保' }],
  selectedStoreIds: ['s1', 's2'], onStoreIdsChange: () => {}, currentMonth: new Date(2030, 0, 1), onMonthChange: () => {},
  availableDates: ['2030-01-21', '2030-01-20'],
  slotAvailability: {
    slotsByDate: { '2030-01-20': [slot('午後', '13:00'), slot('夜', '19:00')], '2030-01-21': [slot('夜', '19:00')] },
    unavailableReasons: { '2030-01-20-夜': '他の公演と重なります' },
  },
  selectedSlots: [], onToggle: () => {}, maxSelections: 6, onCreateGroup: () => {}, deadlineDays: 0,
}
const rowTexts = () => [...host.querySelectorAll('[data-testid="work-private-tab"] li button')].map((b) => b.textContent)

it('空いている枠だけを近い日から並べ、満席の枠は「満席の枠も表示する」で出す', async () => {
  await act(async () => root.render(<WorkPrivateTab {...base} />))
  expect(rowTexts()).toEqual(['13:00午後空きあり', '19:00夜空きあり'])
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => box.click())
  expect(rowTexts()).toEqual(['13:00午後空きあり', '19:00夜満席', '19:00夜空きあり'])
})

it('選んだ候補は「第N希望」で出し、押すと候補に入れる', async () => {
  const onToggle = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} onToggle={onToggle} selectedSlots={[{ date: '2030-01-21', slot: { label: '夜', startTime: '19:00', endTime: '23:00' } }]} />))
  expect(rowTexts()).toContain('✓19:00夜第1希望')
  const first = host.querySelector<HTMLButtonElement>('[data-testid="work-private-tab"] li button')!
  await act(async () => first.click())
  expect(onToggle).toHaveBeenCalledWith('2030-01-20', { label: '午後', startTime: '13:00', endTime: '23:00' })
})

it('空き状況を読めなかったときは枠を出さず、赤い案内と再読み込みを出す', async () => {
  const retry = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} availabilityError="読めませんでした" onRetry={retry} />))
  expect(rowTexts()).toEqual([])
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('空き状況を読み込めませんでした')
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="private-booking-availability-retry"]')!.click())
  expect(retry).toHaveBeenCalledTimes(1)
})

it('受付範囲を読めなかったときは枠を出さず、再試行を出す', async () => {
  const retry = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} horizon={{ days: null, loading: false, failed: true, retry }} />))
  expect(rowTexts()).toEqual([])
  expect(host.querySelector('[data-testid="private-booking-horizon-failed"]')!.textContent).toContain('受付範囲を確認できませんでした')
})

it('店舗は全部は外せない（最後の1つを押しても外さない）', async () => {
  const change = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} selectedStoreIds={['s1']} onStoreIdsChange={change} />))
  const baba = [...host.querySelectorAll('button')].find((b) => b.textContent === '✓ 馬場')!
  await act(async () => baba.click())
  expect(change).not.toHaveBeenCalled()
})
