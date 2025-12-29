// メモの管理

import { useState, useEffect } from 'react'
import { memoApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { getMemoKey } from '@/utils/scheduleUtils'

interface MemoData {
  date: string
  venue_id: string
  memo_text?: string
}

export function useMemoManager(currentDate: Date) {
  const [memos, setMemos] = useState<Record<string, string>>({})

  // 初期データ読み込み（月が変わった時も実行）
  useEffect(() => {
    const loadMemos = async () => {
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        const memoData = await memoApi.getByMonth(year, month)
        
        // メモデータを状態に変換（venue_id をキーとして使用）
        const memoMap: Record<string, string> = {}
        
        memoData.forEach((memo: MemoData) => {
          const key = getMemoKey(memo.date, memo.venue_id)
          memoMap[key] = memo.memo_text || ''
        })
        
        setMemos(memoMap)
      } catch (error) {
        logger.error('メモ読み込みエラー:', error)
      }
    }

    loadMemos()
  }, [currentDate])

  // メモを保存
  // venue には venue.id（店舗ID）が渡される
  const handleSaveMemo = async (date: string, venueId: string, memo: string) => {
    const key = getMemoKey(date, venueId)
    setMemos(prev => ({
      ...prev,
      [key]: memo
    }))

    try {
      await memoApi.save(date, venueId, memo)
      logger.log('メモ保存成功:', { date, venueId, memo })
    } catch (error) {
      logger.error('メモ保存エラー:', error)
    }
  }

  // メモを取得（venueId で検索）
  const getMemo = (date: string, venueId: string) => {
    const key = getMemoKey(date, venueId)
    return memos[key] || ''
  }

  return {
    memos,
    handleSaveMemo,
    getMemo
  }
}

