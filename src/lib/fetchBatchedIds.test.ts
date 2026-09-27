import { expect, it, vi } from 'vitest'
import { fetchBatchedIds } from './fetchBatchedIds'
it('1,000件を越える関連情報を100件ずつ取得し、重複IDを一度だけ読む', async () => {
 const ids=Array.from({length:1201},(_,i)=>`id-${i}`)
 const fetch=vi.fn(async (batch:string[])=>({data:batch.map(id=>({id})),error:null}))
 const result=await fetchBatchedIds([...ids,ids[0]],fetch)
 expect(result.data).toHaveLength(1201)
 expect(fetch).toHaveBeenCalledTimes(13)
 expect(fetch.mock.calls.every(([batch])=>batch.length<=100)).toBe(true)
 expect(result.data.at(-1)?.id).toBe('id-1200')
})
it('後続の関連情報取得が失敗したら不完全なアルバムを返さない', async () => {
 const error=new Error('metadata failed')
 const fetch=vi.fn().mockResolvedValueOnce({data:[{id:'first'}],error:null}).mockResolvedValueOnce({data:null,error})
 await expect(fetchBatchedIds(Array.from({length:101},(_,i)=>String(i)),fetch)).rejects.toBe(error)
})
