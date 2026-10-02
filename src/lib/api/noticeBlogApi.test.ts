import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    q.eq = (...a: unknown[]) => { calls.push(['eq', a]); return q }
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
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
import { bookingNoticeApi, blogPostApi } from './noticeBlogApi'

beforeEach(() => { m.calls.length = 0 })

it.each([
  ['booking_notices', bookingNoticeApi],
  ['blog_posts', blogPostApi],
] as const)('%s: 更新・削除は id で絞り、追加は行をそのまま渡す（元の呼び出しと同じ）', async (table, api) => {
  await api.updateById('x1', { is_active: false })
  expect(m.calls).toEqual([['from', [table]], ['update', [{ is_active: false }]], ['eq', ['id', 'x1']]])
  m.calls.length = 0
  await api.insert({ content: 'a' })
  expect(m.calls).toEqual([['from', [table]], ['insert', [{ content: 'a' }]]])
  m.calls.length = 0
  await api.deleteById('x2')
  expect(m.calls).toEqual([['from', [table]], ['delete', []], ['eq', ['id', 'x2']]])
})
