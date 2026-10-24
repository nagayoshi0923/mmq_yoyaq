// @vitest-environment jsdom
/**
 * 試作の画面の試験。実 API（supabase・fetch）に一切触れないこと、注意文、保存の範囲、
 * 管理のパネルの表示、公演ダイアログが保存しないこと、ポップアップが入力・URL・スクロールを壊さないことを確かめる。
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 実 API の入口。触れたら記録する（試作では 1 回も触れないこと）
const supabaseTouches: string[] = []
vi.mock('@/lib/supabase', () => {
  const handler: ProxyHandler<object> = { get: (_t, prop) => { supabaseTouches.push(String(prop)); return new Proxy(() => {}, handler) }, apply: () => { supabaseTouches.push('call'); return new Proxy(() => {}, handler) } }
  return { supabase: new Proxy(() => {}, handler) }
})
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div data-testid="popover-content">{children}</div>,
}))

import { CustomerScenarioPage } from './CustomerScenarioPage'
import { AdminSchedulePage } from './AdminSchedulePage'
import { PopupHost } from './PopupHost'
import { REQUEST_NOT_RESERVATION_NOTICE } from './model'
import { PROTO_STORAGE_KEY, readProtoState, emptyProtoState, writeProtoState } from './storage'
import { simulatePublish, subscribe } from './actions'
import { PROTO_SIMULATED_PERFORMANCES } from './fixtures'
import { __resetPrototypeBusyForTest } from './busy'

let host: HTMLDivElement
let root: Root
const fetchSpy = vi.fn()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  window.localStorage.clear()
  supabaseTouches.length = 0
  fetchSpy.mockClear()
  __resetPrototypeBusyForTest()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error('要素が見つかりません')
  await act(async () => { (el as HTMLElement).click() })
}
const byText = (text: string, selector = 'button') => [...document.querySelectorAll(selector)].find((b) => b.textContent?.trim() === text)

describe('お客様: 公演をリクエスト', () => {
  it('現行の表示部品を使う作品詳細から、選択作品を保持した入力モーダルを開閉する', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/prototype/performance-request?scenario=proto-scn-public']}><CustomerScenarioPage /><HistoryControls /></MemoryRouter>))
    expect(host.querySelector('[data-testid="scenario-detail-columns"]')).not.toBeNull()
    expect(host.textContent).toContain('あらすじ')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click(byText('公演をリクエストする'))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('#proto-request-title')?.value).toBe('星空のマリス')
    expect(host.querySelector('[data-testid="location"]')?.textContent).toContain('view=request')
    await click(byText('試験用に戻る'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector('[data-testid="location"]')?.textContent).toContain('scenario=proto-scn-public')
    await click(byText('試験用に進む'))
    expect(document.querySelector<HTMLInputElement>('#proto-request-title')?.value).toBe('星空のマリス')
    await click(document.querySelector('[aria-label="入力をやめる"]'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click(byText('公演をリクエストする'))
    expect(document.querySelector<HTMLInputElement>('#proto-request-title')?.value).toBe('星空のマリス')
    expect(readProtoState().requests).toHaveLength(0)
    expect(supabaseTouches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('モーダルの直接URL・再読込相当でも作品を保持し、閉じても詳細から離れない', async () => {
    const entry = '/prototype/performance-request?scenario=proto-scn-2&view=request'
    await act(async () => root.render(<MemoryRouter initialEntries={[entry]}><CustomerScenarioPage /><HistoryControls /></MemoryRouter>))
    expect(document.querySelector<HTMLInputElement>('#proto-request-title')?.value).toBe('【架空】時計塔の約束')
    await click(document.querySelector('[aria-label="入力をやめる"]'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/prototype/performance-request?scenario=proto-scn-2')
    await click(byText('公演をリクエストする'))
    await click(byText('やめる'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(readProtoState().requests).toHaveLength(0)
    expect(supabaseTouches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('貸切タブは開催希望モーダルと別で、試作から本番の申込へ進まない', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/prototype/performance-request?scenario=proto-scn-public']}><CustomerScenarioPage /><HistoryControls /></MemoryRouter>))
    await click(byText('貸切リクエストを作成'))
    expect(host.querySelector('[data-testid="location"]')?.textContent).toContain('tab=private')
    expect(host.textContent).toContain('オープン公演の開催希望とは別')
    await click(byText('貸切で遊ぶ'))
    expect(host.textContent).toContain('実予約・公演作成・通知は行いません')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(readProtoState().requests).toHaveLength(0)
    expect(supabaseTouches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('送信の前に注意文を正確に出し、送信はこのブラウザに保存するだけ（実 API を呼ばない）', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/prototype/performance-request']}><CustomerScenarioPage /></MemoryRouter>))
    expect(host.textContent).toContain('公演をリクエスト')
    expect(host.textContent).toContain('貸切リクエスト')
    await click(byText('公演をリクエストする'))
    const notice = document.querySelector('[data-testid="proto-request-notice"]')
    expect(notice?.querySelector('p')?.textContent).toBe(REQUEST_NOT_RESERVATION_NOTICE)
    // 作品名は自動で入り、変更できない
    const title = document.querySelector<HTMLInputElement>('#proto-request-title')!
    expect(title.disabled).toBe(true)
    expect(title.value).toBe('【架空】霧の館の晩餐会')

    // 店舗UI・通知チェックボックスはない。月を指定しない間だけ送れない。
    expect(document.querySelector('[data-testid="proto-request-form"]')?.textContent).not.toContain('希望店舗')
    expect(document.querySelector('[data-testid="proto-request-form"] input[type="checkbox"]')).toBeNull()
    await click(byText('リクエストを送る（このブラウザに保存）'))
    expect(readProtoState().requests).toHaveLength(0)

    await click(byText('2026年11月'))
    await click(document.querySelector('[aria-label="土曜日"]'))
    await click(byText('リクエストを送る（このブラウザに保存）'))

    const saved = readProtoState()
    expect(saved.requests).toHaveLength(1)
    expect(saved.requests[0]).toMatchObject({ scenarioId: 'proto-scn-1', storeIds: [], organizationId: 'proto-org', participants: 1, weekdays: [6], dates: [], period: { kind: 'months', months: ['2026-11'] } })
    expect(window.localStorage.getItem(PROTO_STORAGE_KEY)).toContain('proto-scn-1')
    expect(host.querySelector('[data-testid="proto-request-done"]')?.textContent).toContain('このブラウザの中だけ')
    expect(supabaseTouches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ベルで登録・解除でき、対象の範囲・解除の方法・予約ではないことを見せる', async () => {
    await act(async () => root.render(<MemoryRouter><CustomerScenarioPage /></MemoryRouter>))
    await click(byText('公演追加のお知らせを受け取る'))
    const panel = host.querySelector('[data-testid="proto-bell-panel"]')!
    expect(panel.textContent).toContain('架空の組織（試作）の公演だけ')
    expect(panel.textContent).toContain('予約の確定やお席の確保ではありません')
    expect(panel.textContent).toContain('同じベルをもう一度押すか、通知一覧')
    await click(byText('登録する'))
    expect(readProtoState().subscriptions).toHaveLength(1)
    await click(byText('お知らせ登録中（押すと解除）'))
    expect(readProtoState().subscriptions).toHaveLength(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('管理: スケジュールの開催リクエストのパネル', () => {
  it('参加希望人数として出し（予約人数と言わない）、日程未指定を残し、状態を切り替えられる', async () => {
    await act(async () => root.render(<MemoryRouter><AdminSchedulePage /></MemoryRouter>))
    const panel = host.querySelector('[data-testid="proto-request-panel"]')!
    expect(panel.textContent).toContain('参加希望人数')
    expect(panel.textContent).not.toContain('予約人数：')
    expect(panel.textContent).not.toMatch(/予約人数\s*\d/)
    expect(panel.querySelectorAll('[data-testid="proto-unscheduled"]').length).toBeGreaterThan(0)
    const groups = panel.querySelectorAll('[data-testid="proto-request-group"]')
    expect(groups.length).toBe(2) // 11 月: 霧の館・時計塔
    await click([...groups[0].querySelectorAll('button')].find((b) => b.textContent === '日程検討中'))
    expect(Object.values(readProtoState().statuses)).toEqual(['considering'])
    // 表の公演セルにリクエストを混ぜない（架空の公演 4 件だけ）
    expect(host.querySelector('[data-testid="proto-schedule-table"]')!.textContent).not.toContain('開催リクエスト')
  })

  it('公演を作成で、作品・店舗・候補の日付を引き継いだダイアログが開き、追加しても保存しない', async () => {
    await act(async () => root.render(<MemoryRouter><AdminSchedulePage /></MemoryRouter>))
    const group = host.querySelector('[data-testid="proto-request-group"]')!
    await click([...group.querySelectorAll('button')].find((b) => b.textContent?.includes('公演を作成')))
    const dialog = document.querySelector('[data-perf-modal]')!
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('【架空】霧の館の晩餐会')
    expect(dialog.querySelector('[data-testid="proto-dialog-source"]')?.textContent).toContain('参加希望人数は予約人数・残席に入りません')
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === '追加'))
    expect(document.querySelector('[data-testid="proto-dialog-save-message"]')?.textContent).toContain('試作のため保存しません')
    expect(supabaseTouches).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

function HistoryControls() {
  const navigate = useNavigate()
  return <><LocationProbe /><button onClick={() => navigate(-1)}>試験用に戻る</button><button onClick={() => navigate(1)}>試験用に進む</button></>
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}{location.search}</span>
}

describe('MMQ を開いたときのお知らせ（ポップアップ）', () => {
  it('入力中は待ち、入力の内容・URL・スクロールの位置・フォーカスを壊さずに後から出す。閉じても既読にしない', async () => {
    vi.useFakeTimers()
    writeProtoState(emptyProtoState())
    subscribe('proto-scn-1', [])
    simulatePublish(PROTO_SIMULATED_PERFORMANCES.notMatching)
    window.scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })

    await act(async () => root.render(
      <MemoryRouter initialEntries={['/prototype/performance-request?scenario=proto-scn-1#form']}>
        <input data-testid="typing" defaultValue="" />
        <LocationProbe />
        <PopupHost />
      </MemoryRouter>
    ))
    const input = host.querySelector<HTMLInputElement>('[data-testid="typing"]')!
    input.focus()
    input.value = '入力の途中のメモ'
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(host.querySelector('[data-testid="proto-popup"]')).toBeNull() // 入力中は出さない
    expect(input.value).toBe('入力の途中のメモ')

    input.value = ''
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    const popup = host.querySelector('[data-testid="proto-popup"]')
    expect(popup).not.toBeNull()
    expect(popup!.textContent).toContain('【架空】霧の館の晩餐会')
    expect(popup!.textContent).toContain('公演を見る')
    expect(document.activeElement).toBe(input) // フォーカスを奪わない
    expect(host.querySelector('[data-testid="location"]')!.textContent).toBe('/prototype/performance-request?scenario=proto-scn-1')
    expect(window.scrollY).toBe(640)
    expect(window.scrollTo).not.toHaveBeenCalled()

    await click(popup!.querySelector('[aria-label="閉じる"]'))
    expect(host.querySelector('[data-testid="proto-popup"]')).toBeNull()
    const [n] = readProtoState().notifications.filter((x) => x.userId === 'proto-user-1')
    expect(n.popupDismissedAt).not.toBeNull()
    expect(n.readAt).toBeNull() // 未読のまま一覧に残る
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('閉じた通知は次の訪問（開き直し）で繰り返し出さない', async () => {
    vi.useFakeTimers()
    writeProtoState(emptyProtoState())
    subscribe('proto-scn-1', [])
    simulatePublish(PROTO_SIMULATED_PERFORMANCES.notMatching)
    const state = readProtoState()
    writeProtoState({ ...state, notifications: state.notifications.map((n) => ({ ...n, popupShownAt: 'x', popupDismissedAt: 'x' })) })
    await act(async () => root.render(<MemoryRouter><PopupHost /></MemoryRouter>))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(host.querySelector('[data-testid="proto-popup"]')).toBeNull()
  })

  it('出さない設定のときは出さず、設定を戻せば次に開いたとき出す', async () => {
    vi.useFakeTimers()
    writeProtoState(emptyProtoState())
    subscribe('proto-scn-1', [])
    simulatePublish(PROTO_SIMULATED_PERFORMANCES.notMatching)
    writeProtoState({ ...readProtoState(), settings: { popupDisabled: true } })
    await act(async () => root.render(<MemoryRouter><PopupHost /></MemoryRouter>))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(host.querySelector('[data-testid="proto-popup"]')).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    writeProtoState({ ...readProtoState(), settings: { popupDisabled: false } })
    await act(async () => root.render(<MemoryRouter><PopupHost /></MemoryRouter>))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(host.querySelector('[data-testid="proto-popup"]')).not.toBeNull()
  })
})
