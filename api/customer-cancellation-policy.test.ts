import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AuthUser } from './_lib/auth.js'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: { rpc: mock.rpc } }))
import { assertCustomerSelfCancelAllowed } from './_lib/customerCancellation.js'
const customer: AuthUser = { userId: 'customer-user', orgId: '', role: 'customer', jwt: 'test' }
const reservation = () => ({
  organization_id: 'reservation-org', schedule_event_id: 'event-id', store_id: 'old-store',
  participant_count: 1, final_price: 4000,
  schedule_events: { date: '2030-01-10', start_time: '12:00', store_id: 'current-store', is_private_booking: false },
})
const frozen = () => ({ ...reservation(), cancellation_policy_snapshot_version: 1,
  cancellation_policy_store_id: 'old-store', cancellation_policy_performance_type: 'open',
  cancellation_policy_deadline_hours: 48, cancellation_policy_fees: [],
  cancellation_policy_fee_basis: 'participant_total', cancellation_policy_updated_at: '2029-12-01',
})
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z')); mock.rpc.mockResolvedValue({ data: { value: 48, source: 'performance' }, error: null }) })
afterEach(() => vi.useRealTimers())
it.each(['organization', 'store', 'scenario', 'performance'])('旧予約は%sの実効期限を採用し、公演から店舗・作品を解決する', async source => {
  mock.rpc.mockResolvedValue({ data: { value: 300, source }, error: null })
  expect(await assertCustomerSelfCancelAllowed(customer, reservation())).toMatchObject({ ok: false, status: 400 })
  expect(mock.rpc).toHaveBeenCalledWith('resolve_operating_setting', { p_organization_id: 'reservation-org', p_event_id: 'event-id', p_key: 'cancellation_deadline_hours', p_default: 48 })
})
it('旧予約の0を読取失敗とせず、既存の無料セルフ取消期限の意味を保持する', async () => {
  mock.rpc.mockResolvedValue({ data: { value: 0 }, error: null })
  expect(await assertCustomerSelfCancelAllowed(customer, reservation())).toEqual({ ok: true })
})
it('貸切は貸切期限キーで解決する', async () => {
  const r = { ...reservation(), private_group_id: 'group', reservation_source: 'web_private' }
  expect(await assertCustomerSelfCancelAllowed(customer, r)).toEqual({ ok: true })
  expect(mock.rpc.mock.calls[0][1]).toMatchObject({ p_key: 'private_cancellation_deadline_hours' })
})
it('保存済み規定は現在の厳しい設定へ差し替えず設定取得もしない', async () => {
  mock.rpc.mockResolvedValue({ data: { value: 9999 }, error: null })
  expect(await assertCustomerSelfCancelAllowed(customer, frozen())).toEqual({ ok: true })
  expect(mock.rpc).not.toHaveBeenCalled()
})
it('保存済み規定が不完全なら現在設定で補わない', async () => {
  expect(await assertCustomerSelfCancelAllowed(customer, { ...frozen(), cancellation_policy_fees: null })).toMatchObject({ ok: false, status: 400 })
  expect(mock.rpc).not.toHaveBeenCalled()
})
it.each([null, {}, { value: null }, { value: '48' }, { value: -1 }, { value: Number.NaN }])('実効期限が不正なら拒否する %j', async data => {
  mock.rpc.mockResolvedValue({ data, error: null })
  expect(await assertCustomerSelfCancelAllowed(customer, reservation())).toMatchObject({ ok: false, status: 503 })
})
it('組織・公演不整合などのRPCエラー時に既定値で許可しない', async () => {
  mock.rpc.mockResolvedValue({ data: { value: 48 }, error: { code: '42501' } })
  expect(await assertCustomerSelfCancelAllowed(customer, reservation())).toMatchObject({ ok: false, status: 503 })
})
it('通信例外も明示的に拒否する', async () => {
  mock.rpc.mockRejectedValue(new Error('network'))
  expect(await assertCustomerSelfCancelAllowed(customer, reservation())).toMatchObject({ ok: false, status: 503 })
})
it('組織不明の旧予約では設定を読まない', async () => {
  expect(await assertCustomerSelfCancelAllowed(customer, { ...reservation(), organization_id: null })).toMatchObject({ ok: false, status: 503 })
  expect(mock.rpc).not.toHaveBeenCalled()
})
it('スタッフの既存処理は顧客期限判定を通さない', async () => {
  expect(await assertCustomerSelfCancelAllowed({ ...customer, role: 'staff' }, {})).toEqual({ ok: true })
  expect(mock.rpc).not.toHaveBeenCalled()
})
