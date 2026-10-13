import { beforeEach, expect, it, vi } from 'vitest'
import { beginWrite, endWrite, noteWriteFailure, noteWriteSuccess, resetWriteFailureLimiter } from './writeFailureLimiter'
beforeEach(() => { resetWriteFailureLimiter(); vi.useRealTimers() })
it('RPC開始前に100並列のうち1件だけ確保し、完了時に枠を解放する', () => {
  expect(beginWrite('same')).toBe(0)
  expect(Array.from({length:100},()=>beginWrite('same')).every(x=>x===1)).toBe(true)
  endWrite('same')
  expect(beginWrite('same')).toBe(0)
  endWrite('same')
})
it('失敗が続く要求を429相当で即時拒否し、成功で失敗回数を消す', () => {
  for (let i=0;i<6;i++) noteWriteFailure('same')
  expect(beginWrite('same')).toBe(2)
  noteWriteSuccess('same')
  expect(beginWrite('same')).toBe(0)
  endWrite('same')
})
