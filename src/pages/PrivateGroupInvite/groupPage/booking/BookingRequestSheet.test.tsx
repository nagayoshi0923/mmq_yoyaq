// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import type { PrivateGroup } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/api/privateGroupPageReadApi', () => ({ privateGroupPageReadApi: { findOwnCustomerPhone: async () => ({ data: { phone: '09012345678' } }) } }))
vi.mock('@/pages/ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => <div data-testid="notice">注意事項</div> }))
const range = vi.hoisted(() => ({ playerMin: 4, playerMax: 6 }))
vi.mock('../useGroupScenarioInfo', () => ({
  useGroupScenarioInfo: () => ({ data: { orgSlug: 'qw', stores: [], scenario: { ...range, hasPreReading: false, participationFee: 4500, participationCosts: [] } } }),
}))
const availability = {
  taka: { '2026-10-23|afternoon': { available: true, reason: null }, '2026-10-30|afternoon': { available: true, reason: null }, '2026-10-29|evening': { available: true, reason: null } },
  otsuka: { '2026-10-23|afternoon': { available: false, reason: '他の公演と重なります' }, '2026-10-30|afternoon': { available: false, reason: '他の公演と重なります' }, '2026-10-29|evening': { available: true, reason: null } },
}
const avail = vi.hoisted(() => ({ loading: false }))
vi.mock('./useStoreAvailability', () => ({ useStoreAvailability: () => ({ availability: avail.loading ? null : availability, loading: avail.loading }) }))
const submit = vi.fn()
vi.mock('../../submitBookingRequest', () => ({ submitGroupBookingRequest: (...a: unknown[]) => submit(...a) }))

import { BookingRequestSheet } from './BookingRequestSheet'

const member = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, group_id: 'g', user_id: `u-${id}`, guest_name: null, guest_email: null, guest_phone: null, is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-01', users: { id: `u-${id}`, email: `${id}@x`, nickname: name }, ...extra })
const cand = (id: string, date: string, slot: string, start: string, end: string, responses: Array<[string, 'ok' | 'maybe' | 'ng']>) => ({
  id, group_id: 'g', date, time_slot: slot, start_time: start, end_time: end, order_num: 1, created_at: '',
  responses: responses.map(([m, r]) => ({ id: `${id}-${m}`, group_id: 'g', member_id: m, candidate_date_id: id, response: r, created_at: '', updated_at: '' })),
})
const group = {
  id: 'g', organization_id: 'org', scenario_master_id: 'sc', status: 'gathering',
  members: [member('ichi', 'いちこ', { is_organizer: true }), member('jiro', '二郎'), member('sabu', '三郎'), member('shiro', '四郎')],
  candidate_dates: [
    cand('c30', '2026-10-30', '午後', '13:00:00', '18:00:00', [['ichi', 'ok'], ['jiro', 'ok'], ['sabu', 'maybe'], ['shiro', 'ok']]),
    cand('c29', '2026-10-29', '夜', '18:00:00', '23:00:00', [['ichi', 'maybe'], ['jiro', 'ng'], ['sabu', 'ok'], ['shiro', 'ok']]),
    cand('c23', '2026-10-23', '午後', '13:00:00', '18:00:00', [['ichi', 'ok'], ['jiro', 'ok'], ['sabu', 'ok'], ['shiro', 'ok']]),
  ],
} as unknown as PrivateGroup

beforeEach(() => { submit.mockReset(); avail.loading = false; range.playerMin = 4; range.playerMax = 6; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })

async function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onClose = vi.fn(), onSubmitted = vi.fn(), onCandidatesChanged = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <BookingRequestSheet
        group={group as never}
        myMemberId="ichi"
        user={{ id: 'u-ichi', email: 'i@x' }}
        scenarioTitle="告別詩"
        playerRange={{ min: 4, max: 6 }}
        preferredStores={[{ id: 'taka', name: '高田馬場店' }, { id: 'otsuka', name: '大塚店' }]}
        organizerMember={undefined}
        canMutateSchedule
        isCustomHoliday={() => false}
        onClose={onClose}
        onSubmitted={onSubmitted}
        onCandidatesChanged={onCandidatesChanged}
      />
    </QueryClientProvider>,
  ))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return { host, root, onClose, onSubmitted, onCandidatesChanged }
}
const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-testid="request-candidate"]')]
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click() }) }

