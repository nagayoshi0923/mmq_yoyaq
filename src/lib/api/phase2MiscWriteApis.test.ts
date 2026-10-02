import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'select', 'single']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      upsert: (...a: unknown[]) => { calls.push(['upsert', a]); return make() },
    }
  })
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: {}, ApiClientError: class extends Error {} }))
import { dataManagementSettingsApi } from './globalSettingsApi'
import { insertExternalReports } from './externalReportsApi'
import { profileRegistrationApi } from './customerApi'
import { tablePreferenceApi } from './userPreferencesApi'
import { orgMasterApi } from './orgMasterApi'

beforeEach(() => { m.calls.length = 0; vi.useRealTimers() })

it('データ出力設定: 更新は id で絞り、作成は1件返す', async () => {
  await dataManagementSettingsApi.updateById('d1', { export_format: 'csv' })
  expect(m.calls).toEqual([['from', ['data_management_settings']], ['update', [{ export_format: 'csv' }]], ['eq', ['id', 'd1']]])
  m.calls.length = 0
  await dataManagementSettingsApi.create({ store_id: 's1' })
  expect(m.calls.map(c => c[0])).toEqual(['from', 'insert', 'select', 'single'])
})

it('報告フォームは行の配列をそのまま external_performance_reports に追加する', async () => {
  await insertExternalReports([{ a: 1 }, { a: 2 }])
  expect(m.calls).toEqual([['from', ['external_performance_reports']], ['insert', [[{ a: 1 }, { a: 2 }]]]])
})

it('users の upsert は id の競合で更新する', async () => {
  await profileRegistrationApi.upsertUserRow({ id: 'u1', role: 'customer' })
  expect(m.calls).toEqual([['from', ['users']], ['upsert', [{ id: 'u1', role: 'customer' }, { onConflict: 'id' }]]])
})

it('表の列設定は利用者×表キーで upsert し、updated_at を付ける', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T00:00:00Z'))
  await tablePreferenceApi.save('u1', 'staff-table', ['a', 'b'], { a: true })
  expect(m.calls).toEqual([['from', ['user_table_preferences']], ['upsert', [
    { user_id: 'u1', table_key: 'staff-table', column_order: ['a', 'b'], column_visibility: { a: true }, updated_at: '2026-10-03T00:00:00.000Z' },
    { onConflict: 'user_id,table_key' },
  ]]])
})

it('作者・カテゴリの候補は組織×名前の競合で upsert し、並び順は 9999', async () => {
  await orgMasterApi.ensureAuthor('o1', '作者A')
  await orgMasterApi.ensureCategory('o1', 'カテゴリA')
  expect(m.calls).toEqual([
    ['from', ['organization_authors']], ['upsert', [{ organization_id: 'o1', name: '作者A', sort_order: 9999 }, { onConflict: 'organization_id,name' }]],
    ['from', ['organization_categories']], ['upsert', [{ organization_id: 'o1', name: 'カテゴリA', sort_order: 9999 }, { onConflict: 'organization_id,name' }]],
  ])
})
