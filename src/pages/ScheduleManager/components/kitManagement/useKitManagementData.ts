/**
 * キット管理ダイアログのデータ層
 *
 * サーバーデータの取得・保持・リアルタイム同期を担う。
 * KitManagementDialog 本体から抽出（Phase 5-1 第6歩・挙動不変）。
 *
 * 設定系 state（selectedOffsets / transferStartStoreIds）は呼び出し側が所有し、
 * fetchData がそれらを書き戻すため setter / ref を deps として注入する
 * （AuthContext 分割と同じ「共有 state は呼び出し側で生成し deps 注入」方式。
 *  クロージャ捕捉タイミングを旧実装と一致させて挙動不変）。
 */
import { useState, useEffect, useCallback } from 'react'
import { kitApi } from '@/lib/api/kitApi'
import { storeApi, scenarioApi, scheduleApi } from '@/lib/api'
import { showToast } from '@/utils/toast'
import type { KitLocation, KitTransferEvent, Store, StoreTravelTime, Scenario, KitTransferCompletion } from '@/types'
import { getCurrentStaff, getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'

/** 移動計算・需要判定に使う schedule_events の最小形 */
export interface KitScheduleEvent {
  date: string
  store_id: string
  scenario_master_id: string
  start_time?: string
  end_time?: string
  category?: string
  is_cancelled?: boolean
  is_private_request?: boolean
  is_private_booking?: boolean
  current_participants?: number
  capacity?: number
}

interface UseKitManagementDataParams {
  isOpen: boolean
  weekDates: string[]
  selectedOffsetsRef: React.MutableRefObject<number[]>
  setSelectedOffsets: React.Dispatch<React.SetStateAction<number[]>>
  setTransferStartStoreIds: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

export function useKitManagementData({
  isOpen,
  weekDates,
  selectedOffsetsRef,
  setSelectedOffsets,
  setTransferStartStoreIds,
}: UseKitManagementDataParams) {
  // データ
  const [kitLocations, setKitLocations] = useState<KitLocation[]>([])
  const [transferEvents, setTransferEvents] = useState<KitTransferEvent[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [storeTravelTimes, setStoreTravelTimes] = useState<StoreTravelTime[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<KitScheduleEvent[]>([])

  const [loading, setLoading] = useState(false)

  // 移動完了状態（DBから取得）
  const [completions, setCompletions] = useState<KitTransferCompletion[]>([])
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)
  const [currentStaffName, setCurrentStaffName] = useState<string>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // スタッフ情報を取得
      const staff = await getCurrentStaff()
      if (staff) {
        setCurrentStaffId(staff.id)
        setCurrentStaffName(staff.display_name || staff.name || '')
      } else {
        // user_idが紐付いていないスタッフの場合、ログインユーザーIDをフォールバックとして使用
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // ユーザーIDを仮のスタッフIDとして設定（操作履歴の記録用）
          setCurrentStaffId(user.id)
          setCurrentStaffName(user.email?.split('@')[0] || 'ユーザー')
          console.warn('⚠️ スタッフ情報が取得できないため、ログインユーザー情報を使用:', user.id)
        }
      }

      // 組織共有の移動曜日設定を読み込み
      const orgId = await getCurrentOrganizationId()
      if (orgId) {
        const { data: gs } = await supabase
          .from('global_settings')
          .select('kit_transfer_offsets, kit_transfer_start_store_ids')
          .eq('organization_id', orgId)
          .single()
        if (gs?.kit_transfer_offsets && Array.isArray(gs.kit_transfer_offsets)) {
          const offsets = gs.kit_transfer_offsets as number[]
          setSelectedOffsets(offsets)
          selectedOffsetsRef.current = offsets
        }
        if (gs?.kit_transfer_start_store_ids && typeof gs.kit_transfer_start_store_ids === 'object' && !Array.isArray(gs.kit_transfer_start_store_ids)) {
          setTransferStartStoreIds(gs.kit_transfer_start_store_ids as Record<string, string>)
        }
      }

      const [locationsData, storesData, scenariosData, travelTimesData] = await Promise.all([
        kitApi.getKitLocations(),
        storeApi.getAll(),
        scenarioApi.getAll(),
        storeApi.getTravelTimes()
      ])

      // デバッグ: データ取得結果
      console.log('🔧 キット管理データ取得:', {
        locationsCount: locationsData.length,
        scenariosCount: scenariosData.length,
        sampleLocations: locationsData.slice(0, 5).map(l => ({
          id: l.id,
          org_scenario_id: l.org_scenario_id,
          scenario_master_id: l.scenario_master_id,
          scenario_title: l.scenario?.title,
          store_id: l.store_id
        })),
        sampleScenarios: scenariosData.slice(0, 5).map(s => ({
          id: s.id,
          org_scenario_id: (s as { org_scenario_id?: string }).org_scenario_id,
          title: s.title,
          kit_count: s.kit_count
        }))
      })

      setKitLocations(locationsData)
      setStores(storesData)
      setStoreTravelTimes(travelTimesData)
      setScenarios(scenariosData)

      // 週間スケジュールを取得
      // 金曜移動分は翌週月曜までカバーするので、+3日まで取得
      const startDate = weekDates[0]
      const endDateObj = new Date(weekDates[6])
      endDateObj.setDate(endDateObj.getDate() + 3) // 週末+3日（翌週の水曜まで）
      const endDate = endDateObj.toISOString().split('T')[0]
      // キャンセルも含めて取得（キャンセル時に「移動中止」表示するため）
      const eventsData = await scheduleApi.getByDateRange(startDate, endDate, undefined, true)

      // 完了状態を取得（週の開始の1週間前から取得して、前週の公演で今週移動したものも含める）
      const completionsStartDateObj = new Date(weekDates[0])
      completionsStartDateObj.setDate(completionsStartDateObj.getDate() - 7)
      const completionsStartDate = `${completionsStartDateObj.getFullYear()}-${String(completionsStartDateObj.getMonth() + 1).padStart(2, '0')}-${String(completionsStartDateObj.getDate()).padStart(2, '0')}`
      const completionsData = await kitApi.getTransferCompletions(completionsStartDate, endDate)
      setCompletions(completionsData)

      // デバッグログ - scenario_master_id の有無を確認
      console.log('📅 スケジュール取得:', {
        startDate,
        endDate,
        totalEvents: eventsData.length,
        eventsWithScenarioMasterId: eventsData.filter(e => e.scenario_master_id).length,
        cancelledEvents: eventsData.filter(e => e.is_cancelled).length,
        sampleEvents: eventsData.slice(0, 5).map(e => ({
          date: e.date,
          scenario: e.scenario,
          scenario_master_id: e.scenario_master_id,
          store_id: e.store_id,
          is_cancelled: e.is_cancelled
        }))
      })

      // schedule_events は scenario_master_id のみ使用（scenarioMap との整合性のため）
      // is_cancelled, current_participants, capacity も含めて保持
      const processedEvents = eventsData.map(e => ({
        date: e.date,
        store_id: e.store_id || e.venue,
        scenario_master_id: e.scenario_master_id || '',
        start_time: e.start_time || '',
        end_time: e.end_time || '',
        category: e.category || 'open',
        is_cancelled: e.is_cancelled || false,
        is_private_request: e.is_private_request || false,
        is_private_booking: e.is_private_booking || false,
        current_participants: e.current_participants || 0,
        capacity: e.capacity || 0
      })).filter(e => e.scenario_master_id)

      console.log('📅 処理後のイベント:', {
        total: processedEvents.length,
        cancelled: processedEvents.filter(e => e.is_cancelled).length,
        sample: processedEvents.slice(0, 5)
      })

      setScheduleEvents(processedEvents)

      // 移動イベントを取得（週の範囲内のみ）
      const transfersData = await kitApi.getTransferEvents(weekDates[0], weekDates[6])
      setTransferEvents(transfersData)
    } catch (error) {
      console.error('Failed to fetch kit data:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [weekDates, selectedOffsetsRef, setSelectedOffsets, setTransferStartStoreIds])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen, fetchData])

  // リアルタイム購読（完了状態の変更を他ユーザーと同期）
  useEffect(() => {
    if (!isOpen) return

    const channel = supabase
      .channel('kit_transfer_completions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kit_transfer_completions'
        },
        async (payload) => {
          console.log('🔄 リアルタイム更新:', payload)
          // 完了状態を再取得
          const startDate = weekDates[0]
          const endDateObj = new Date(weekDates[6])
          endDateObj.setDate(endDateObj.getDate() + 3)
          const endDate = endDateObj.toISOString().split('T')[0]
          const completionsData = await kitApi.getTransferCompletions(startDate, endDate)
          setCompletions(completionsData)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, weekDates])

  return {
    kitLocations,
    setKitLocations,
    transferEvents,
    stores,
    storeTravelTimes,
    scenarios,
    setScenarios,
    scheduleEvents,
    completions,
    setCompletions,
    currentStaffId,
    currentStaffName,
    loading,
    fetchData,
  }
}
