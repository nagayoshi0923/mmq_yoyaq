// @vitest-environment jsdom
/**
 * 申込シートを開いたまま、グループの読み直しが失敗したとき（Codex 点検 不具合 3）。
 * 実際の usePrivateGroupSnapshot と画面の入口の切り替え（inviteGateScreen）を通す。
 * 一時的な通信失敗では入力を残し、権限が無い・グループが無いときだけ「見つかりません」に切り替える。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import type { PrivateGroup } from '@/types'
import type { PrivateGroupSnapshot } from '@/lib/privateGroupRead'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn(), dismiss: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-ichi' } }) }))
const read = vi.hoisted(() => vi.fn())
vi.mock('@/lib/privateGroupRead', async importOriginal => ({ ...(await importOriginal<object>()), readPrivateGroup: read }))
vi.mock('@/lib/api/privateGroupPageReadApi', () => ({ privateGroupPageReadApi: { findOwnCustomerPhone: async () => ({ data: { phone: '09012345678' } }) } }))
vi.mock('@/pages/ScenarioDetailPage/components/BookingNotice', () => ({ BookingNotice: () => <div data-testid="notice">注意事項</div> }))
vi.mock('../useGroupScenarioInfo', () => ({
  useGroupScenarioInfo: () => ({ data: { orgSlug: 'qw', stores: [], scenario: { playerMin: 4, playerMax: 6, hasPreReading: false, participationFee: 4500, participationCosts: [] } } }),
}))
const availability = {
  taka: { '2026-10-23|afternoon': { available: true, reason: null }, '2026-10-30|afternoon': { available: true, reason: null }, '2026-10-29|evening': { available: true, reason: null } },
}
vi.mock('./useStoreAvailability', () => ({ useStoreAvailability: () => ({ availability, loading: false }) }))
vi.mock('../../submitBookingRequest', () => ({ submitGroupBookingRequest: vi.fn() }))

import { usePrivateGroupSnapshot } from '@/hooks/usePrivateGroupSnapshot'
import { inviteGateScreen } from '../../inviteScreenGate'
import { BookingRequestSheet } from './BookingRequestSheet'

const member = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, group_id: 'g', user_id: `u-${id}`, guest_name: null, guest_email: null, guest_phone: null, is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-01', users: { id: `u-${id}`, email: `${id}@x`, nickname: name }, ...extra })
const cand = (id: string, date: string, slot: string, start: string, end: string) => ({
  id, group_id: 'g', date, time_slot: slot, start_time: start, end_time: end, order_num: 1, created_at: '',
  responses: ['ichi', 'jiro', 'sabu', 'shiro'].map(m => ({ id: `${id}-${m}`, group_id: 'g', member_id: m, candidate_date_id: id, response: 'ok', created_at: '', updated_at: '' })),
})
const group = {
  id: 'g', organization_id: 'org', scenario_master_id: 'sc', status: 'gathering',
  members: [member('ichi', 'いちこ', { is_organizer: true }), member('jiro', '二郎'), member('sabu', '三郎'), member('shiro', '四郎')],
  candidate_dates: [cand('c30', '2026-10-30', '午後', '13:00:00', '18:00:00'), cand('c29', '2026-10-29', '夜', '18:00:00', '23:00:00'), cand('c23', '2026-10-23', '午後', '13:00:00', '18:00:00')],
} as unknown as PrivateGroup
const snapshot = { group, access_level: 'organizer', current_member_id: 'ichi', linked_reservation_status: null, confirmed_by_name: null } as unknown as PrivateGroupSnapshot

let hook: ReturnType<typeof usePrivateGroupSnapshot>
function Page() {
  hook = usePrivateGroupSnapshot(null, 'invite-g', 'ichi')
  const gate = inviteGateScreen({ loading: hook.loading, error: hook.error, hasGroup: Boolean(hook.group) })
  if (gate === 'loading') return <p>読み込み中</p>
  if (gate === 'not-found' || !hook.group) return <p data-testid="not-found">招待が見つかりません</p>
  return (
    <>
      {hook.reconnecting && <p data-testid="reconnecting">接続を確認しています</p>}
      <BookingRequestSheet
        group={hook.group as never}
        myMemberId="ichi"
        user={{ id: 'u-ichi', email: 'i@x' }}
        scenarioTitle="告別詩"
        playerRange={{ min: 4, max: 6 }}
        preferredStores={[{ id: 'taka', name: '高田馬場店' }]}
        organizerMember={undefined}
        canMutateSchedule
        isCustomHoliday={() => false}
        onClose={vi.fn()}
        onSubmitted={vi.fn()}
        onCandidatesChanged={vi.fn()}
      />
    </>
  )
}

beforeEach(() => { read.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click() }) }
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-testid="request-candidate"]')]

/** シートを開き、候補 3 件・人数 5 名・店舗への連絡・同意まで入れる */
async function openAndFill() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(<QueryClientProvider client={client}><Page /></QueryClientProvider>))
  await flush(); await flush()
  for (const row of rows(host)) if (row.dataset.picked !== 'true') await click(row)
  await click([...host.querySelectorAll('[data-testid="request-participants"] [role="radio"]')].find(c => c.textContent === '5 名'))
  const notes = host.querySelector<HTMLTextAreaElement>('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(notes, '初めての方が 2 名います')
    notes.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(host.querySelector('[data-testid="request-next"]'))
  await click(host.querySelector('#request-agree'))
  expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
  return { host, root }
}
const networkError = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '', status: 0 }

