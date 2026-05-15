// メモの管理

import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { memoApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { getMemoKey } from '@/utils/scheduleUtils'

interface MemoData {
  date: string
  venue_id: string
  memo_text?: string
}

export const memoKeys = {
  month: (year: number, month: number) => ['memos', year, month] as const,
}

async function fetchMemosForMonth(year: number, month: number): Promise<Record<string, string>> {
  const memoData = await memoApi.getByMonth(year, month)
  const memoMap: Record<string, string> = {}
  memoData.forEach((memo: MemoData) => {
    const key = getMemoKey(memo.date, memo.venue_id)
    memoMap[key] = memo.memo_text || ''
  })
  return memoMap
}

export function useMemoManager(currentDate: Date) {
  const queryClient = useQueryClient()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const storageKey = `memos_${year}_${month}`
  const storageTs = `${storageKey}_ts`

  const { data: memos = {} } = useQuery({
    queryKey: memoKeys.month(year, month),
    queryFn: () => fetchMemosForMonth(year, month),
    staleTime: 10 * 60 * 1000, // 10分間は再フェッチしない
    gcTime: 60 * 60 * 1000,
    // sessionStorage から初期値を復元 → 即表示
    initialData: () => {
      try {
        const cached = sessionStorage.getItem(storageKey)
        return cached ? JSON.parse(cached) : undefined
      } catch {
        return undefined
      }
    },
    initialDataUpdatedAt: () => {
      try {
        const ts = sessionStorage.getItem(storageTs)
        return ts ? parseInt(ts) : 0
      } catch {
        return 0
      }
    },
  })

  // フェッチ完了後に sessionStorage に保存
  useEffect(() => {
    if (!memos || Object.keys(memos).length === 0) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(memos))
      sessionStorage.setItem(storageTs, String(Date.now()))
    } catch { /* 容量超過など */ }
  }, [memos, storageKey, storageTs])

  const handleSaveMemo = useCallback(async (date: string, venueId: string, memo: string) => {
    const key = getMemoKey(date, venueId)

    // 楽観的更新（即座にUIに反映）
    queryClient.setQueryData<Record<string, string>>(
      memoKeys.month(year, month),
      prev => ({ ...(prev ?? {}), [key]: memo })
    )

    try {
      await memoApi.save(date, venueId, memo)
      logger.log('メモ保存成功:', { date, venueId, memo })
    } catch (error) {
      logger.error('メモ保存エラー:', error)
      // 失敗時はキャッシュを無効化して再フェッチ
      queryClient.invalidateQueries({ queryKey: memoKeys.month(year, month) })
    }
  }, [queryClient, year, month])

  const getMemo = useCallback((date: string, venueId: string) => {
    return memos[getMemoKey(date, venueId)] || ''
  }, [memos])

  return { memos, handleSaveMemo, getMemo }
}
