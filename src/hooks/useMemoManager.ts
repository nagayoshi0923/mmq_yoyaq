// メモの管理

import { useState, useEffect } from 'react'
import { memoApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { getMemoKey } from '@/utils/scheduleUtils'

interface Store {
  id: string
  name: string
  short_name?: string
}

interface MemoData {
  date: string
  venue_id: string
  memo_text?: string
  stores: {
    name: string
  }
}

export function useMemoManager(currentDate: Date, stores: Store[]) {
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [storeIdMap, setStoreIdMap] = useState<Record<string, string>>({})

  // 初期データ読み込み（月が変わった時も実行）
  useEffect(() => {
    const loadMemos = async () => {
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        const memoData = await memoApi.getByMonth(year, month)
        
        // メモデータを状態に変換
        const memoMap: Record<string, string> = {}
        const storeMap: Record<string, string> = {}
        
        memoData.forEach((memo: MemoData) => {
          const key = getMemoKey(memo.date, memo.stores.name)
          memoMap[key] = memo.memo_text || ''
          storeMap[memo.stores.name] = memo.venue_id
        })
        
        setMemos(memoMap)
        setStoreIdMap(storeMap)
      } catch (error) {
        logger.error('メモ読み込みエラー:', error)
      }
    }

    loadMemos()
  }, [currentDate])

  // メモを保存
  const handleSaveMemo = async (date: string, venue: string, memo: string) => {
    const key = getMemoKey(date, venue)
    setMemos(prev => ({
      ...prev,
      [key]: memo
    }))

    try {
      // 店舗名から実際のSupabase IDを取得
      const store = stores.find(s => s.name === venue)
      let venueId = storeIdMap[venue]
      
      if (!venueId && store) {
        // storeIdMapにない場合は、店舗名で検索（初回保存時）
        console.warn(`店舗ID未取得: ${venue}, 店舗名で保存を試行`)
        venueId = store.id // 仮のID、実際はSupabaseから取得が必要
      }

      if (venueId) {
        await memoApi.save(date, venueId, memo)
        logger.log('メモ保存成功:', { date, venue, memo })
      } else {
        logger.error('店舗IDが見つかりません:', venue)
      }
    } catch (error) {
      logger.error('メモ保存エラー:', error)
    }
  }

  // メモを取得
  const getMemo = (date: string, venue: string) => {
    const key = getMemoKey(date, venue)
    return memos[key] || ''
  }

  return {
    memos,
    handleSaveMemo,
    getMemo
  }
}

