/**
 * 募集中止スロットを管理するフック
 *
 * 特定のセル（日付・店舗・時間帯）を募集中止にして、
 * 公演を追加できないようにする機能を提供します。
 * 設定は DB（schedule_blocked_slots）に永続化されます。
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId, QUEENS_WALTZ_ORG_ID } from '@/lib/organization'
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

function createSlotKey(date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening'): BlockedSlotKey {
  return `${date}:${storeId}:${timeSlot}`
}

export function useBlockedSlots(): UseBlockedSlotsReturn {
  const [blockedSlots, setBlockedSlots] = useState<Set<BlockedSlotKey>>(new Set())

  // DBから初期データを読み込む
  useEffect(() => {
    const load = async () => {
      try {
        const orgId = (await getCurrentOrganizationId()) || QUEENS_WALTZ_ORG_ID
        const { data, error } = await supabase
          .from('schedule_blocked_slots')
          .select('date, store_id, time_slot')
          .eq('organization_id', orgId)

        if (error) {
          logger.error('募集中止スロットの読み込みエラー:', error)
          return
        }

        if (data && data.length > 0) {
          const keys = data.map(row =>
            createSlotKey(row.date, row.store_id, row.time_slot as 'morning' | 'afternoon' | 'evening')
          )
          setBlockedSlots(new Set(keys))
          logger.log(`📛 募集中止スロット読み込み: ${keys.length}件`)
        }
      } catch (error) {
        logger.error('募集中止スロットの読み込みエラー:', error)
      }
    }
    load()
  }, [])

  const isSlotBlocked = useCallback(
    (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening'): boolean => {
      return blockedSlots.has(createSlotKey(date, storeId, timeSlot))
    },
    [blockedSlots]
  )

  const writeLog = useCallback(
    async (orgId: string, date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening', action: 'blocked' | 'unblocked') => {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('schedule_blocked_slot_logs').insert({
        organization_id: orgId,
        date,
        store_id: storeId,
        time_slot: timeSlot,
        action,
        performed_by: user?.id ?? null,
      })
    },
    []
  )

  const blockSlot = useCallback(
    async (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      const key = createSlotKey(date, storeId, timeSlot)
      // 楽観的更新
      setBlockedSlots(prev => new Set(prev).add(key))

      try {
        const orgId = (await getCurrentOrganizationId()) || QUEENS_WALTZ_ORG_ID
        const { error } = await supabase
          .from('schedule_blocked_slots')
          .insert({ organization_id: orgId, date, store_id: storeId, time_slot: timeSlot })

        if (error) {
          logger.error('募集中止の保存エラー:', error)
          setBlockedSlots(prev => { const s = new Set(prev); s.delete(key); return s })
        } else {
          logger.log(`📛 募集中止: ${date} ${storeId} ${timeSlot}`)
          writeLog(orgId, date, storeId, timeSlot, 'blocked')
        }
      } catch (error) {
        logger.error('募集中止の保存エラー:', error)
        setBlockedSlots(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    },
    [writeLog]
  )

  const unblockSlot = useCallback(
    async (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      const key = createSlotKey(date, storeId, timeSlot)
      // 楽観的更新
      setBlockedSlots(prev => { const s = new Set(prev); s.delete(key); return s })

      try {
        const orgId = (await getCurrentOrganizationId()) || QUEENS_WALTZ_ORG_ID
        const { error } = await supabase
          .from('schedule_blocked_slots')
          .delete()
          .eq('organization_id', orgId)
          .eq('date', date)
          .eq('store_id', storeId)
          .eq('time_slot', timeSlot)

        if (error) {
          logger.error('募集再開の保存エラー:', error)
          setBlockedSlots(prev => new Set(prev).add(key))
        } else {
          logger.log(`✅ 募集再開: ${date} ${storeId} ${timeSlot}`)
          writeLog(orgId, date, storeId, timeSlot, 'unblocked')
        }
      } catch (error) {
        logger.error('募集再開の保存エラー:', error)
        setBlockedSlots(prev => new Set(prev).add(key))
      }
    },
    [writeLog]
  )

  const toggleBlockSlot = useCallback(
    (date: string, storeId: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      if (isSlotBlocked(date, storeId, timeSlot)) {
        unblockSlot(date, storeId, timeSlot)
      } else {
        blockSlot(date, storeId, timeSlot)
      }
    },
    [isSlotBlocked, blockSlot, unblockSlot]
  )

  return { blockedSlots, isSlotBlocked, blockSlot, unblockSlot, toggleBlockSlot }
}
