import { expect, it } from 'vitest'
import { boundedBatches } from './boundedBatches'
it('bounds concurrency and preserves order even when requests finish out of order', async () => {
  let active=0,max=0
  const values=Array.from({length:121},(_,i)=>i)
  const result=await boundedBatches(values,10,3,async batch=>{
    active++;max=Math.max(max,active)
    await new Promise(resolve=>setTimeout(resolve,batch[0]===0?15:1))
    active--;return batch
  })
  expect(max).toBe(3);expect(result).toEqual(values)
})
it('rejects a failed page without returning a successful partial result', async () => {
  await expect(boundedBatches([1,2,3],1,2,async batch=>{if(batch[0]===2)throw new Error('failed');return batch})).rejects.toThrow('failed')
  expect(await boundedBatches([],50,3,async batch=>batch)).toEqual([])
})
