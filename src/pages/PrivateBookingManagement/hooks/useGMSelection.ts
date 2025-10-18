import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface GMInfo {
  id: string
  name: string
  available_candidates: number[]
  selected_candidate_index?: number
  notes: string
  isAssigned: boolean
  isAvailable: boolean
}

interface Staff {
  id: string
  name: string
  discord_id?: string
}

/**
 * GM選択とAvailability管理
 */
export const useGMSelection = (allGMs: Staff[]) => {
  const [availableGMs, setAvailableGMs] = useState<GMInfo[]>([])
  const [selectedGMId, setSelectedGMId] = useState<string>('')

  /**
   * 利用可能なGM情報をロード
   */
  const loadAvailableGMs = useCallback(async (reservationId: string) => {
    try {
      // このシナリオに担当可能なGMを取得
      const { data: requestData, error: requestError } = await supabase
        .from('private_booking_requests')
        .select('scenario_id')
        .eq('id', reservationId)
        .single()

      if (requestError) throw requestError

      // 担当可能なGMのIDを取得
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('gm_scenario_assignments')
        .select('staff_id')
        .eq('scenario_id', requestData.scenario_id)

      if (assignmentError) throw assignmentError

      // GM回答データを取得
      const { data: availableData, error: availableError } = await supabase
        .from('gm_availability_responses')
        .select('staff_id, available_candidates, notes, response_type, selected_candidate_index, gm_discord_id, gm_name')
        .eq('reservation_id', reservationId)
        .in('response_type', ['available'])
        .not('response_type', 'is', null)

      logger.log('🔍 GM回答データ:', {
        reservationId,
        availableDataCount: availableData?.length || 0,
        availableData: availableData,
        availableError: availableError
      })

      // 担当GMのIDリストを作成
      const assignedGMIds = (assignmentData || []).map((a: { staff_id: string }) => a.staff_id)

      // 対応可能GMの情報をマップに変換（Discord経由も含む）
      const availableGMMap = new Map()
      const discordGMMap = new Map()

      interface AvailabilityResponse {
        staff_id?: string
        gm_discord_id?: string
        available_candidates?: number[]
        selected_candidate_index?: number
        notes?: string
        gm_name?: string
      }

      ;(availableData || []).forEach((a: AvailabilityResponse) => {
        if (a.staff_id) {
          // 通常のstaff_id経由の回答
          availableGMMap.set(a.staff_id, {
            available_candidates: a.available_candidates || [],
            selected_candidate_index: a.selected_candidate_index,
            notes: a.notes || ''
          })
        } else if (a.gm_discord_id) {
          // Discord経由の回答
          discordGMMap.set(a.gm_discord_id, {
            available_candidates: a.available_candidates || [],
            selected_candidate_index: a.selected_candidate_index,
            notes: a.notes || '',
            gm_name: a.gm_name
          })
        }
      })

      // Discord IDでGMを検索してstaff_idにマッピング
      const discordToStaffMap = new Map()
      allGMs.forEach(gm => {
        if (gm.discord_id && discordGMMap.has(gm.discord_id)) {
          discordToStaffMap.set(gm.id, discordGMMap.get(gm.discord_id))
        }
      })

      // ハイライト対象のGMを作成（担当GM + 対応可能GM + Discord経由GM）
      const highlightGMs = allGMs
        .filter(gm => 
          assignedGMIds.includes(gm.id) || 
          availableGMMap.has(gm.id) || 
          discordToStaffMap.has(gm.id)
        )
        .map(gm => {
          const availableInfo = availableGMMap.get(gm.id) || discordToStaffMap.get(gm.id) || {}
          return {
            id: gm.id,
            name: gm.name,
            available_candidates: availableInfo.available_candidates || [],
            selected_candidate_index: availableInfo.selected_candidate_index,
            notes: availableInfo.notes || '',
            isAssigned: assignedGMIds.includes(gm.id),
            isAvailable: availableGMMap.has(gm.id) || discordToStaffMap.has(gm.id)
          }
        })

      setAvailableGMs(highlightGMs)

      // デフォルトで最初の担当GMを選択（対応可能GMがいればそちらを優先）
      if (highlightGMs.length > 0) {
        // 対応可能と回答したGMを優先
        const availableGM = highlightGMs.find(gm => gm.isAvailable)
        if (availableGM) {
          setSelectedGMId(availableGM.id)
        } else {
          // いなければ最初の担当GMを選択
          setSelectedGMId(highlightGMs[0].id)
        }
      } else if (allGMs.length > 0) {
        // 担当GMがいない場合は最初のGMを選択
        setSelectedGMId(allGMs[0].id)
      }
    } catch (error) {
      logger.error('GM情報取得エラー:', error)
      setAvailableGMs([])
    }
  }, [allGMs])

  return {
    availableGMs,
    selectedGMId,
    setSelectedGMId,
    loadAvailableGMs
  }
}

