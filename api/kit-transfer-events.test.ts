import { beforeEach,describe,expect,it,vi } from 'vitest'
import type { VercelRequest,VercelResponse } from '@vercel/node'
const mock=vi.hoisted(()=>({from:vi.fn(),auth:vi.fn(),insert:vi.fn(),result:{data:null,error:null} as any}))
vi.mock('./_lib/db.js',()=>({db:{from:mock.from},getMissingEnvError:()=>null}))
vi.mock('./_lib/auth.js',async(importOriginal)=>({...await importOriginal<typeof import('./_lib/auth.js')>(),requireAuth:mock.auth}))
import handler from './kit-transfer-events'
const input={org_scenario_id:'scenario',kit_number:1,transfer_date:'2026-09-21',from_store_id:'from',to_store_id:'to'}
async function request(body:unknown){
 const res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),setHeader:vi.fn()}
 await handler({method:'POST',headers:{},query:{},body} as VercelRequest,res as unknown as VercelResponse)
 return res
}
beforeEach(()=>{
 vi.clearAllMocks();mock.auth.mockResolvedValue({userId:'user',orgId:'org',role:'staff'});mock.result={data:{id:'created'},error:null}
 mock.from.mockImplementation((table:string)=>{
  const q:any={select:vi.fn(()=>q),eq:vi.fn(()=>q),insert:mock.insert.mockImplementation(()=>q),maybeSingle:vi.fn(async()=>({data:{id:table},error:null})),single:vi.fn(async()=>mock.result)}
  return q
 })
})
describe('キット移動の入力・DB整合エラー',()=>{
 it('必須店舗や正の番号がない場合はDB書込み前に400を返す',async()=>{
  expect((await request({...input,from_store_id:null})).status).toHaveBeenCalledWith(400)
  expect((await request({...input,kit_number:0})).status).toHaveBeenCalledWith(400)
  expect(mock.from).not.toHaveBeenCalled()
 })
 it('一括入力の不正行も書込み前に検出する',async()=>{
  const res=await request({events:[input,{...input,to_store_id:null}]})
  expect(res.status).toHaveBeenCalledWith(400);expect(mock.insert).not.toHaveBeenCalled()
 })
 it('サーバーの組織と操作者で登録し、master IDはDBで解決する',async()=>{
  expect((await request({...input,organization_id:'foreign',created_by:'foreign'})).status).toHaveBeenCalledWith(200)
  expect(mock.insert).toHaveBeenCalledWith({...input,organization_id:'org',created_by:'user'})
 })
 it('DBの参照不一致を入力エラーとして表示する',async()=>{
  mock.result={data:null,error:{code:'23514',message:'移動する作品の参照IDが一致しません'}}
  const res=await request(input)
  expect(res.status).toHaveBeenCalledWith(400);expect(res.json).toHaveBeenCalledWith({error:mock.result.error.message})
 })
})
