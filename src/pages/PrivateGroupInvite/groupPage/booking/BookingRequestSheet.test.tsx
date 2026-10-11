// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import type { PrivateGroup } from '@/types'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/api/privateGroupPageReadApi', () => ({ privateGroupPageReadApi: { findOwnCustomerPhone: async () => ({ data: { phone: '09012345678' } }) } }))
vi.mock('@/pages/ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => <div data-testid="notice">注意事項</div> }))
vi.mock('../useGroupScenarioInfo', () => ({
  useGroupScenarioInfo: () => ({ data: { orgSlug: 'qw', stores: [], scenario: { playerMin: 4, playerMax: 6, hasPreReading: false, participationFee: 4500, participationCosts: [] } } }),
}))
const availability = {
  taka: { '2026-10-23|afternoon': { available: true, reason: null }, '2026-10-30|afternoon': { available: true, reason: null }, '2026-10-29|evening': { available: true, reason: null } },
  otsuka: { '2026-10-23|afternoon': { available: false, reason: '他の公演と重なります' }, '2026-10-30|afternoon': { available: false, reason: '他の公演と重なります' }, '2026-10-29|evening': { available: true, reason: null } },
}
vi.mock('./useStoreAvailability', () => ({ useStoreAvailability: () => ({ availability, loading: false }) }))
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

beforeEach(() => { submit.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })

async function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onClose = vi.fn(), onSubmitted = vi.fn()
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
      />
    </QueryClientProvider>,
  ))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return { host, root, onClose, onSubmitted }
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
    expect(host.querySelector('[data-testid="request-participants"]')!.textContent).toBe('4 名')
    expect(host.querySelector('[data-testid="request-price"]')!.textContent).toContain('¥4,500 × 4 名 = ¥18,000')
    expect(host.querySelector('[data-testid="request-next"]')!.textContent).toBe('注意事項を確認して申し込む（候補日 2 件）')
  } finally { await act(async () => root.unmount()) }
})

it('並べ替え・× の日の注記・人数を増やすと「当日来る」、同意してから優先順のまま送る', async () => {
  const { host, root, onSubmitted } = await render()
  try {
    // 2 番目を上へ
    await click(host.querySelector('[aria-label="10/30(金) 午後 13:00〜18:00 の優先を上げる"]'))
    expect(rows(host).slice(0, 2).map(x => x.textContent?.includes('10/30'))).toEqual([true, false])
    // × の人がいる日を選ぶと注記。大塚店はこの日空いているので選べるようになる
    await click(rows(host)[2])
    expect(host.querySelector('[data-testid="request-ng-note"]')).not.toBeNull()
    await click(host.querySelector('[aria-label="1 人増やす"]'))
    expect(host.textContent).toContain('登録メンバー 4 名＋当日来る 1 名')
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
