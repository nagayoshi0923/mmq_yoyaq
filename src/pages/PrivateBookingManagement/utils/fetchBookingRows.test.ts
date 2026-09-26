import { expect, it, vi } from 'vitest'
import { fetchBookingRows, fetchBookingRelatedRows } from './fetchBookingRows'
it('1040件を末尾まで取得し、範囲を重ねない', async () => {
  const source = Array.from({length:1040},(_,id)=>({id}))
  const page = vi.fn(async (from:number,to:number)=>({data:source.slice(from,to+1),error:null}))
  expect(await fetchBookingRows(page)).toEqual(source)
  expect(page.mock.calls).toEqual([[0,999],[1000,1999]])
})
it('後続ページの失敗を部分成功として返さない', async () => {
  const page = vi.fn().mockResolvedValueOnce({data:Array(1000).fill({id:1}),error:null}).mockResolvedValueOnce({data:null,error:new Error('second page failed')})
  await expect(fetchBookingRows(page)).rejects.toThrow('second page failed')
})
it('関連IDを100件ずつ取得し、各バッチ内の1000件超も読み切る', async () => {
  const ids = Array.from({length:205},(_,id)=>String(id))
  const calls: [number,number,number][] = []
  const result = await fetchBookingRelatedRows([...ids,'0'],async(batch,from,to)=>{
    calls.push([batch.length,from,to])
    const all = batch.flatMap(id=>Array.from({length:11},(_,n)=>({id,n})))
    return {data:all.slice(from,to+1),error:null}
  })
  expect(result.data).toHaveLength(2255)
  expect(calls).toEqual([[100,0,999],[100,1000,1999],[100,0,999],[100,1000,1999],[5,0,999]])
})
it('関連IDが空ならDBを呼ばない', async () => {
  const page=vi.fn()
  expect(await fetchBookingRelatedRows([],page)).toEqual({data:[],error:null})
  expect(page).not.toHaveBeenCalled()
})
