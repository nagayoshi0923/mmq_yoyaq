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
  selectedSlots: [], onToggle: () => {}, maxSelections: 6, deadlineDays: 0,
}
const rowTexts = () => [...host.querySelectorAll('[data-testid="work-private-tab"] .wpt__row')].map((b) => b.textContent)

it('空いている枠だけを近い日から並べ、満席の枠は「満席の枠も表示する」で出す', async () => {
  await act(async () => root.render(<WorkPrivateTab {...base} />))
  expect(rowTexts()).toEqual(['13:00午後空きあり', '19:00夜空きあり'])
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => box.click())
  expect(rowTexts()).toEqual(['13:00午後空きあり', '19:00夜満席', '19:00夜空きあり'])
})

it('他の公演と重なる枠は「満席」で押せない（理由も出さない）', async () => {
  const onToggle = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} onToggle={onToggle} />))
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  const full = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="work-private-tab"] .wpt__row')].find((b) => b.textContent?.includes('満席'))!
  expect(full.disabled).toBe(true)
  await act(async () => full.click())
  expect(onToggle).not.toHaveBeenCalled()
  expect(host.querySelector('[role="status"]')).toBeNull()
})

it('選んだ候補は「第N希望」で出し、押すと候補に入れる', async () => {
  const onToggle = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} onToggle={onToggle} selectedSlots={[{ date: '2030-01-21', slot: { label: '夜', startTime: '19:00', endTime: '23:00' } }]} />))
  expect(rowTexts()).toContain('✓19:00夜第1希望')
  const first = host.querySelector<HTMLButtonElement>('[data-testid="work-private-tab"] .wpt__row')!
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

// 2026-11-18 えいきち報告: 札幌店（締切14日前）で月末に開くと、その月に空きが1つも出ない
const allFull = {
  slotsByDate: { '2030-01-20': [slot('午後', '13:00')], '2030-01-21': [slot('夜', '19:00')] },
  unavailableReasons: { '2030-01-20-午後': '受付締切を過ぎています', '2030-01-21-夜': '受付締切を過ぎています' },
}

it('読み込んだ範囲に空きが1つも無ければ、次の月の分を自動で足す（同じ範囲では2回足さない）', async () => {
  const change = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} slotAvailability={allFull} onMonthChange={change} />))
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(1)
  await act(async () => root.render(<WorkPrivateTab {...base} slotAvailability={allFull} onMonthChange={change} />))
  expect(change).toHaveBeenCalledTimes(1)
  // 月の切り替えボタンは置かない（見本どおり）
  expect([...host.querySelectorAll('button')].some((b) => /前の月|次の月/.test(b.textContent ?? ''))).toBe(false)
})

it('空きがあれば月を送らない。読み込み中・絞り込み中も送らない', async () => {
  const change = vi.fn()
  await act(async () => root.render(<WorkPrivateTab {...base} onMonthChange={change} />))
  await act(async () => root.render(<WorkPrivateTab {...base} slotAvailability={allFull} loading onMonthChange={change} />))
  expect(change).not.toHaveBeenCalled()
})

it('絞り込みは見本どおり1列（土日祝だけ・すべての時間・昼・夜）。土日祝だけは押すと付け外し', async () => {
  await act(async () => root.render(<WorkPrivateTab {...base} />))
  const chips = () => [...host.querySelectorAll<HTMLButtonElement>('[data-testid="private-filter"] button')]
  expect(chips().map((b) => b.textContent)).toEqual(['土日祝だけ', 'すべての時間', '昼', '夜'])
  const pressed = () => chips().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)
  expect(pressed()).toEqual(['すべての時間'])
  await act(async () => chips()[0].click())
  expect(pressed()).toEqual(['土日祝だけ', 'すべての時間'])
  await act(async () => chips()[0].click())
  expect(pressed()).toEqual(['すべての時間'])
})

it('見本にない表示（受付締切の注記・日にち/時間の見出し）は出さない。日付は「11/28（土）」の形', async () => {
  await act(async () => root.render(<WorkPrivateTab {...base} deadlineDays={0} />))
  const text = host.textContent ?? ''
  expect(text).not.toContain('日前まで申し込めます')
  expect(text).not.toContain('すべての日')
  expect(host.querySelector('.wpt__day')?.textContent).toBe('1/20（日）')
})

// 2026-11-18 えいきち「表示内容がこれじゃない」: 行は「時刻・空いている店舗・空きあり」（見本どおり）
it('行には、その枠が空いている店舗の名前を出す（店舗が1つならその店舗）', async () => {
  const slotStoreIds = { '2030-01-20-午後': ['s1'], '2030-01-21-夜': ['s2', 's1'] }
  await act(async () => root.render(<WorkPrivateTab {...base} slotStoreIds={slotStoreIds} />))
  expect(rowTexts()).toEqual(['13:00馬場空きあり', '19:00馬場・大久保空きあり'])
  await act(async () => root.render(<WorkPrivateTab {...base} selectedStoreIds={['s2']} />))
  expect(rowTexts()).toEqual(['13:00大久保空きあり', '19:00大久保空きあり'])
})
