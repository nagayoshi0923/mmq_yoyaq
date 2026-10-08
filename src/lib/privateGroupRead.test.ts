import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readPrivateGroupList, readPrivateGroupMessageHistory } from './privateGroupRead'
import { supabase } from './supabase'
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('./privateGroupGuestSession', () => ({ getPrivateGroupGuestToken: vi.fn() }))
const group = (n: number) => ({ id: String(n).padStart(5, '0'), created_at: '2026-09-27T00:00:00Z' })
beforeEach(() => vi.resetAllMocks())
describe('貸切一覧の全ページ取得', () => {
  it('組織条件を保ったまま101件以上を取得する', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, n) => group(n)), error: null } as never)
      .mockResolvedValueOnce({ data: [group(100)], error: null } as never)
    const rows = await readPrivateGroupList('staff', 'org')
    expect(rows).toHaveLength(101)
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'private_group_read_list', { p_scope: 'staff', p_organization_id: 'org', p_after_id: '00099', p_limit: 100 })
  })
  it('途中ページが失敗した場合に不完全な一覧を成功扱いしない', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, n) => group(n)), error: null } as never)
      .mockResolvedValueOnce({ data: null, error: new Error('denied') } as never)
    await expect(readPrivateGroupList('joined')).rejects.toThrow('denied')
  })
  it('同じカーソルが返された場合は無限取得しない', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: Array.from({ length: 100 }, (_, n) => group(n)), error: null } as never)
    await expect(readPrivateGroupList('organized')).rejects.toThrow('続きを取得')
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('貸切通知履歴の全件取得', () => {
  it('新しいページから遡って取得し、表示順を古い順にする', async () => {
    const newer = Array.from({ length: 500 }, (_, n) => ({ id: String(n + 100), created_at: '2026-09-27T00:00:00Z' }))
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: newer, error: null } as never)
      .mockResolvedValueOnce({ data: [{ id: 'old', created_at: '2026-09-26T00:00:00Z' }], error: null } as never)
    const rows = await readPrivateGroupMessageHistory('group')
    expect(rows).toHaveLength(501)
    expect(rows[0].id).toBe('old')
    expect(rows.at(-1)?.id).toBe('599')
    expect(supabase.rpc).toHaveBeenLastCalledWith('private_group_read_messages', { p_group_id: 'group', p_before_created_at: newer[0].created_at, p_before_id: '100', p_limit: 500 })
  })
  it('古いページの取得に失敗しても空履歴扱いにしない', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('forbidden') } as never)
    await expect(readPrivateGroupMessageHistory('group')).rejects.toThrow('forbidden')
  })
})

it('取り下げ候補とその回答を表示対象から外し、他の候補と店舗却下は残す',async()=>{
 const {readPrivateGroup}=await import('./privateGroupRead')
 const raw={group:{...group(1),candidate_dates:[{id:'active'},{id:'rejected',status:'rejected'},{id:'withdrawn',status:'rejected',withdrawn_at:'2026-10-06T00:00:00Z'}],members:[{id:'member',date_responses:[{candidate_date_id:'active',response:'ok'},{candidate_date_id:'withdrawn',response:'maybe'}]}]}}
 vi.mocked(supabase.rpc).mockResolvedValue({data:raw,error:null} as never)
 const result=await readPrivateGroup({groupId:'group'})
 expect(result.group.candidate_dates?.map(d=>d.id)).toEqual(['active','rejected'])
 expect(result.group.members?.[0].date_responses).toEqual([{candidate_date_id:'active',response:'ok'}])
 expect(raw.group.candidate_dates).toHaveLength(3)
 expect(raw.group.members[0].date_responses).toHaveLength(2)
})
