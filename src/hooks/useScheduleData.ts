// スケジュールデータの読み込みと管理

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { useScheduleEventsQuery, invalidateScheduleMonth, setScheduleMonthData, updateScenarioModuleCache, scheduleEventKeys, fetchScheduleEventsForMonth } from './useScheduleEventsQuery'

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

  // 月変化時に即座に ±3 をプリフェッチ
  // キャッシュ済みの月は prefetchQuery が自動スキップするので実際にフェッチするのは未取得月のみ
  // → 月移動を連続で行ってもidle待ちなしに隣接月が確保される
  useEffect(() => {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const d = new Date(year, month - 1 + i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      queryClient.prefetchQuery({
        queryKey: scheduleEventKeys.month(y, m),
        queryFn: () => fetchScheduleEventsForMonth(y, m),
        staleTime: Infinity,
      })
    }
  }, [year, month, queryClient])

  // idle 時に ±4〜6 まで拡張（余裕があれば先読み、なければスキップ）
  useEffect(() => {
    const prefetchFar = () => {
      for (let i = -6; i <= 6; i++) {
        if (Math.abs(i) <= 3 || i === 0) continue
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
      const id = requestIdleCallback(prefetchFar)
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(prefetchFar, 5000)
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

        // スタッフの担当シナリオを 1 リクエスト (最大 50 件) で一括取得
        // 旧実装は staff ごとの N+1 リクエストでチャンク並列していたが、
        // 数十人いるとブラウザ→Edge Function 間のラウンドトリップが詰まるため
        // バッチエンドポイント (/api/assignments?staff_ids=...) に集約
        let staffWithScenarios = staffData
        try {
          const batch = await assignmentApi.getBatchStaffAssignments(
            staffData.map((s) => s.id),
            orgId || undefined
          )
          staffWithScenarios = staffData.map((staffMember) => ({
            ...staffMember,
            special_scenarios: batch.get(staffMember.id)?.gmScenarios ?? [],
          }))
        } catch (err) {
          logger.error('スタッフ担当シナリオ一括取得エラー:', err)
          staffWithScenarios = staffData.map((s) => ({ ...s, special_scenarios: [] }))
        }

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
    await queryClient.invalidateQueries({ queryKey: scheduleEventKeys.month(year, month) })
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
