// @vitest-environment jsdom
// B29: 候補 6 件を選んでログインの入口へ進み、ブラウザで戻ると候補 0 件・表示月が今月に戻っていた。
// 作品ページと同じ形（状態を持つ画面＋このフック）で、戻る・再読み込み（作り直し）・URL の指定・ログインの前後・送信後を確かめる
import { act, useCallback, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateBookingTabDraft } from './usePrivateBookingTabDraft'
import { clearPrivateBookingTabDraft, PRIVATE_BOOKING_TAB_DRAFT_KEY } from '../privateBookingTabDraft'

type Slot = { date: string; slot: { label: string; startTime: string; endTime: string } }
const slot = (date: string): Slot => ({ date, slot: { label: '夜', startTime: '19:00', endTime: '22:00' } })
const SIX = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'].map(slot)
let page: { tab: string; slots: Slot[]; stores: string[]; month: string; setTab: (t: 'schedule' | 'private') => void; setSlots: (s: Slot[]) => void; setStores: (s: string[]) => void; setMonth: (ym: string) => void }
function Page(props: { ready?: boolean; scenario?: string; org?: string; user?: string | null }) {
  const [tab, setTab] = useState<'schedule' | 'private'>('schedule')
  const [slots, setSlots] = useState<Slot[]>([])
  const [stores, setStores] = useState<string[]>(['st1', 'st2'])
  const [month, setMonthDate] = useState(new Date(2026, 9, 1))
  const showMonthOf = useCallback((d: string) => { const [y, m] = d.split('-').map(Number); setMonthDate(new Date(y, m - 1, 1)) }, [])
  usePrivateBookingTabDraft({
    ready: props.ready ?? true, organizationId: props.org ?? 'org-1', scenarioMasterId: props.scenario ?? 'sm1', userId: props.user ?? null,
    acceptsPrivateBooking: true, availableStoreIds: ['st1', 'st2'], activeTab: tab, setActiveTab: setTab,
    selectedTimeSlots: slots as never, setSelectedTimeSlots: setSlots as never, selectedStoreIds: stores, setSelectedStoreIds: setStores,
    currentMonth: month, showMonthOf,
  })
  page = { tab, slots, stores, month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, setTab, setSlots, setStores, setMonth: (ym) => showMonthOf(`${ym}-01`) }
  return null
}
let root: Root
const mount = (props: Parameters<typeof Page>[0] = {}) => act(async () => root.render(<Page {...props} />))
const remount = async (props: Parameters<typeof Page>[0] = {}) => { await act(async () => root.unmount()); root = createRoot(document.createElement('div')); await mount(props) }
async function chooseSix() {
  await act(async () => { page.setTab('private'); page.setStores(['st2']); page.setMonth('2026-12'); page.setSlots(SIX) })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T12:00:00+09:00'))
  sessionStorage.clear(); window.history.replaceState({}, '', '/queens-waltz/scenario/kaku')
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })

describe('貸切タブの選択を同じタブで戻す', () => {
  it('候補 6 件・店舗・表示月・貸切タブを選んで画面を離れ、戻る（作り直し）と同じ状態に戻る。再読み込みでも同じ', async () => {
    await mount(); await chooseSix()
    await remount()
    expect(page.tab).toBe('private'); expect(page.slots.map((s) => s.date)).toEqual(SIX.map((s) => s.date))
    expect(page.stores).toEqual(['st2']); expect(page.month).toBe('2026-12')
    await remount()
    expect(page.slots).toHaveLength(6)
  })
  it('読み込み直後の空の状態で預かりを上書きしない（ログインの状態などが読めるまで戻さず、預け直しもしない）', async () => {
    await mount(); await chooseSix()
    await remount({ ready: false })
    expect(page.slots).toEqual([])
    expect(JSON.parse(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)!).timeSlots).toHaveLength(6)
    await mount({ ready: true })
    expect(page.slots).toHaveLength(6)
  })
  it('URL が日付・枠・店舗を指定しているときは URL を優先して戻さない', async () => {
    await mount(); await chooseSix()
    window.history.replaceState({}, '', '/queens-waltz/scenario/kaku?tab=private&date=2026-12-20&slot=evening&store=st1')
    await remount()
    expect(page.slots).toEqual([])
  })
  it('別の作品・別の組織には使わない', async () => {
    await mount(); await chooseSix()
    await remount({ scenario: 'sm2' }); expect(page.slots).toEqual([])
    await remount({ org: 'org-2' }); expect(page.slots).toEqual([])
  })
  it('未ログインで選んでログインした（同じタブ）ら続ける。戻ったあとも続く', async () => {
    await mount(); await chooseSix()
    await mount({ user: 'user-x' })
    expect(page.slots).toHaveLength(6)
    expect(JSON.parse(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)!).owner).toBe('user-x')
    await remount({ user: 'user-x' })
    expect(page.slots).toHaveLength(6)
  })
  it('ログイン済みの利用者がログアウト・別の利用者に変わったら、その人の選択を残さない', async () => {
    await mount({ user: 'user-x' }); await chooseSix()
    await mount({ user: null })
    expect(page.slots).toEqual([])
    await remount({ user: 'user-y' })
    expect(page.slots).toEqual([])
  })
  it('申込を送ったら消え、戻っても送った候補は戻らない', async () => {
    await mount(); await chooseSix()
    clearPrivateBookingTabDraft()
    await remount()
    expect(page.slots).toEqual([])
    expect(page.tab).toBe('schedule')
  })
  it('公演日程タブに戻して候補が無ければ預かりを消す', async () => {
    await mount(); await act(async () => page.setTab('private'))
    await act(async () => page.setTab('schedule'))
    expect(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)).toBeNull()
  })
})
