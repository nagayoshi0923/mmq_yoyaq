import { describe, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('@/lib/privateGroupGuestSession', () => ({ getPrivateGroupGuestToken: () => null }))
import { readPrivateGroupList } from './privateGroupRead'

describe('readPrivateGroupList の指定ID読み込み（#837）', () => {
  it('指定した100件を取り切ったら、空の追加取得をしない', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `g-${String(i).padStart(3, '0')}`)
    rpc.mockImplementation(async (_name: string, args: { p_group_ids: string[] }) => ({
      data: args.p_group_ids.map(id => ({ id, created_at: '2026-10-01T00:00:00Z' })), error: null,
    }))
    const groups = await readPrivateGroupList('staff', 'org', ids)
    expect(groups).toHaveLength(250)
    expect(rpc).toHaveBeenCalledTimes(3)
  })
})