it('見本どおり: 題名・作品と人数・紫の帯、初期値は全員○の日と○が最多の日（優先順に番号）', async () => {
  const { host, root } = await render()
  try {
    expect(host.textContent).toContain('店舗に申し込む')
    expect(host.querySelector('[data-testid="request-meta"]')!.textContent).toBe('告別詩 ・ 参加 4/6名')
    expect(host.textContent).toContain('送る候補日を選んでください（複数可）。店舗はこの中から 1 つを確定します。順番は上から優先です。')
    const r = rows(host)
    expect(r.map(x => [x.dataset.picked, x.dataset.rank ?? null])).toEqual([['true', '1'], ['true', '2'], ['false', null]])
    expect(r[0].textContent).toContain('10/23(金) 午後 13:00〜18:00')
    expect(r[0].textContent).toContain('全員参加できる')
    expect(r[1].textContent).toContain('三郎さんが△')
    expect(r[2].textContent).toContain('二郎さんが×')
    // 大塚店は選んだ日どれも空きなし
    const stores = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="request-store"]')]
    expect(stores.map(s => [s.textContent, s.disabled])).toEqual([['高田馬場店', false], ['大塚店（選んだ日はどれも空きなし）', true]])
    // 作品 4〜6 名: 選択肢のチップ、既定は最大。＋− と「当日来る」は出さない
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="request-participants"] [role="radio"]')]
    expect(chips.map(c => [c.textContent, c.getAttribute('aria-checked')])).toEqual([['4 名', 'false'], ['5 名', 'false'], ['6 名', 'true']])
    expect(host.textContent).toContain('料金は参加人数分です。当日の人数が変わる場合は店舗にご連絡ください。')
    expect(host.textContent).not.toContain('当日来る')
    expect(host.querySelector('[aria-label="1 人増やす"]')).toBeNull()
    expect(host.querySelector('[data-testid="request-price"]')!.textContent).toContain('¥4,500 × 6 名 = ¥27,000')
    expect(host.querySelector('[data-testid="request-next"]')!.textContent).toBe('注意事項を確認して申し込む（候補日 2 件）')
  } finally { await act(async () => root.unmount()) }
})

it('並べ替え・× の日の注記・人数を選ぶと料金も変わり、同意してから優先順のまま送る', async () => {
  const { host, root, onSubmitted } = await render()
  try {
    // 2 番目を上へ
    await click(host.querySelector('[aria-label="10/30(金) 午後 13:00〜18:00 の優先を上げる"]'))
    expect(rows(host).slice(0, 2).map(x => x.textContent?.includes('10/30'))).toEqual([true, false])
    // × の人がいる日を選ぶと注記。大塚店はこの日空いているので選べるようになる
    await click(rows(host)[2])
    expect(host.querySelector('[data-testid="request-ng-note"]')).not.toBeNull()
    await click([...host.querySelectorAll('[data-testid="request-participants"] [role="radio"]')].find(c => c.textContent === '5 名'))
    expect(host.querySelector('[data-testid="request-price"]')!.textContent).toContain('× 5 名')
    await click(host.querySelector('[data-testid="request-next"]'))
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('第 1 希望 10/30(金)')
    const send = host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!
    expect(send.disabled).toBe(true)
    await click(host.querySelector('#request-agree'))
    submit.mockResolvedValue(true)
    await click(send)
    expect(submit).toHaveBeenCalledTimes(1)
    const ctx = submit.mock.calls[0][0]
    expect(ctx.orderedCandidateIds).toEqual(['c30', 'c23', 'c29'])
    expect(ctx.requestedStores.map((s: { id: string }) => s.id)).toEqual(['taka', 'otsuka'])
    expect(ctx.participantCount).toBe(5)
    expect(ctx.bookingPhone).toBe('09012345678')
    expect(onSubmitted).toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})

it('作品の人数が固定なら選ばせず「参加人数 6 名（作品の定員）」の 1 行だけ、その人数で送る', async () => {
  range.playerMin = 6; range.playerMax = 6
  const { host, root } = await render()
  try {
    const line = host.querySelector('[data-testid="request-participants"]')!
    expect(line.textContent).toBe('参加人数 6 名（作品の定員）')
    expect(line.querySelector('[role="radio"]')).toBeNull()
    expect(host.textContent).toContain('3. 店舗への連絡')
    expect(host.querySelector('[data-testid="request-price"]')!.textContent).toContain('× 6 名')
    await click(host.querySelector('[data-testid="request-next"]'))
    await click(host.querySelector('#request-agree'))
    submit.mockResolvedValue(true)
    await click(host.querySelector('[data-testid="request-submit"]'))
    expect(submit.mock.calls[0][0].participantCount).toBe(6)
  } finally { await act(async () => root.unmount()) }
})

it('送る直前に DB の候補日の時刻が変わっていたら、送らずに内容の選択へ戻してグループを読み直す', async () => {
  const { host, root, onSubmitted, onCandidatesChanged } = await render()
  try {
    // 画面の時刻は DB の候補日の値のまま（所要時間から計算し直さない）
    expect(rows(host)[0].textContent).toContain('13:00〜18:00')
    await click(host.querySelector('[data-testid="request-next"]'))
    await click(host.querySelector('#request-agree'))
    submit.mockImplementation(async (ctx: { onCandidateTimesChanged?: () => void }) => { ctx.onCandidateTimesChanged?.(); return false })
    await click(host.querySelector('[data-testid="request-submit"]'))
    expect(submit.mock.calls[0][0]).not.toHaveProperty('isCustomHoliday')
    expect(onCandidatesChanged).toHaveBeenCalledTimes(1)
    expect(onSubmitted).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="request-confirm"]')).toBeNull()
    expect(host.querySelector('[data-testid="request-next"]')).not.toBeNull()
  } finally { await act(async () => root.unmount()) }
})

