// @vitest-environment jsdom
// 管理画面 › 貸切・予約 › グループ一覧の先行表示とページ分け（改善 6）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrivateGroupListItem } from '../hooks/usePrivateGroupList'

const state = vi.hoisted(() => ({
  hook: { groups: [] as unknown[], loading: false, loadingMore: false, detailsLoading: false, error: null as string | null, loadGroups: vi.fn() },
}))
vi.mock('../hooks/usePrivateGroupList', () => ({ usePrivateGroupList: () => state.hook }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'staff' } }) }))
vi.mock('./PrivateGroupFeedbackBadge', () => ({ PrivateGroupFeedbackBadge: () => null }))
vi.mock('./PrivateGroupAnnouncementHistoryDialog', () => ({ PrivateGroupAnnouncementHistoryDialog: () => null }))
vi.mock('@/lib/privateSurveyDelivery', () => ({ readSurveyDeliveries: vi.fn(), sendSurveyNotice: vi.fn(), surveyDeliveryLabels: {} }))
vi.mock('@/lib/api/privateBookingMgmtReadApi', () => ({ privateBookingMgmtRpcApi: {} }))
import { GROUP_LIST_PAGE_SIZE, PrivateGroupList } from './PrivateGroupList'

const group = (i: number, extra: Partial<PrivateGroupListItem> = {}): PrivateGroupListItem => ({
  id: `g${i}`, invite_code: `CODE${i}`, status: 'confirmed', organizer_id: 'u', scenario_master_id: 's',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', details_loaded: true,
  scenario_masters: { id: 's', title: `作品${i}` }, members: [], candidate_dates: [], organizer: { name: `幹事${i}` },
  confirmed_date: '2099-01-01', confirmed_time: '13:00〜17:00', reservation_numbers: [`PB-${i}`],
  ...extra,
})

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  state.hook = { groups: [], loading: false, loadingMore: false, detailsLoading: false, error: null, loadGroups: vi.fn() }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const render = async () => { await act(async () => root.render(<PrivateGroupList />)) }
const cards = () => host.querySelectorAll('h3.font-medium').length
const moreButton = () => host.querySelector<HTMLButtonElement>('[data-testid="private-group-list-more"]')
const searchInput = () => host.querySelector<HTMLInputElement>('input[placeholder^="予約番号"]')
async function typeSearch(value: string) {
  const input = searchInput()!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('グループ一覧の先行表示', () => {
  it('最初の分が届く前だけ「読み込み中」', async () => {
    state.hook = { ...state.hook, loading: true, loadingMore: true, detailsLoading: true }
    await render()
    expect(host.textContent).toContain('読み込み中...')
    expect(searchInput()).toBeNull()
  })

  it('続きを読んでいる間も検索欄と一覧を出し、読み込み中の分は対象外と注記する', async () => {
    state.hook = { ...state.hook, groups: [group(1, { details_loaded: false, reservation_numbers: undefined, confirmed_date: undefined })], loadingMore: true, detailsLoading: true }
    await render()
    expect(searchInput()).not.toBeNull()
    expect(cards()).toBe(1)
    expect(host.textContent).toContain('読み込み済み1件中1件が該当')
    expect(host.querySelector('[data-testid="private-group-list-loading-note"]')?.textContent).toContain('読み込み中の分は検索・絞り込みの対象外です')
    // 確定公演の日程は後から埋める（それまではスケルトン）
    expect(host.querySelector('[data-testid="private-group-details-skeleton"]')).not.toBeNull()
  })

  it('グループ本体を読み終え、予約・履歴だけ残っている間は予約番号での検索が後から有効になると出す', async () => {
    state.hook = { ...state.hook, groups: [group(1, { details_loaded: false, reservation_numbers: undefined, confirmed_date: undefined })], detailsLoading: true }
    await render()
    expect(host.textContent).toContain('全1件中1件が該当')
    expect(host.querySelector('[data-testid="private-group-list-loading-note"]')?.textContent).toContain('予約番号での検索')
    await typeSearch('PB-1')
    expect(host.textContent).toContain('読み込み済みの分には条件に一致するグループがありません')
  })

  it('読み終えたら注記とスケルトンを消し、確定公演の日程を出す', async () => {
    state.hook = { ...state.hook, groups: [group(1)] }
    await render()
    expect(host.querySelector('[data-testid="private-group-list-loading-note"]')).toBeNull()
    expect(host.querySelector('[data-testid="private-group-details-skeleton"]')).toBeNull()
    expect(host.textContent).toContain('2099/01/01')
    await typeSearch('PB-1')
    expect(cards()).toBe(1)
  })
})

describe('グループ一覧のページ分け（100 件ずつ）', () => {
  it(`ちょうど ${GROUP_LIST_PAGE_SIZE} 件なら全部出し「さらに表示」は出さない`, async () => {
    state.hook = { ...state.hook, groups: Array.from({ length: GROUP_LIST_PAGE_SIZE }, (_, i) => group(i)) }
    await render()
    expect(cards()).toBe(100)
    expect(moreButton()).toBeNull()
  })

  it('101 件なら 100 件を出し、「さらに表示（残り1件）」で残りを出す', async () => {
    state.hook = { ...state.hook, groups: Array.from({ length: 101 }, (_, i) => group(i)) }
    await render()
    expect(cards()).toBe(100)
    expect(host.textContent).toContain('（100件を表示）')
    expect(moreButton()?.textContent).toBe('さらに表示（残り1件）')
    await act(async () => moreButton()!.click())
    expect(cards()).toBe(101)
    expect(moreButton()).toBeNull()
  })

  it('検索条件を変えたら先頭の 100 件から出し直す', async () => {
    state.hook = { ...state.hook, groups: Array.from({ length: 250 }, (_, i) => group(i)) }
    await render()
    await act(async () => moreButton()!.click())
    expect(cards()).toBe(200)
    await typeSearch('作品')
    expect(cards()).toBe(100)
    expect(moreButton()?.textContent).toBe('さらに表示（残り150件）')
  })
})
