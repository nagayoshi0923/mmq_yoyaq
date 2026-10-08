import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'in', 'gt', 'select', 'single']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      delete: () => { calls.push(['delete', []]); return make() },
    }
  })
  const rpc = vi.fn(async (name: string) => { calls.push(['rpc', [name]]); return { data: true, error: null } })
  return { calls, from, rpc }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from, rpc: m.rpc } }))
import { globalSettingsApi, storeNotificationSettingsApi, userNotificationApi, waitlistApi, kitLocationWriteApi } from './globalSettingsApi'

beforeEach(() => { m.calls.length = 0 })
const arg = (name: string) => m.calls.filter(c => c[0] === name).map(c => c[1])

describe('全体設定', () => {
  it('id で絞る更新と、組織で絞る更新は絞り込みが別（元の呼び出しを保つ）', async () => {
    await globalSettingsApi.updateById('g1', { system_name: 'x' })
    expect(m.calls.slice(0, 2)).toEqual([['from', ['global_settings']], ['update', [{ system_name: 'x' }]]]); expect(arg('eq')).toEqual([['id', 'g1']])
    m.calls.length = 0
    await globalSettingsApi.updateByOrganization('o1', { kit_transfer_offsets: {} })
    expect(arg('eq')).toEqual([['organization_id', 'o1']])
  })
})
describe('店舗別の通知設定・ユーザー通知・キャンセル待ち', () => {
  it('更新は id で絞り、作成は1件返す', async () => {
    await storeNotificationSettingsApi.update('n1', { a: 1 })
    expect(m.calls[0]).toEqual(['from', ['notification_settings']]); expect(arg('eq')).toEqual([['id', 'n1']])
    m.calls.length = 0
    await storeNotificationSettingsApi.create({ store_id: 's1' })
    expect(arg('insert')[0]).toEqual([{ store_id: 's1' }]); expect(arg('select')).toHaveLength(1); expect(arg('single')).toHaveLength(1)
  })
  it('既読にするときは is_read と read_at を付ける', async () => {
    await userNotificationApi.markRead('x1')
    const [v] = arg('update')[0] as [Record<string, unknown>]; expect(v.is_read).toBe(true); expect(typeof v.read_at).toBe('string'); expect(arg('eq')).toEqual([['id', 'x1']])
    m.calls.length = 0
    await userNotificationApi.markManyRead(['x1', 'x2'])
    expect(arg('in')).toEqual([['id', ['x1', 'x2']]])
  })
  it('プロフィール登録の知らせは DB の関数に任せる（引数なし。1 回に限るのは DB 側）', async () => {
    await userNotificationApi.ensureProfileNotice()
    expect(m.calls).toEqual([['rpc', ['ensure_profile_incomplete_notice']]])
  })
  it('キャンセル待ちは waitlist に1件登録する', async () => {
    await waitlistApi.create({ status: 'waiting' })
    expect(m.calls.slice(0, 2)).toEqual([['from', ['waitlist']], ['insert', [{ status: 'waiting' }]]])
  })
})
describe('キット位置の削除', () => {
  it('組織・シナリオ（org_scenario_id か scenario_id）・保持数より大きい番号で絞る', async () => {
    await kitLocationWriteApi.deleteAboveCount('o1', 'org_scenario_id', 's1', 3)
    expect(m.calls[0]).toEqual(['from', ['scenario_kit_locations']]); expect(arg('eq')).toEqual([['organization_id', 'o1'], ['org_scenario_id', 's1']]); expect(arg('gt')).toEqual([['kit_number', 3]])
    m.calls.length = 0
    await kitLocationWriteApi.deleteAboveCount('o1', 'scenario_id', 's1', 3)
    expect(arg('eq')).toEqual([['organization_id', 'o1'], ['scenario_id', 's1']])
  })
})
