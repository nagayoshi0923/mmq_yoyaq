// @vitest-environment jsdom
// 作品ページ「公演に参加する」: 店舗チップ・昼夜・満席の回の出し分け（お客様画面の刷新 QW-20261114-001）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkScheduleTab } from './WorkScheduleTab'
import type { EventSchedule } from '../utils/types'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const ev = (id: string, date: string, start: string, store: string, seats: number): EventSchedule => ({
  event_id: id, date, start_time: start, end_time: '23:00', store_id: store, store_name: store, store_short_name: store,
  max_participants: 6, current_participants: 6 - seats, available_seats: seats, reservation_deadline_hours: 0, is_available: seats > 0,
})
const events = [ev('a', '2030-01-19', '13:00:00', '大宮', 5), ev('b', '2030-01-19', '19:00:00', '馬場', 1), ev('c', '2030-01-20', '14:00:00', '大久保', 0)]
const stores = [{ id: '大宮', name: '大宮' }, { id: '馬場', name: '馬場' }, { id: '大久保', name: '大久保' }]
const base = { events, stores, storeFilter: [], onStoreFilterChange: () => {}, selectedEventId: null, onSelect: () => {}, participantCount: 1, onParticipantCountChange: () => {}, maxParticipants: 6, accent: '#123' }
const ids = () => [...host.querySelectorAll('[data-event-id]')].map((b) => b.getAttribute('data-event-id'))
const press = async (text: string) => { const b = [...host.querySelectorAll('button')].find((x) => x.textContent === text)!; await act(async () => b.click()) }

it('近い順に日付ごとに並べ、満席の回は「満席の回も表示する」を外すと隠す', async () => {
  await act(async () => root.render(<WorkScheduleTab {...base} />))
  expect(ids()).toEqual(['a', 'b', 'c'])
  expect(host.textContent).toContain('● あと1席')
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(ids()).toEqual(['a', 'b'])
})

it('昼・夜で絞れる（夜は17時以降に始まる回）', async () => {
  await act(async () => root.render(<WorkScheduleTab {...base} />))
  await press('夜')
  expect(ids()).toEqual(['b'])
  await press('昼')
  expect(ids()).toEqual(['a', 'c'])
})

it('店舗チップを押すとその店舗を外す（全店選択中から1つ外す）', async () => {
  const change = vi.fn()
  await act(async () => root.render(<WorkScheduleTab {...base} onStoreFilterChange={change} />))
  await press('✓ 馬場')
  expect(change).toHaveBeenCalledWith(['大宮', '大久保'])
})

it('人数は残席より多くできない', async () => {
  const change = vi.fn()
  await act(async () => root.render(<WorkScheduleTab {...base} selectedEventId="b" participantCount={1} onParticipantCountChange={change} />))
  const plus = host.querySelector<HTMLButtonElement>('button[aria-label="1人増やす"]')!
  expect(plus.disabled).toBe(true)
})