it('候補日を読み直しても、選んだ候補・優先順・人数・店舗への連絡・電話番号・同意は消えず、取り下げられた候補だけを理由付きで外す（2026-10-20）', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (g: unknown) => (
    <QueryClientProvider client={client}>
      <BookingRequestSheet
        group={g as never}
        myMemberId="ichi"
        user={{ id: 'u-ichi', email: 'i@x' }}
        scenarioTitle="告別詩"
        playerRange={{ min: 4, max: 6 }}
        preferredStores={[{ id: 'taka', name: '高田馬場店' }, { id: 'otsuka', name: '大塚店' }]}
        organizerMember={undefined}
        canMutateSchedule
        isCustomHoliday={() => false}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
        onCandidatesChanged={vi.fn()}
      />
    </QueryClientProvider>
  )
  try {
    await act(async () => root.render(view(group)))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    // 3 件とも選び、10/29 を先頭にする。人数 5 名・店舗への連絡を入れて、確認画面で同意する
    await click(rows(host)[2])
    await click(host.querySelector('[aria-label="10/29(木) 夜 18:00〜23:00 の優先を上げる"]'))
    await click(host.querySelector('[aria-label="10/29(木) 夜 18:00〜23:00 の優先を上げる"]'))
    await click([...host.querySelectorAll('[data-testid="request-participants"] [role="radio"]')].find(c => c.textContent === '5 名'))
    const notes = host.querySelector<HTMLTextAreaElement>('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(notes, '初めての方が 2 名います')
      notes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(host.querySelector('[data-testid="request-next"]'))
    await click(host.querySelector('#request-agree'))
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)

    // 読み直し: 10/30 は取り下げられ、10/23 は DB で 13:30〜18:30 に変わった
    const next = {
      ...group,
      candidate_dates: [
        (group.candidate_dates as unknown as Array<{ id: string }>)[1],
        { ...(group.candidate_dates as unknown as Array<Record<string, unknown>>)[2], start_time: '13:30:00', end_time: '18:30:00' },
      ],
    }
    // 候補日が変わると空き状況も読み直す（読み込み中を挟む）
    avail.loading = true
    await act(async () => root.render(view(next)))
    avail.loading = false
    await act(async () => root.render(view(next)))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    // 確認画面のまま、同意も消えない
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('初めての方が 2 名います')
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('5 名')
    // 内容の選択に戻ると、残った候補は優先順のまま・新しい時刻で選ばれ、外した候補は理由付きで知らせる
    await click(host.querySelector('[aria-label="内容の選択に戻る"]'))
    const picked = rows(host).filter(x => x.dataset.picked === 'true')
    expect(picked.map(x => [x.dataset.rank, x.textContent?.includes('10/29') ? '10/29' : x.textContent?.includes('10/23(金) 午後 13:30〜18:30') ? '10/23 13:30' : '?'])).toEqual([['1', '10/29'], ['2', '10/23 13:30']])
    expect(host.querySelector('[data-testid="request-removed-notice"]')!.textContent).toBe(
      '選べなくなった候補を外しました: 10/30(金) 午後 13:00〜18:00（候補日が取り下げられたか、店舗が見送りました）',
    )
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('初めての方が 2 名います')
    expect([...host.querySelectorAll('[data-testid="request-participants"] [role="radio"]')].find(c => c.getAttribute('aria-checked') === 'true')!.textContent).toBe('5 名')

    // 内容を見直したあとは同意し直す（従来どおり）
    submit.mockResolvedValue(false)
    await click(host.querySelector('[data-testid="request-next"]'))
    await click(host.querySelector('#request-agree'))
    await click(host.querySelector('[data-testid="request-submit"]'))
    expect(submit.mock.calls[0][0].orderedCandidateIds).toEqual(['c29', 'c23'])
    expect(submit.mock.calls[0][0].bookingPhone).toBe('09012345678')
  } finally { await act(async () => root.unmount()) }
})