it('定期取得が 1 回だけ通信失敗しても、シートは閉じず候補・人数・店舗への連絡・同意が残り、次に読めたら知らせを消す', async () => {
  read.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(networkError).mockResolvedValueOnce(snapshot)
  const { host, root } = await openAndFill()
  try {
    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="not-found"]')).toBeNull()
    expect(host.querySelector('[data-testid="reconnecting"]')).not.toBeNull()
    expect(hook.error).toBe(null)
    // 確認画面のまま、同意も入力も残る
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('初めての方が 2 名います')
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('5 名')

    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="reconnecting"]')).toBeNull()
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
    await click(host.querySelector('[aria-label="内容の選択に戻る"]'))
    expect(rows(host).filter(x => x.dataset.picked === 'true')).toHaveLength(3)
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('初めての方が 2 名います')
    expect([...host.querySelectorAll('[data-testid="request-participants"] [role="radio"]')].find(c => c.getAttribute('aria-checked') === 'true')!.textContent).toBe('5 名')
  } finally { await act(async () => root.unmount()) }
})

it('5xx・時間切れも一時的な失敗として扱い、画面を切り替えない', async () => {
  read.mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce({ message: 'Bad Gateway', code: '', status: 502 })
    .mockRejectedValueOnce({ message: 'canceling statement due to statement timeout', code: '57014', status: 500 })
  const { host, root } = await openAndFill()
  try {
    await act(async () => { await hook.refetch(true) })
    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="not-found"]')).toBeNull()
    expect(host.querySelector('[data-testid="reconnecting"]')).not.toBeNull()
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
  } finally { await act(async () => root.unmount()) }
})

it.each([
  ['参加の権限が無くなった（42501 / 403）', { message: 'グループを閲覧できません', code: '42501', status: 403 }],
  ['ログインが切れた（401）', { message: 'JWT expired', code: 'PGRST301', status: 401 }],
  ['閲覧の権限が無い（コード無しの 403）', { message: 'Forbidden', code: '', status: 403 }],
  ['RPC が明示的に「見つからない」を返した（P0002 / 404）', { message: 'グループが見つかりません', code: 'P0002', status: 404 }],
  ['グループが無い（中身が空）', Object.assign(new Error('グループを取得できませんでした'), { code: 'PRIVATE_GROUP_NOT_FOUND' })],
])('%s ときは「見つかりません」に切り替える', async (_label, failure) => {
  read.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(failure)
  const { host, root } = await openAndFill()
  try {
    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="not-found"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="request-confirm"]')).toBeNull()
    expect(hook.reconnecting).toBe(false)
  } finally { await act(async () => root.unmount()) }
})

// Codex 第2回再レビュー R4: 404 は「RPC がスキーマキャッシュに無い」（PGRST202）など API 構成の一時的なずれでも返る。
// 不存在・権限喪失の証拠が無い 404 では入力を消さず、次に読めたら元に戻る。
it.each([
  ['RPC がスキーマキャッシュに無い（PGRST202 / 404）', { message: 'Could not find the function public.private_group_read_snapshot in the schema cache', code: 'PGRST202', status: 404 }],
  ['関数が無い（42883 / 404）', { message: 'function does not exist', code: '42883', status: 404 }],
  ['コードの無い 404', { message: 'Not Found', code: '', status: 404 }],
])('%s では入力を残して読み直し、次に読めたら知らせを消す', async (_label, failure) => {
  read.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(failure).mockResolvedValueOnce(snapshot)
  const { host, root } = await openAndFill()
  try {
    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="not-found"]')).toBeNull()
    expect(host.querySelector('[data-testid="reconnecting"]')).not.toBeNull()
    expect(hook.error).toBe(null)
    expect(host.querySelector<HTMLButtonElement>('[data-testid="request-submit"]')!.disabled).toBe(false)
    expect(host.querySelector('[data-testid="request-confirm"]')!.textContent).toContain('初めての方が 2 名います')

    await act(async () => { await hook.refetch(true) })
    expect(host.querySelector('[data-testid="reconnecting"]')).toBeNull()
    await click(host.querySelector('[aria-label="内容の選択に戻る"]'))
    expect(rows(host).filter(x => x.dataset.picked === 'true')).toHaveLength(3)
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('初めての方が 2 名います')
  } finally { await act(async () => root.unmount()) }
})
