import { useCallback, useRef } from 'react'

/**
 * 終わるまで 2 回目を受け付けない操作（二度押しで同じ保存を 2 回しない）。描画を待たずに止める（ボタンの disabled は次の描画まで効かない）。
 * 終わったら（成功・失敗とも）また受け付ける。2026-10-26 点検 F07
 */
export function useSingleFlight<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  const inFlight = useRef(false)
  const latest = useRef(fn)
  latest.current = fn
  return useCallback(async (...args: A) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await latest.current(...args)
    } finally {
      inFlight.current = false
    }
  }, [])
}
