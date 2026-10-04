/**
 * 認証処理（src/contexts/auth）の読み書き（整備 4）が発行するクエリを固定する。
 * 移す前の呼び出しと同じテーブル・列・絞り込み・並び順・書き込み内容であることを確かめる。
 */
import { beforeEach, expect, it, vi } from 'vitest'
import { renderCalls, type RecordedCall } from './testing/chainRecorder'

const rec = vi.hoisted(() => ({ calls: [] as Array<[string, unknown[]]> }))
vi.mock('@/lib/supabase', async () => {
  const { makeSupabaseRecorder } = await import('./testing/chainRecorder')
  return { supabase: makeSupabaseRecorder(rec.calls as RecordedCall[]) }
})
import { authSessionApi } from './authSessionApi'

beforeEach(() => { rec.calls.length = 0 })

it('認証処理のクエリは移す前と同じ', async () => {
  const out: Record<string, unknown> = {}
  const args: Record<string, unknown[]> = {
    insertUser: [{ id: 'u', email: 'e', role: 'customer', created_at: 't1', updated_at: 't2' }],
    insertAuthLog: [{ user_id: 'u', event_type: 'login', ip_address: null, user_agent: null, success: true, metadata: {} }],
  }
  for (const [name, fn] of Object.entries(authSessionApi)) {
    rec.calls.length = 0
    await (fn as (...a: unknown[]) => unknown)(...(args[name] ?? Array.from({ length: fn.length }, (_, i) => `a${i + 1}`)))
    out[name] = renderCalls(rec.calls.splice(0) as RecordedCall[])
  }
  expect(out).toMatchSnapshot()
})
