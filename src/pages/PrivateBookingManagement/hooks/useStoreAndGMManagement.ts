import { getGmResponses } from '@/lib/gmResponseApi'
import { useState, useCallback } from 'react'
import { storeApi } from '@/lib/api/storeApi'
import { staffApi } from '@/lib/api/staffApi'
import { logger } from '@/utils/logger'
import { sortGmResponsesByReplyTime } from '../utils/bookingFormatters'
import { shouldIncludeGmResponseRow } from '../utils/gmAvailabilityStatus'

/**
 * 店舗とGMのデータ管理、競合チェックを行うフック
 */
export function useStoreAndGMManagement() {
  const [stores, setStores] = useState<any[]>([])
  const [availableGMs, setAvailableGMs] = useState<any[]>([])
  const [allGMs, setAllGMs] = useState<any[]>([])
  // 店舗データの読み込み（組織対応済み）
  const loadStores = useCallback(async () => {
    try {
      const data = await storeApi.getAll(true)
      setStores(data || [])
    } catch (error) {
      logger.error('店舗情報取得エラー:', error)
    }
  }, [])

  // 担当候補の読み込み（スタッフマスタと同じ一覧＝組織内の全スタッフ。status や GM ロールで絞らない）
  const loadAllGMs = useCallback(async () => {
    try {
      const data = await staffApi.getAll()
      setAllGMs(
        (data || []).map((s) => ({
          id: s.id,
          name: s.name,
          avatar_color: s.avatar_color ?? null,
        }))
      )
    } catch (error) {
      logger.error('GM情報取得エラー:', error)
    }
  }, [])

  // 利用可能なGMの読み込み（スタッフのavatar_colorと名前も取得）
  const loadAvailableGMs = useCallback(async (reservationId: string) => {
    try {
      const responses = await getGmResponses([reservationId])

      // 回答済み・意思表示がある行のみ（pending かつ未回答は除外）
      const filteredResponses = (responses || []).filter((response: any) =>
        shouldIncludeGmResponseRow(response)
      )

      const sorted = sortGmResponsesByReplyTime(filteredResponses)
      const gmList = sorted.map((response: any) => ({
        gm_id: response.staff_id,
        gm_name: response.gm_name || response.staff?.name || '',
        response_status: response.response_status,
        available_candidates: response.available_candidates || [],
        selected_candidate_index: response.selected_candidate_index,
        notes: response.notes || '',
        avatar_color: response.staff?.avatar_color || null,
        responded_at: response.responded_at || null,
      }))

      logger.log('📋 GM回答情報:', gmList.length, '件', gmList.map(g => `${g.gm_name}(${g.response_status}): 候補${(g.available_candidates || []).map((i: number) => i+1).join(',')}`))

      setAvailableGMs(gmList)
    } catch (error) {
      logger.error('GM可否情報取得エラー:', error)
      // エラー時は空配列を設定してUIが壊れないようにする
      setAvailableGMs([])
    }
  }, [])

  return {
    stores,
    availableGMs,
    allGMs,
    loadStores,
    loadAllGMs,
    loadAvailableGMs
  }
}

