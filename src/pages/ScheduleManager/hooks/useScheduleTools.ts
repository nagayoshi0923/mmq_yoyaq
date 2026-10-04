/**
 * スケジュール管理の道具（CSV 出力・満席にする・データ修復・誤デモ予約の掃除）の状態と処理。
 * ScheduleManager/index.tsx から中身を変えずに移したもの。表の再読み込みは呼び出し側から渡す。
 */
import { useState } from 'react'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { scheduleApi, salesApi } from '@/lib/api'
import { scheduleManagerReadApi } from '@/lib/api/scheduleManagerReadApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { exportScheduleToCSV, exportScheduleRangeToZip } from '../utils/exportSchedule'
import { type FillSeatsCategory } from '../components/FillSeatsModal'
import { getParticipationFee, type ScenarioPricing } from '@/lib/pricing'
import type { ScheduleEvent } from '@/types/schedule'
import { reservationApi } from '@/lib/reservationApi'
import { buildDemoReservation, countReservedParticipants, demoReservationNumber, hasDemoParticipant, resolveFillSeatsCapacity } from '../utils/fillSeats'

export function useScheduleTools(refetchSchedule: () => void) {
  const [isExporting, setIsExporting] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isFillingSeats, setIsFillingSeats] = useState(false)
  const [isFillSeatsModalOpen, setIsFillSeatsModalOpen] = useState(false)
  const [isFixingData, setIsFixingData] = useState(false)
  const [isCleaningDemo, setIsCleaningDemo] = useState(false)
  const [isFixAllDataConfirmOpen, setIsFixAllDataConfirmOpen] = useState(false)
  const [isCleanupBadDemoConfirmOpen, setIsCleanupBadDemoConfirmOpen] = useState(false)

  // スケジュールCSVエクスポート（期間指定）
  const handleExportRange = async (startYM: string, endYM: string) => {
    setIsExporting(true)
    try {
      const [sy, sm] = startYM.split('-').map(Number)
      const [ey, em] = endYM.split('-').map(Number)
      const totalMonths = (ey - sy) * 12 + (em - sm) + 1

      if (totalMonths === 1) {
        const lastDay = new Date(sy, sm, 0).getDate()
        const startDate = `${startYM}-01`
        const endDate = `${startYM}-${String(lastDay).padStart(2, '0')}`
        const rows = await salesApi.getScheduleExportData(startDate, endDate)
        exportScheduleToCSV(rows, startYM.replace('-', ''))
      } else {
        const monthlyData: { yearMonth: string; rows: Awaited<ReturnType<typeof salesApi.getScheduleExportData>> }[] = []
        for (let i = 0; i < totalMonths; i++) {
          const d = new Date(sy, sm - 1 + i, 1)
          const y = d.getFullYear()
          const m = d.getMonth() + 1
          const ym = `${y}-${String(m).padStart(2, '0')}`
          const lastDay = new Date(y, m, 0).getDate()
          const startDate = `${ym}-01`
          const endDate = `${ym}-${String(lastDay).padStart(2, '0')}`
          const rows = await salesApi.getScheduleExportData(startDate, endDate)
          monthlyData.push({ yearMonth: ym.replace('-', ''), rows })
        }
        const rangeLabel = `${startYM.replace('-', '')}-${endYM.replace('-', '')}`
        await exportScheduleRangeToZip(monthlyData, rangeLabel)
      }

      setIsExportModalOpen(false)
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : 'CSVエクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  // D-5d: 対象公演数のカウント（FillSeatsModal の確認ステップ用。handleFillAllSeats 冒頭の SELECT と同一条件）
  // カテゴリ別の内訳表示のため、選択カテゴリごとに count クエリを並列実行する
  const fetchFillSeatsTargetCount = async (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }): Promise<{ total: number; byCategory: { category: FillSeatsCategory; count: number }[] }> => {
    const { startDate, endDate, categories } = params
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      throw new Error('組織情報が取得できません')
    }
    const results = await Promise.all(
      categories.map(async (cat) => {
        const { count, error } = await scheduleManagerReadApi.countEventsByCategory(orgId, startDate, endDate, cat)
        if (error) {
          throw new Error(getSafeErrorMessage(error, '対象件数の取得に失敗しました'))
        }
        return { category: cat, count: count ?? 0 }
      })
    )
    const total = results.reduce((sum, r) => sum + r.count, 0)
    return { total, byCategory: results }
  }

  // 中止以外を満席にする処理（参加者数を定員に合わせる）
  const handleFillAllSeats = async (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }) => {
    const { startDate, endDate, categories } = params

    setIsFillingSeats(true)
    try {
      // 組織IDを最初に取得
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        return
      }

      // まず対象のイベントを取得（シナリオの定員情報も含む、現在の組織のみ）
      const { data: events, error: fetchError } = await scheduleManagerReadApi.listEventsForRecalculation(orgId, startDate, endDate, categories)
      
      if (fetchError) {
        showToast.error(getSafeErrorMessage(fetchError, 'データの取得に失敗しました'))
        return
      }
      
      logger.log(`📊 満席処理対象: ${startDate} 〜 ${endDate} (${categories.join(',')}) ${events?.length || 0}件`)
      
      // シナリオ情報を一括取得（参加費・所要時間）
      const scenarioMasterIds = [...new Set(
        (events || [])
          .map(e => e.scenario_master_id || e.scenario_id)
          .filter(Boolean)
      )]
      
      const scenarioInfoMap = new Map<string, { duration: number; pricing: ScenarioPricing }>()
      if (scenarioMasterIds.length > 0) {
        const { data: scenarioInfos } = await scheduleManagerReadApi.listScenarioPricing(orgId, scenarioMasterIds)

        scenarioInfos?.forEach(s => {
          if (s.scenario_master_id) {
            scenarioInfoMap.set(s.scenario_master_id, {
              duration: s.duration || 120,
              pricing: {
                participation_fee: s.participation_fee ?? null,
                gm_test_participation_fee: s.gm_test_participation_fee ?? null,
                participation_costs: s.participation_costs ?? null,
              },
            })
          }
        })
      }
      
      // 対象イベントIDを抽出して一括で予約を取得（バッチ分割でURL長制限回避）
      const eventIds = (events || []).map(e => e.id)
      const BATCH_SIZE = 100
      const allReservations: Array<{ schedule_event_id: string; participant_count: number; participant_names: string[] | null }> = []
      
      for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batchIds = eventIds.slice(i, i + BATCH_SIZE)
        const { data } = await scheduleManagerReadApi.listActiveReservationsByEventIds(batchIds)
        if (data) {
          allReservations.push(...(data as typeof allReservations))
        }
      }
      
      // イベントIDごとに予約をグループ化
      const reservationsByEvent = new Map<string, typeof allReservations>()
      allReservations.forEach(r => {
        const list = reservationsByEvent.get(r.schedule_event_id) || []
        list.push(r)
        reservationsByEvent.set(r.schedule_event_id, list)
      })
      
      // 各イベントの参加者数を定員に合わせ、デモ参加者の予約レコードを一括作成
      const demoReservations: Array<ReturnType<typeof buildDemoReservation>> = []
      const eventsToUpdate: Array<{ id: string; newCount: number }> = []
      
      const now = new Date()
      
      for (const event of events || []) {
        // シナリオJOIN → イベントのmax_participants → capacity → デフォルト8人（capacity を超えない）
        const maxParticipants = resolveFillSeatsCapacity(event)
        
        // 既に満席ならスキップ
        if ((event.current_participants || 0) >= maxParticipants) {
          continue
        }
        
        // 予約情報を取得（一括取得済み）
        const reservations = reservationsByEvent.get(event.id) || []
        const neededParticipants = maxParticipants - countReservedParticipants(reservations)
        
        // 足りない分だけデモ参加者を追加（既にデモ参加者がいれば追加しない）
        if (neededParticipants > 0 && !hasDemoParticipant(reservations)) {
          // シナリオ情報を取得（一括取得済み）
          const scenarioMasterId = event.scenario_master_id || event.scenario_id
          const scenarioInfo = scenarioMasterId ? scenarioInfoMap.get(scenarioMasterId) : null
          const isGmTest = (event as { category?: string }).category === 'gmtest'
          const participationFee = getParticipationFee(scenarioInfo?.pricing, isGmTest ? 'gmtest' : 'normal')
          const duration = scenarioInfo?.duration || 120
          
          demoReservations.push(buildDemoReservation({
            event, organizationId: orgId, neededParticipants, participationFee, duration,
            // 予約番号（公演ごとにランダム）
            reservationNumber: demoReservationNumber(now),
          }))
          
          eventsToUpdate.push({ id: event.id, newCount: maxParticipants })
        }
      }
      
      logger.log(`📊 デモ参加者追加: ${demoReservations.length}件`)
      
      // バッチサイズ（Supabaseの制限を考慮）
      const INSERT_BATCH_SIZE = 50
      
      // デモ参加者予約をバッチでinsert
      if (demoReservations.length > 0) {
        for (let i = 0; i < demoReservations.length; i += INSERT_BATCH_SIZE) {
          const batch = demoReservations.slice(i, i + INSERT_BATCH_SIZE)
          const { error: insertError } = await reservationApi.insertDirect(batch)
          
          if (insertError) {
            logger.error(`デモ参加者の予約作成エラー (バッチ ${Math.floor(i / BATCH_SIZE) + 1}):`, insertError)
          }
        }
        
        // 参加者数をバッチで更新
        for (let i = 0; i < eventsToUpdate.length; i += BATCH_SIZE) {
          const batch = eventsToUpdate.slice(i, i + BATCH_SIZE)
          await Promise.all(
            batch.map(({ id, newCount }) => scheduleApi.setCurrentParticipants(id, newCount))
          )
        }
      }
      
      showToast.success(`${eventsToUpdate.length}件を満席に設定しました`)
      // Realtimeで自動的にデータが更新されるため、ページリロードは不要
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsFillingSeats(false)
    }
  }

  // 単体イベントを満席にする（デモ参加者で埋める）
  const handleFillSeatsForEvent = async (event: ScheduleEvent) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        return
      }

      // 最新の event 情報と既存予約を取得
      const { data: ev, error: evError } = await scheduleManagerReadApi.findEventForRecalculation(event.id)
      if (evError || !ev) {
        showToast.error(getSafeErrorMessage(evError, 'イベント情報の取得に失敗しました'))
        return
      }

      const maxParticipants = resolveFillSeatsCapacity(ev)

      if ((ev.current_participants || 0) >= maxParticipants) {
        showToast.info('既に満席です')
        return
      }

      const { data: reservations } = await scheduleManagerReadApi.listActiveReservationCounts(ev.id)

      const neededParticipants = maxParticipants - countReservedParticipants(reservations || [])

      if (neededParticipants <= 0 || hasDemoParticipant(reservations || [])) {
        // current_participants だけ揃える
        await scheduleApi.setCurrentParticipants(ev.id, maxParticipants)
        showToast.success('満席に設定しました')
        return
      }

      // シナリオ情報取得（参加費・所要時間）
      const scenarioMasterId = ev.scenario_master_id || ev.scenario_id
      let participationFee = 0
      let duration = 120
      if (scenarioMasterId) {
        const { data: scenarioInfo } = await scheduleManagerReadApi.findScenarioPricing(orgId, scenarioMasterId)
        if (scenarioInfo) {
          const isGmTest = ev.category === 'gmtest'
          participationFee = getParticipationFee(scenarioInfo as ScenarioPricing, isGmTest ? 'gmtest' : 'normal')
          duration = scenarioInfo.duration || 120
        }
      }
      const { error: insertError } = await reservationApi.insertDirect(buildDemoReservation({
        event: ev, organizationId: orgId, neededParticipants, participationFee, duration,
        reservationNumber: demoReservationNumber(),
      }))
      if (insertError) {
        showToast.error(getSafeErrorMessage(insertError, 'デモ参加者の作成に失敗しました'))
        return
      }

      await scheduleApi.setCurrentParticipants(ev.id, maxParticipants)

      showToast.success(`満席に設定しました（デモ参加者 ${neededParticipants}名追加）`)
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    }
  }

  // 全期間のデータ修復（予約レコードがないのにcurrent_participantsが設定されている公演を修復）
  const handleFixAllData = () => {
    setIsFixAllDataConfirmOpen(true)
  }

  const runFixAllData = async () => {
    setIsFixingData(true)
    try {
      const result = await scheduleApi.addDemoParticipantsToAllActiveEvents()
      if (result.success) {
        showToast.success(result.message || 'データ修復完了')
        refetchSchedule()
      } else {
        showToast.error('データ修復に失敗しました')
      }
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsFixingData(false)
    }
  }

  // テストプレイの誤デモ予約削除 & GMテスト参加費の修正
  const handleCleanupBadDemoReservations = () => {
    setIsCleanupBadDemoConfirmOpen(true)
  }

  const runCleanupBadDemoReservations = async () => {
    setIsCleaningDemo(true)
    let deletedCount = 0
    let fixedCount = 0

    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) {
        showToast.error('組織情報が取得できません')
        setIsCleaningDemo(false)
        return
      }

      // ─── ① テストプレイのデモ予約を削除 ───
      const { data: testplayEvents } = await scheduleManagerReadApi.listTestplayEventIds(orgId)

      if (testplayEvents && testplayEvents.length > 0) {
        const testplayIds = testplayEvents.map(e => e.id)
        const { data: demoReservations } = await scheduleManagerReadApi.listDemoReservationsByEventIds(orgId, testplayIds)

        if (demoReservations && demoReservations.length > 0) {
          const ids = demoReservations.map(r => r.id)
          await reservationApi.deleteDirectByIds(ids)
          deletedCount = ids.length

          const affectedIds = [...new Set(demoReservations.map(r => r.schedule_event_id))]
          await Promise.all(affectedIds.map(id => recalculateCurrentParticipants(id)))
        }
      }

      // ─── ② GMテストのデモ予約の参加費を修正 ───
      const { data: gmtestEvents } = await scheduleManagerReadApi.listGmtestEvents(orgId)

      if (gmtestEvents && gmtestEvents.length > 0) {
        const gmtestIds = gmtestEvents.map(e => e.id)
        const eventScenarioMap = new Map(gmtestEvents.map(e => [e.id, e.scenario_master_id]))

        const { data: demoReservations } = await scheduleManagerReadApi.listDemoReservationsWithCountByEventIds(orgId, gmtestIds)

        if (demoReservations && demoReservations.length > 0) {
          const scenarioMasterIds = [...new Set(gmtestEvents.map(e => e.scenario_master_id).filter(Boolean))]
          const { data: orgScenarios } = await scheduleManagerReadApi.listScenarioFees(orgId, scenarioMasterIds)

          const feeMap = new Map(orgScenarios?.map(s => [s.scenario_master_id, s]) || [])

          await Promise.all(
            demoReservations.map(async (r) => {
              const scenarioMasterId = eventScenarioMap.get(r.schedule_event_id)
              const scenarioInfo = scenarioMasterId ? feeMap.get(scenarioMasterId) : null
              const correctFee = getParticipationFee(scenarioInfo as ScenarioPricing | null, 'gmtest')
              const totalPrice = correctFee * (r.participant_count || 1)

              await reservationApi.updatePricesDirect(r.id, { base_price: totalPrice, total_price: totalPrice, final_price: totalPrice })
              fixedCount++
            })
          )
        }
      }

      const messages: string[] = []
      if (deletedCount > 0) messages.push(`テストプレイの誤デモ予約 ${deletedCount}件を削除`)
      if (fixedCount > 0) messages.push(`GMテストの参加費 ${fixedCount}件を修正`)
      if (messages.length === 0) messages.push('修正対象はありませんでした')
      showToast.success(messages.join('、'))
      refetchSchedule()
    } catch (err) {
      showToast.error(getSafeErrorMessage(err, 'エラーが発生しました'))
    } finally {
      setIsCleaningDemo(false)
    }
  }

  return {
    isExporting,
    setIsExporting,
    isExportModalOpen,
    setIsExportModalOpen,
    isFillingSeats,
    setIsFillingSeats,
    isFillSeatsModalOpen,
    setIsFillSeatsModalOpen,
    isFixingData,
    setIsFixingData,
    isCleaningDemo,
    setIsCleaningDemo,
    isFixAllDataConfirmOpen,
    setIsFixAllDataConfirmOpen,
    isCleanupBadDemoConfirmOpen,
    setIsCleanupBadDemoConfirmOpen,
    handleExportRange,
    fetchFillSeatsTargetCount,
    handleFillAllSeats,
    handleFillSeatsForEvent,
    handleFixAllData,
    runFixAllData,
    handleCleanupBadDemoReservations,
    runCleanupBadDemoReservations,
  }
}
