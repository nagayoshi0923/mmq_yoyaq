import { afterEach, describe, expect, it, vi } from 'vitest'
import { recruitmentPostText, sendRecruitmentXPosts } from '../../supabase/functions/_shared/recruitment-x'
const snapshot = { scenario: '確認用公演', date: '2030-01-01', start_time: '18:00:00', store_name: '本店', deadline: '2030-01-01T07:30:00Z', missing_participants: 2, was_confirmed: false, site_url: 'https://example.invalid/booking' }
function database() {
 const patches: Record<string, unknown>[] = []
 const db = {
  rpc: async () => ({ data: [{ id: 'job', organization_id: 'org', schedule_event_id: 'event', cycle: 1, kind: 'extension', attempts: 1, snapshot }], error: null }),
  from: () => {
   const chain = {
    select: () => chain, eq: () => chain,
    single: async () => ({ data: { status: 'active', cycle: 1, deadline: snapshot.deadline }, error: null }),
    update: (patch: Record<string, unknown>) => { patches.push(patch); return chain },
    then: (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
   }
   return chain
  },
 }
 return { db: db as unknown as Parameters<typeof sendRecruitmentXPosts>[0], patches }
}
afterEach(() => vi.unstubAllGlobals())
describe('追加募集のX告知', () => {
 it('開催日時・不足人数・締切・予約先を案内する', () => {
  const text = recruitmentPostText(snapshot, 'extension')
  expect(text).toContain('あと2人'); expect(text).toContain('16:30'); expect(text).toContain(snapshot.site_url)
  expect(recruitmentPostText(snapshot, 'cancelled')).toContain('公演中止')
 })
 it('接続先が承認済みアカウント以外なら投稿しない', async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'fixture-key' } })
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { username: 'another_account' } })))
  vi.stubGlobal('fetch', fetch)
  const { db, patches } = database(); await sendRecruitmentXPosts(db, 'org', ['fixture-key', 'fixture-key', 'fixture-key', 'fixture-key'])
  expect(fetch).toHaveBeenCalledTimes(1); expect(patches.at(-1)?.status).toBe('failed')
 })
 it('投稿後の通信結果が不明なら再投稿待ちに戻さない', async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'fixture-key' } })
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { username: 'queens_waltz' } }))).mockRejectedValueOnce(new Error('timeout'))
  vi.stubGlobal('fetch', fetch)
  const { db, patches } = database(); await sendRecruitmentXPosts(db, 'org', ['fixture-key', 'fixture-key', 'fixture-key', 'fixture-key'])
  expect(fetch).toHaveBeenCalledTimes(2); expect(patches.at(-1)?.status).toBe('uncertain')
 })
})
