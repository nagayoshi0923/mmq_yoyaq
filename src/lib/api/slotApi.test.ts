import { beforeEach, describe, expect, it, vi } from 'vitest'

// supabase のチェーンを記録するモック（from → 操作 → 条件）
const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    q.eq = (...a: unknown[]) => { calls.push(['eq', a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      upsert: (...a: unknown[]) => { calls.push(['upsert', a]); return make() },
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      delete: () => { calls.push(['delete', []]); return make() },
    }
  })
  const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }))
  return { calls, from, getUser }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from, auth: { getUser: m.getUser } } }))
import { slotMemoApi, blockedSlotApi } from './slotApi'

beforeEach(() => { m.calls.length = 0 })
const ops = () => m.calls.map(([k, a]) => `${k}:${JSON.stringify(a)}`)

describe('slotMemoApi', () => {
  it('保存は同じスロットを上書き（組織・日付・店舗・時間帯が一意）', async () => {
    await slotMemoApi.save({ organization_id: 'o', date: '2026-10-03', store_id: 's', time_slot: 'evening', memo: 'メモ' })
    expect(m.calls[0]).toEqual(['from', ['schedule_slot_memos']])
    const [row, opts] = m.calls[1][1] as [Record<string, unknown>, unknown]
    expect(row).toMatchObject({ organization_id: 'o', date: '2026-10-03', store_id: 's', time_slot: 'evening', memo: 'メモ' })
    expect(typeof row.updated_at).toBe('string')
    expect(opts).toEqual({ onConflict: 'organization_id,date,store_id,time_slot' })
  })
  it('移行は既にある行を上書きしない', async () => {
    await slotMemoApi.importMany([])
    expect(m.calls[1][1][1]).toEqual({ onConflict: 'organization_id,date,store_id,time_slot', ignoreDuplicates: true })
  })
  it('空メモの削除は組織・日付・店舗・時間帯で絞る。組織指定なしの削除は日付・店舗・時間帯で絞る', async () => {
    await slotMemoApi.deleteInOrganization('o', '2026-10-03', 's', 'evening')
    expect(m.calls.filter(c => c[0] === 'eq').map(c => c[1])).toEqual([['organization_id', 'o'], ['date', '2026-10-03'], ['store_id', 's'], ['time_slot', 'evening']])
    m.calls.length = 0
    await slotMemoApi.delete('2026-10-03', 's', 'evening')
    expect(m.calls.filter(c => c[0] === 'eq').map(c => c[1])).toEqual([['date', '2026-10-03'], ['store_id', 's'], ['time_slot', 'evening']])
  })
})

describe('blockedSlotApi', () => {
  it('募集中止は組織・日付・店舗・時間帯を挿入', async () => {
    await blockedSlotApi.block('o', '2026-10-03', 's', 'morning')
    expect(ops()).toEqual(['from:["schedule_blocked_slots"]', 'insert:[{"organization_id":"o","date":"2026-10-03","store_id":"s","time_slot":"morning"}]'])
  })
  it('募集再開は組織・日付・店舗・時間帯で削除', async () => {
    await blockedSlotApi.unblock('o', '2026-10-03', 's', 'morning')
    expect(m.calls.filter(c => c[0] === 'eq').map(c => c[1])).toEqual([['organization_id', 'o'], ['date', '2026-10-03'], ['store_id', 's'], ['time_slot', 'morning']])
  })
  it('履歴には操作したユーザーを残す', async () => {
    await blockedSlotApi.writeLog('o', '2026-10-03', 's', 'morning', 'blocked')
    expect(m.calls[0]).toEqual(['from', ['schedule_blocked_slot_logs']])
    expect(m.calls[1][1][0]).toEqual({ organization_id: 'o', date: '2026-10-03', store_id: 's', time_slot: 'morning', action: 'blocked', performed_by: 'user-1' })
  })
})
