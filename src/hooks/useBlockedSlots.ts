/**
 * 募集中止スロットを管理するフック
 * 
 * 特定のセル（日付・店舗・時間帯）を募集中止にして、
 * 公演を追加できないようにする機能を提供します。
 */

import { useState, useCallback, useEffect } from 'react'
import { logger } from '@/utils/logger'

// ブロックされたスロットのキー形式: "YYYY-MM-DD:storeId:timeSlot"
type BlockedSlotKey = string

interface UseBlockedSlotsReturn {
  blockedSlots: Set<BlockedSlotKey>
  isSlotBlocked: (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => boolean
  blockSlot: (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  unblockSlot: (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
  toggleBlockSlot: (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => void
}

const STORAGE_KEY = 'mmq-blocked-slots'

/**
 * スロットキーを生成
 */
function createSlotKey(date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening'): BlockedSlotKey {
  return `${date}:${storeId}:${timeSlot}`
}

/**
 * 募集中止スロットを管理するフック
 */
export function useBlockedSlots(): UseBlockedSlotsReturn {
  const [blockedSlots, setBlockedSlots] = useState<Set<BlockedSlotKey>>(new Set())

  // localStorageから初期化
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as string[]
        setBlockedSlots(new Set(parsed))
        logger.log(`📛 募集中止スロット読み込み: ${parsed.length}件`)
      }
    } catch (error) {
      logger.error('募集中止スロットの読み込みエラー:', error)
    }
  }, [])

  // localStorageに保存
  const saveToStorage = useCallback((slots: Set<BlockedSlotKey>) => {
    try {
      const array = Array.from(slots)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(array))
    } catch (error) {
      logger.error('募集中止スロットの保存エラー:', error)
    }
  }, [])

  // スロットがブロックされているか確認
  const isSlotBlocked = useCallback((date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening'): boolean => {
    const key = createSlotKey(date, storeId, timeSlot)
    return blockedSlots.has(key)
  }, [blockedSlots])

  // スロットをブロック
  const blockSlot = useCallback((date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    const key = createSlotKey(date, storeId, timeSlot)
    setBlockedSlots(prev => {
      const newSet = new Set(prev)
      newSet.add(key)
      saveToStorage(newSet)
      logger.log(`📛 募集中止: ${date} ${storeId} ${timeSlot}`)
      return newSet
    })
  }, [saveToStorage])

  // スロットのブロックを解除
  const unblockSlot = useCallback((date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    const key = createSlotKey(date, storeId, timeSlot)
    setBlockedSlots(prev => {
      const newSet = new Set(prev)
      newSet.delete(key)
      saveToStorage(newSet)
      logger.log(`✅ 募集再開: ${date} ${storeId} ${timeSlot}`)
      return newSet
    })
  }, [saveToStorage])

  // スロットのブロックをトグル
  const toggleBlockSlot = useCallback((date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    if (isSlotBlocked(date, storeId, timeSlot)) {
      unblockSlot(date, storeId, timeSlot)
    } else {
      blockSlot(date, storeId, timeSlot)
    }
  }, [isSlotBlocked, blockSlot, unblockSlot])

  return {
    blockedSlots,
    isSlotBlocked,
    blockSlot,
    unblockSlot,
    toggleBlockSlot
  }
}
