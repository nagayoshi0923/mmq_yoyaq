// スケジュールデータの読み込みと管理

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { logger } from '@/utils/logger'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { useScheduleEventsQuery, invalidateScheduleMonth, setScheduleMonthData, updateScenarioModuleCache, scheduleEventKeys, fetchScheduleEventsForMonth } from './useScheduleEventsQuery'

// 過去の定員未満の公演にデモ参加者を追加する関数
export async function addDemoParticipantsToPastUnderfullEvents(): Promise<{ success: number; failed: number; skipped: number }> {
  const today = new Date()
  today.setHours(23, 59, 59, 999) // 今日を含める
  
  let successCount = 0
  let failedCount = 0
  let skippedCount = 0
  
  try {
    // 組織IDを取得（マルチテナント対応）
    const orgId = await getCurrentOrganizationId()
    if (!orgId) {
      logger.error('組織情報が取得できません')
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    // デモ顧客を取得（組織でフィルタ）
    const customerQuery = supabase
      .from('customers')
      .select('id, name')
      .or('name.ilike.%デモ%,email.ilike.%demo%')
      .eq('organization_id', orgId)
      .limit(1)
    
    const { data: demoCustomer, error: customerError } = await customerQuery.single()
    
    if (customerError || !demoCustomer) {
      logger.error('デモ顧客が見つかりません:', customerError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    logger.log(`デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`)
    
    // 今日以前の公演を取得（中止されていない、カテゴリーがopenまたはgmtest、組織でフィルタ）
    const { data: pastEvents, error: eventsError } = await supabase
      .from('schedule_events_staff_view')
      .select(`
        id,
        date,
        venue,
        scenario,
        scenario_master_id,
        gms,
        start_time,
        end_time,
        category,
        is_cancelled,
        current_participants,
        capacity,
        organization_id,
        scenario_masters:scenario_master_id (
          player_count_max
        )
      `)
      .eq('organization_id', orgId)
      .lte('date', today.toISOString().split('T')[0])
      .eq('is_cancelled', false)
      .in('category', ['open', 'gmtest'])
      .order('date', { ascending: false })
    
    if (eventsError) {
      logger.error('過去の公演取得エラー:', eventsError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    if (!pastEvents || pastEvents.length === 0) {
      logger.log('対象の過去公演がありません')
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    // 組織のシナリオデータを取得（player_count_max のオーバーライド反映）
    const { data: orgScenarios } = await supabase
      .from('organization_scenarios_with_master')
      .select('id, title, player_count_max')
      .eq('organization_id', orgId)
    
    const orgScenarioMap = new Map<string, number>()
    if (orgScenarios) {
      for (const row of orgScenarios) {
        if (row.player_count_max) {
          orgScenarioMap.set(row.id, row.player_count_max)
          if (row.title) orgScenarioMap.set(row.title, row.player_count_max)
        }
      }
    }
    
    logger.log(`対象公演: ${pastEvents.length}件`)
    
    for (const event of pastEvents) {
      const currentParticipants = event.current_participants || 0
      const scenarioMasterData = event.scenario_masters as { player_count_max?: number } | null
      const maxParticipants = (event.scenario_master_id && orgScenarioMap.get(event.scenario_master_id))
        || (event.scenario && orgScenarioMap.get(event.scenario))
        || scenarioMasterData?.player_count_max
        || event.capacity
        || 8
      
      // 定員に達している場合はスキップ
      if (currentParticipants >= maxParticipants) {
        skippedCount++
        continue
      }
      
      // 既存のデモ参加者がいるかチェック（組織でフィルタ）
      const { data: existingReservations, error: reservationCheckError } = await supabase
        .from('reservations')
        .select('id, participant_names, reservation_source')
        .eq('schedule_event_id', event.id)
        .eq('organization_id', orgId)
        .in('status', ['confirmed', 'pending'])
      
      if (reservationCheckError) {
        logger.error('予約チェックエラー:', reservationCheckError)
        failedCount++
        continue
      }
      
      // 既にdemo_autoで追加された予約があるか、または無記名（空配列）の予約があるかチェック
      const hasDemoParticipant = existingReservations?.some(r =>
        r.reservation_source === RESERVATION_SOURCE.DEMO_AUTO ||
        !r.participant_names || 
        r.participant_names.length === 0 ||
        r.participant_names?.includes('デモ参加者') || 
        r.participant_names?.some((name: string) => name.includes('デモ'))
      )
      
      if (hasDemoParticipant) {
        skippedCount++
        continue
      }
      
      // 不足人数を計算
      const shortfall = maxParticipants - currentParticipants
      
      // シナリオ情報を取得（シナリオ名が空の場合はスキップ）
      if (!event.scenario || event.scenario.trim() === '') {
        logger.log('シナリオ名が空のためスキップ:', event.id)
        skippedCount++
        continue
      }

      // シナリオ情報を取得（組織固有設定: organization_scenarios_with_master）
      const { data: scenario, error: scenarioError } = await supabase
        .from('organization_scenarios_with_master')
        .select('id, title, duration, participation_fee, gm_test_participation_fee')
        .eq('title', event.scenario.trim())
        .eq('organization_id', orgId)
        .maybeSingle()
      
      if (scenarioError) {
        logger.error('シナリオ取得エラー:', scenarioError)
        failedCount++
        continue
      }

      if (!scenario) {
        logger.log('シナリオが見つかりません:', event.scenario)
        skippedCount++
        continue
      }
      
      // 参加費を計算
      const isGmTest = event.category === 'gmtest'
      const participationFee = isGmTest 
        ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
        : (scenario?.participation_fee || 0)
      
      // 店舗名から店舗IDを取得（組織でフィルタ）
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .or(`name.eq.${sanitizeForPostgRestFilter(event.venue)},short_name.eq.${sanitizeForPostgRestFilter(event.venue)}`)
        .eq('organization_id', orgId)
        .single()
      
      if (storeError) {
        logger.error('店舗ID取得エラー:', storeError)
        failedCount++
        continue
      }
      
      // durationを数値に変換（文字列の場合はパース、失敗したら120分デフォルト）
      let durationMinutes = 120
      if (scenario?.duration) {
        const parsed = parseInt(String(scenario.duration), 10)
        if (!isNaN(parsed) && parsed > 0) {
          durationMinutes = parsed
        }
      }

      // デモ参加者の予約を作成（不足人数分）
      // participant_namesを空配列にすることで「無記名 = デモ参加者」として扱われる
      // customer_idにデモ顧客を設定
      const demoReservation = {
        schedule_event_id: event.id,
        title: event.scenario || '',
        scenario_master_id: scenario?.id || null,
        store_id: store?.id || null,
        customer_id: demoCustomer.id, // デモ顧客を設定
        customer_notes: `デモ参加者（自動追加） - ${shortfall}名`,
        requested_datetime: `${event.date}T${event.start_time}+09:00`,
        duration: durationMinutes,
        participant_count: shortfall,
        participant_names: [], // 空配列 = 無記名 = デモ参加者
        assigned_staff: event.gms || [],
        base_price: participationFee * shortfall,
        options_price: 0,
        total_price: participationFee * shortfall,
        discount_amount: 0,
        final_price: participationFee * shortfall,
        payment_method: 'onsite',
        payment_status: 'paid',
        status: 'confirmed',
        reservation_source: RESERVATION_SOURCE.DEMO_AUTO,
        organization_id: event.organization_id // マルチテナント対応
      }

      const { error: insertError } = await supabase
        .from('reservations')
        .insert(demoReservation)
      
      if (insertError) {
        logger.error(`デモ参加者追加エラー [${event.date} ${event.scenario}]:`, insertError)
        failedCount++
      } else {
        logger.log(`✅ デモ参加者追加成功: ${event.date} ${event.scenario} (${shortfall}名追加)`)
        successCount++
      }
    }
    
    logger.log(`処理完了 - 成功: ${successCount}, スキップ: ${skippedCount}, 失敗: ${failedCount}`)
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  } catch (error) {
    logger.error('処理エラー:', error)
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  }
}

/** スタッフ×担当シナリオ取得の同時リクエスト数（大量並列でブラウザ／DBが詰まるのを防ぐ） */
const STAFF_ASSIGNMENT_CHUNK = 8

async function mapInChunks<T, R>(
  items: readonly T[],
  chunkSize: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    out.push(...(await Promise.all(chunk.map(mapper))))
  }
  return out
}

interface Store {
  id: string
  name: string
  short_name: string
}

interface Scenario {
  id: string
  title: string
  player_count_max?: number
}

function readInitialScheduleScenariosFromSession(): Scenario[] {
  try {
    const cached = sessionStorage.getItem('scheduleScenarios')
    return cached ? JSON.parse(cached) : []
  } catch {
    return []
  }
}

export function useScheduleData(currentDate: Date) {
  // 一度でもロードしたかをsessionStorageで確認（より確実）
  const hasEverLoadedStores = useRef(
    (() => {
      try {
        return sessionStorage.getItem('scheduleHasLoaded') === 'true'
      } catch {
        return false
      }
    })()
  )

  const queryClient = useQueryClient()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const { data: events = [], isLoading, isFetching, error: queryError } = useScheduleEventsQuery(currentDate)
  const error = queryError ? String(queryError) : null

  // スケジュール閲覧中、ブラウザがアイドルになったら前後3ヶ月を先読み
  // requestIdleCallback で UI への影響ゼロ
  useEffect(() => {
    const run = () => {
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue // 当月は useScheduleEventsQuery が担当
        const d = new Date(year, month - 1 + i, 1)
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        queryClient.prefetchQuery({
          queryKey: scheduleEventKeys.month(y, m),
          queryFn: () => fetchScheduleEventsForMonth(y, m),
          staleTime: Infinity,
        })
      }
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 5000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(run, 2000)
    return () => clearTimeout(id)
  }, [year, month, queryClient])

  // 店舗・シナリオ・スタッフのデータ（キャッシュから初期化して即座に表示）
  const [stores, setStores] = useState<Store[]>(() => {
    try {
      const cached = sessionStorage.getItem('scheduleStores')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  const [storesLoading, setStoresLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('scheduleStores')
      return !cached
    } catch {
      return true
    }
  })
  const [staff, setStaff] = useState<Staff[]>(() => {
    try {
      const cached = sessionStorage.getItem('scheduleStaff')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })
  // loadEvents 内で staff を参照するための ref（依存配列に入れると二重実行になるため）
  const staffRef = useRef<Staff[]>(staff)
  const [staffLoading, setStaffLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('scheduleStaff')
      return !cached
    } catch {
      return true
    }
  })
  
  // React Queryを使ってシナリオデータを取得（自動更新される）
  const { data: scenariosData = [], isLoading: scenariosLoading } = useScenariosQuery()
  
  // React Queryのデータをstateに同期（後方互換性のため）
  // キャッシュから初期化して即座に表示
  const [scenarios, setScenarios] = useState<Scenario[]>(readInitialScheduleScenariosFromSession)
  /** loadEvents / fetchSchedule 用。React Query 同期済みなら scenarioApi.getAll を省略 */
  const mergedScenariosForScheduleRef = useRef<Scenario[]>(readInitialScheduleScenariosFromSession())
  const [orgScenarioOverrides, setOrgScenarioOverrides] = useState<Map<string, {
    duration?: number | null
    participation_fee?: number | null
    extra_preparation_time?: number | null
  }>>(new Map())
  
  // React Queryのデータが更新されたらstateに同期（メモ化して不要な再レンダリングを防ぐ）
  const scenariosRef = useRef<Scenario[]>([])
  const scenariosStringRef = useRef<string>('')
  useEffect(() => {
    // データが実際に変更されたときだけ更新（効率的な比較）
    const prevLength = scenariosRef.current.length
    const currentString = scenariosStringRef.current
    const mergedScenarios = scenariosData.map((scenario) => {
      const masterId = scenario.scenario_master_id || ''
      const override = masterId ? orgScenarioOverrides.get(masterId) : undefined
      if (!override) return scenario
      return {
        ...scenario,
        duration: override.duration ?? scenario.duration,
        participation_fee: override.participation_fee ?? scenario.participation_fee,
        extra_preparation_time: override.extra_preparation_time ?? scenario.extra_preparation_time
      }
    })
    const newString = mergedScenarios.length > 0 ? JSON.stringify(mergedScenarios) : ''
    
    // 文字列比較で内容が変わったかチェック（長さチェックを先に実行）
    if (mergedScenarios.length !== prevLength || currentString !== newString) {
      scenariosRef.current = scenariosData
      scenariosStringRef.current = newString
      mergedScenariosForScheduleRef.current = mergedScenarios
      setScenarios(mergedScenarios)
      updateScenarioModuleCache(mergedScenarios)
      // sessionStorageへの書き込みは初回のみ、または大幅に変更があった場合のみ（パフォーマンス改善）
      if (mergedScenarios.length > 0 && (prevLength === 0 || Math.abs(mergedScenarios.length - prevLength) > 5)) {
        sessionStorage.setItem('scheduleScenarios', newString)
      }
      logger.log('🔄 シナリオデータをstateに同期:', mergedScenarios.length)
    }
  }, [scenariosData, orgScenarioOverrides])

  // 組織シナリオの上書き設定を取得（新UIの組織設定を反映）
  useEffect(() => {
    const loadOrgScenarioOverrides = async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        if (!orgId) return
        const { data, error } = await supabase
          .from('organization_scenarios_with_master')
          .select('scenario_master_id, duration, participation_fee, extra_preparation_time')
          .eq('organization_id', orgId)
        if (error) {
          logger.error('組織シナリオ設定の取得に失敗:', error)
          return
        }
        const map = new Map<string, { duration?: number | null; participation_fee?: number | null; extra_preparation_time?: number | null }>()
        data?.forEach((row) => {
          if (row.scenario_master_id) {
            map.set(row.scenario_master_id, {
              duration: row.duration ?? null,
              participation_fee: row.participation_fee ?? null,
              extra_preparation_time: row.extra_preparation_time ?? null
            })
          }
        })
        setOrgScenarioOverrides(map)
      } catch (err) {
        logger.error('組織シナリオ設定の取得エラー:', err)
      }
    }
    loadOrgScenarioOverrides()
  }, [])

  // 初期データを並列で読み込む（高速化）
  // キャッシュがある場合はバックグラウンドで更新、ない場合のみローディング表示
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // キャッシュがない場合のみローディング状態にする
        // キャッシュがある場合はバックグラウンドで静かに更新
        const hasCachedStores = stores.length > 0
        const hasCachedStaff = staff.length > 0
        
        if (!hasCachedStores) {
          setStoresLoading(true)
        }
        if (!hasCachedStaff) {
          setStaffLoading(true)
        }
        
        // 店舗・スタッフを並列で読み込み（シナリオはReact Queryが管理）
        // includeTemporary: false で通常の店舗のみ取得（臨時会場は useTemporaryVenues で管理）
        // excludeOffice: false でオフィスも表示（スケジュール管理では全店舗を表示）
        const orgId = await getCurrentOrganizationId()
        const [storeData, staffData] = await Promise.all([
          storeApi.getAll(false, undefined, undefined, false).catch(err => {
            logger.error('店舗データの読み込みエラー:', err)
            return []
          }),
          staffApi.getAll().catch(err => {
            logger.error('スタッフデータの読み込みエラー:', err)
            return []
          })
        ])
        
        setStores(storeData)
        sessionStorage.setItem('scheduleStores', JSON.stringify(storeData))
        if (storeData.length > 0) {
          hasEverLoadedStores.current = true
          sessionStorage.setItem('scheduleHasLoaded', 'true')
        }
        setStoresLoading(false)

        // スタッフ基本情報を先に反映（貸切予約のGM名参照用）
        staffRef.current = staffData
        setStaff(staffData)

        // スタッフの担当シナリオをチャンク並列で取得（数十人同時だと接続・CPUが重くなるのを緩和）
        const staffWithScenarios = await mapInChunks(
          staffData,
          STAFF_ASSIGNMENT_CHUNK,
          async (staffMember) => {
            try {
              const assignments = await assignmentApi.getStaffAssignments(staffMember.id, orgId || undefined)
              const scenarioIds = assignments.map((a: { scenario_id: string }) => a.scenario_id)
              return {
                ...staffMember,
                special_scenarios: scenarioIds
              }
            } catch {
              return {
                ...staffMember,
                special_scenarios: []
              }
            }
          }
        )

        staffRef.current = staffWithScenarios
        setStaff(staffWithScenarios)
        sessionStorage.setItem('scheduleStaff', JSON.stringify(staffWithScenarios))
        setStaffLoading(false)
      } catch (err) {
        logger.error('初期データの読み込みエラー:', err)
        setStoresLoading(false)
        setStaffLoading(false)
      }
    }
    
    loadInitialData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  

  // setEvents: 楽観的更新のためのラッパー（React Queryキャッシュを更新）
  const setEvents = useCallback((updater: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])) => {
    setScheduleMonthData(queryClient, year, month, updater)
  }, [queryClient, year, month])

  // シナリオリストを再読み込み
  const refetchScenarios = async () => {
    try {
      const scenarioData = await scenarioApi.getAll()
      mergedScenariosForScheduleRef.current = scenarioData
      setScenarios(scenarioData)
      sessionStorage.setItem('scheduleScenarios', JSON.stringify(scenarioData))
    } catch (err) {
      logger.error('シナリオデータの再読み込みエラー:', err)
    }
  }

  // スタッフリストを再読み込み
  const refetchStaff = async () => {
    try {
      const staffData = await staffApi.getAll()
      setStaff(staffData)
      sessionStorage.setItem('scheduleStaff', JSON.stringify(staffData))
    } catch (err) {
      logger.error('スタッフデータの再読み込みエラー:', err)
    }
  }

  // スケジュールデータを再取得する関数（React Queryキャッシュを無効化して再フェッチ）
  const fetchSchedule = useCallback(async () => {
    invalidateScheduleMonth(queryClient, year, month)
  }, [queryClient, year, month])

  // リアルタイム購読（複数ユーザー対応）
  // デバウンス用のタイマーref（バッチ更新時の大量通知を防ぐ）
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFetchRef = useRef(false)
  
  useEffect(() => {
    const yearLocal = currentDate.getFullYear()
    const monthLocal = currentDate.getMonth() + 1
    const monthStart = `${yearLocal}-${String(monthLocal).padStart(2, '0')}-01`
    const monthEnd = `${yearLocal}-${String(monthLocal).padStart(2, '0')}-31`

    // デバウンス付きfetchSchedule（500ms以内の連続イベントをまとめる）
    const debouncedFetchSchedule = () => {
      pendingFetchRef.current = true
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      realtimeDebounceRef.current = setTimeout(() => {
        if (pendingFetchRef.current) {
          logger.log('🔄 Realtime: デバウンス後にデータ再取得')
          pendingFetchRef.current = false
          invalidateScheduleMonth(queryClient, yearLocal, monthLocal)
        }
      }, 500)
    }
    
    // schedule_events テーブルの変更を購読
    const scheduleChannel = supabase
      .channel('schedule_events_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE すべて
          schema: 'public',
          table: 'schedule_events'
          // フィルターなし（すべての変更を受信し、クライアント側でフィルタリング）
        },
        (payload) => {
          // 現在表示中の月のイベントのみ処理
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const newDate = newRecord?.date
          const oldDate = oldRecord?.date
          
          const newDateInRange = newDate && newDate >= monthStart && newDate <= monthEnd
          const oldDateInRange = oldDate && oldDate >= monthStart && oldDate <= monthEnd
          
          // 両方の日付が範囲外の場合は無視
          if (!newDateInRange && !oldDateInRange) {
            logger.log('⏭️ Realtime: 対象外の月のため無視', newDate || oldDate)
            return
          }
          
          logger.log('📡 Realtime: schedule_events 変更検知', payload.eventType, newDate || oldDate)
          
          // デバウンス付きでデータを再取得（バッチ更新時の大量リクエストを防ぐ）
          debouncedFetchSchedule()
        }
      )
      .subscribe()

    // reservations テーブルの変更を購読（貸切予約）
    const reservationsChannel = supabase
      .channel('reservations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations'
          // フィルターなし（すべての変更を受信）
        },
        (payload) => {
          const reservation = (payload.new || payload.old) as { reservation_source?: string; status?: string } | null
          
          // web_private かつ confirmed のみ処理
          if (reservation?.reservation_source !== RESERVATION_SOURCE.WEB_PRIVATE || reservation?.status !== 'confirmed') {
            logger.log('⏭️ Realtime: 対象外の予約のため無視')
            return
          }
          
          logger.log('📡 Realtime: reservations 変更検知', payload.eventType)
          
          // デバウンス付きでデータを再取得
          debouncedFetchSchedule()
        }
      )
      .subscribe()

    // クリーンアップ
    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      supabase.removeChannel(scheduleChannel)
      supabase.removeChannel(reservationsChannel)
      logger.log('🔌 Realtime: 購読解除')
    }
  }, [currentDate, queryClient]) // currentDate が変わったら再購読（scenariosは参照で取得）

  return {
    events,
    setEvents,
    stores,
    scenarios,
    staff,
    isLoading,
    isFetching,
    error,
    storesLoading,
    scenariosLoading,
    staffLoading,
    hasEverLoadedStores: hasEverLoadedStores.current,
    refetchScenarios,
    refetchStaff,
    fetchSchedule
  }
}

