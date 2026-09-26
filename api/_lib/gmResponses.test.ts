import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readGmResponses } from './gmResponses'
import type { AuthUser } from './auth'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const user = { userId: 'user', orgId: 'org', role: 'staff', jwt: '' } as AuthUser
function fakeDb(rows: Record<string, unknown>[], failed = false) {
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = []
    const q = {
      select: vi.fn(() => q), order: vi.fn(() => q),
      eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return q }),
      in: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return q }),
      maybeSingle: async () => ({ data: filters.some(([key,value])=>key==='user_id'&&value==='user') && filters.some(([key,value])=>key==='organization_id'&&value==='org') ? { id: 'staff', name: '自分' } : null, error: null }),
      range: async (start: number, end: number) => ({ data: failed ? null : rows.filter(row=>filters.every(([key,value])=>Array.isArray(value) ? value.includes(row[key]) : row[key]===value)).slice(start,end+1), error: failed ? {message:'unavailable'} : null }),
    }
    return q
  })
  return { db: { from } as unknown as SupabaseClient, from }
}
const row = { id: 'response', staff_id: 'staff', reservation_id: id(1), organization_id: 'org', 'staff.organization_id': 'org', 'reservations.organization_id': 'org' }
describe('GM回答の組織境界', () => {
  it('クライアントの組織指定を無視し、本人組織の予約とスタッフだけを返す', async () => {
    const {db} = fakeDb([row, {...row, id:'foreign-response',organization_id:'foreign'}, {...row,id:'foreign-staff','staff.organization_id':'foreign'}, {...row,id:'foreign-reservation','reservations.organization_id':'foreign'}])
    const result = await readGmResponses(db,user,{reservation_ids:id(1),organization_id:'foreign'})
    expect(result.responses).toEqual([row])
  })
  it('本人のGM回答は検証済みuserから引いたstaff_idに限定する', async () => {
    const {db} = fakeDb([row,{...row,id:'other',staff_id:'other'}])
    const result = await readGmResponses(db,user,{mine:'true',staff_id:'other',user_id:'other'})
    expect(result.responses).toEqual([row]); expect(result.staffId).toBe('staff')
  })
  it('1000行を超えても回答を欠落させない', async () => {
    const rows = Array.from({length:1001},(_,i)=>({...row,id:String(i)}))
    const {db} = fakeDb(rows)
    expect((await readGmResponses(db,user,{reservation_ids:id(1)})).responses).toHaveLength(1001)
  })
  it('取得失敗を回答なしへ変換しない', async () => {
    const {db} = fakeDb([],true)
    await expect(readGmResponses(db,user,{reservation_ids:id(1)})).rejects.toThrow('GM回答を取得できませんでした')
  })
  it.each([{}, {reservation_ids:'invalid'}, {reservation_ids:Array(101).fill(id(1)).join(',')}])('不正な予約指定を照会しない', async query => {
    const {db,from} = fakeDb([])
    await expect(readGmResponses(db,user,query)).rejects.toThrow('予約ID')
    expect(from).not.toHaveBeenCalled()
  })
})
