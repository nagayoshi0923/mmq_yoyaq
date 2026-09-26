import { describe, expect, it, vi } from 'vitest'
import { isRecruitmentExtensionCurrent } from '../supabase/functions/_shared/recruitment-send-guard'
const now = Date.parse('2026-09-27T10:00:00Z')
const notice = { id:'n',organization_id:'org',schedule_event_id:'e',reservation_id:'r',cycle:2,attempts:1,lease_until:'2026-09-27T10:05:00Z' }
function setup(overrides: Record<string, unknown> = {}) {
  const rows: Record<string,unknown> = {
    performance_recruitment_deadlines:{status:'active',cycle:2,deadline:'2026-09-27T11:00:00Z'},
    reservations:{status:'confirmed'},
    performance_recruitment_notices:{status:'sending',cycle:2,withdrawn_at:null,sent_at:null,attempts:1,lease_until:notice.lease_until},
    ...overrides,
  }
  const filters: [string,string,unknown][] = []
  const db = {from:vi.fn((table:string)=>{
    const query = {select:vi.fn(()=>query),eq:vi.fn((key:string,value:unknown)=>{filters.push([table,key,value]);return query}),maybeSingle:vi.fn(async()=>({data:rows[table],error:null}))}
    return query
  })}
  return {db,filters,rows}
}
describe('追加募集の送信直前確認',()=>{
  it('sendingの未送信案内を回答RPCや書込なしで送信対象にする',async()=>{
    const {db,filters}=setup()
    expect(await isRecruitmentExtensionCurrent(db,notice,now)).toBe(true)
    expect(filters.filter(([,key])=>key==='organization_id')).toHaveLength(3)
    expect(filters.every(([,key,value])=>key!=='organization_id'||value==='org')).toBe(true)
  })
  it.each(['cancelled','checked_in'])('予約が%sなら送らない',async(status)=>{
    expect(await isRecruitmentExtensionCurrent(setup({reservations:{status}}).db,notice,now)).toBe(false)
  })
  it.each([
    {status:'confirmed',cycle:2,deadline:'2026-09-27T11:00:00Z'},
    {status:'active',cycle:3,deadline:'2026-09-27T11:00:00Z'},
    {status:'active',cycle:2,deadline:'2026-09-27T10:00:00Z'},
  ])('開催状態・周回・締切の変更を反映する',async(decision)=>{
    expect(await isRecruitmentExtensionCurrent(setup({performance_recruitment_deadlines:decision}).db,notice,now)).toBe(false)
  })
  it.each([{withdrawn_at:'2026-09-27T10:00:00Z'},{sent_at:'2026-09-27T10:00:00Z'},{status:'expired'},{attempts:2},{lease_until:'2026-09-27T10:06:00Z'}])('取得後の辞退・送信・リース変更を反映する',async(change)=>{
    const {db,rows}=setup();rows.performance_recruitment_notices={...(rows.performance_recruitment_notices as object),...change}
    expect(await isRecruitmentExtensionCurrent(db,notice,now)).toBe(false)
  })
  it('参照先が消えた案内は送らない',async()=>{
    expect(await isRecruitmentExtensionCurrent(setup({reservations:null}).db,notice,now)).toBe(false)
  })
  it('DBエラーは期限切れと決めつけず再試行へ渡す',async()=>{
    const error=new Error('read failed')
    const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error})}
    await expect(isRecruitmentExtensionCurrent({from:()=>q},notice,now)).rejects.toBe(error)
  })
})
