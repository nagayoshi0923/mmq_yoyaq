import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const state={error:null as Error|null}
  const make = () => {
    const q: Record<string, unknown> = {}
    for (const name of ['eq', 'in', 'or', 'select', 'single']) q[name] = (...a: unknown[]) => { calls.push([name, a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: state.error }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      upsert: (...a: unknown[]) => { calls.push(['upsert', a]); return make() },
      delete: () => { calls.push(['delete', []]); return make() },
    }
  })
  return { calls, from, state }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
import {
  scenarioMasterWriteApi, scenarioCharacterApi, scenarioMasterCorrectionApi, organizationScenarioWriteApi,
  scenarioLikeApi, scenarioRatingApi, orgMasterListApi,
} from './scenarioWriteApi'

beforeEach(() => { m.calls.length = 0; m.state.error=null })

it('マスタ: 作成は1件返し、更新は id か id の一覧で絞る', async () => {
  await scenarioMasterWriteApi.createReturning({ title: 'A' })
  expect(m.calls).toEqual([['from', ['scenario_masters']], ['insert', [{ title: 'A' }]], ['select', []], ['single', []]])
  m.calls.length = 0
  await scenarioMasterWriteApi.updateById('m1', { master_status: 'approved' })
  expect(m.calls).toEqual([['from', ['scenario_masters']], ['update', [{ master_status: 'approved' }]], ['eq', ['id', 'm1']]])
  m.calls.length = 0
  await scenarioMasterWriteApi.updateByIds(['m1', 'm2'], { author_email: 'a@example.com' })
  expect(m.calls).toEqual([['from', ['scenario_masters']], ['update', [{ author_email: 'a@example.com' }]], ['in', ['id', ['m1', 'm2']]]])
})

it('キャラクターと修正リクエスト: 追加・更新・削除は元のまま（id で絞る）', async () => {
  await scenarioCharacterApi.insert({ name: 'x', scenario_master_id: 'm1' })
  await scenarioCharacterApi.updateById('c1', { name: 'y' })
  await scenarioCharacterApi.deleteById('c2')
  await scenarioMasterCorrectionApi.updateById('r1', { status: 'rejected' })
  expect(m.calls).toEqual([
    ['from', ['scenario_characters']], ['insert', [{ name: 'x', scenario_master_id: 'm1' }]],
    ['from', ['scenario_characters']], ['update', [{ name: 'y' }]], ['eq', ['id', 'c1']],
    ['from', ['scenario_characters']], ['delete', []], ['eq', ['id', 'c2']],
    ['from', ['scenario_master_corrections']], ['update', [{ status: 'rejected' }]], ['eq', ['id', 'r1']],
  ])
})

it('組織のシナリオ: 追加・id と組織で絞る更新・id だけの更新・作者名の書き換え', async () => {
  await organizationScenarioWriteApi.insert({ a: 1 })
  await organizationScenarioWriteApi.insertReturningId({ a: 2 })
  await organizationScenarioWriteApi.updateByIdInOrganization('s1', 'o1', { b: 1 })
  await organizationScenarioWriteApi.updateById('s2', { override_genre: ['x'] })
  await organizationScenarioWriteApi.replaceAuthorOverride('o1', '旧', '新')
  await organizationScenarioWriteApi.replaceAuthorOverride('o1', '旧', null)
  expect(m.calls).toEqual([
    ['from', ['organization_scenarios']], ['insert', [{ a: 1 }]],
    ['from', ['organization_scenarios']], ['insert', [{ a: 2 }]], ['select', ['id']], ['single', []],
    ['from', ['organization_scenarios']], ['update', [{ b: 1 }]], ['eq', ['id', 's1']], ['eq', ['organization_id', 'o1']],
    ['from', ['organization_scenarios']], ['update', [{ override_genre: ['x'] }]], ['eq', ['id', 's2']],
    ['from', ['organization_scenarios']], ['update', [{ override_author: '新' }]], ['eq', ['organization_id', 'o1']], ['eq', ['override_author', '旧']],
    ['from', ['organization_scenarios']], ['update', [{ override_author: null }]], ['eq', ['organization_id', 'o1']], ['eq', ['override_author', '旧']],
  ])
})

it('お気に入りと評価: 外すときの絞り込み（or 条件の文字列を含む）と upsert のキー', async () => {
  await scenarioLikeApi.removeByCustomerAndScenario('c1', 'sc1')
  await scenarioLikeApi.add({ customer_id: 'c1' })
  await scenarioLikeApi.removeById('l1')
  await scenarioRatingApi.remove('c1', 'sc1')
  await scenarioRatingApi.upsert({ customer_id: 'c1', rating: 5 })
  expect(m.calls).toEqual([
    ['from', ['scenario_likes']], ['delete', []], ['eq', ['customer_id', 'c1']], ['or', ['scenario_master_id.eq.sc1,scenario_id.eq.sc1']],
    ['from', ['scenario_likes']], ['insert', [{ customer_id: 'c1' }]],
    ['from', ['scenario_likes']], ['delete', []], ['eq', ['id', 'l1']],
    ['from', ['scenario_ratings']], ['delete', []], ['eq', ['customer_id', 'c1']], ['eq', ['scenario_master_id', 'sc1']],
    ['from', ['scenario_ratings']], ['upsert', [{ customer_id: 'c1', rating: 5 }, { onConflict: 'customer_id,scenario_master_id' }]],
  ])
})

it('作者・カテゴリの一覧管理は、渡した表に対して追加・更新・削除する', async () => {
  await orgMasterListApi.insertItem('organization_authors', { name: 'a' })
  await orgMasterListApi.updateItemById('organization_categories', 'i1', { sort_order: 2 })
  await orgMasterListApi.deleteItemById('organization_authors', 'i2')
  expect(m.calls).toEqual([
    ['from', ['organization_authors']], ['insert', [{ name: 'a' }]],
    ['from', ['organization_categories']], ['update', [{ sort_order: 2 }]], ['eq', ['id', 'i1']],
    ['from', ['organization_authors']], ['delete', []], ['eq', ['id', 'i2']],
  ])
})

it('評価解除は全本人IDの指定作品だけを削除し失敗を伝播する',async()=>{
 await scenarioRatingApi.removeForCustomers(['global','legacy','legacy'],'S')
 expect(m.calls).toContainEqual(['in',['customer_id',['global','legacy']]])
 expect(m.calls).toContainEqual(['eq',['scenario_master_id','S']])
 m.state.error=Error('policy denied')
 await expect(scenarioRatingApi.removeForCustomers(['global','legacy'],'S')).rejects.toThrow('policy denied')
})
