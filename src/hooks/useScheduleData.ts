// スケジュールデータの読み込みと管理

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { scheduleApi, storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { handleSupabaseError, getUserFriendlyMessage, logApiError } from '@/lib/apiErrorHandler'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'
import { useScenariosQuery } from '@/pages/ScenarioManagement/hooks/useScenarioQuery'

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
      .from('schedule_events')
      .select(`
        id,
        date,
        venue,
        scenario,
        gms,
        start_time,
        end_time,
        category,
        is_cancelled,
        current_participants,
        capacity,
        organization_id
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
    
    logger.log(`対象公演: ${pastEvents.length}件`)
    
    for (const event of pastEvents) {
      const currentParticipants = event.current_participants || 0
      const maxParticipants = event.capacity || 8
      
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
        r.reservation_source === 'demo_auto' ||
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
        reservation_source: 'demo_auto',
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

// 満席の公演にデモ参加者を追加する関数（既存）
async function addDemoParticipantsToFullEvents(events: ScheduleEvent[]): Promise<ScheduleEvent[]> {
  const eventsWithDemoParticipants = [...events]
  
  // 組織IDを取得（マルチテナント対応）
  const orgId = await getCurrentOrganizationId()
  
  for (const event of events) {
    // 満席判定（参加者数が最大参加者数以上）
    if ((event.current_participants || 0) >= (event.max_participants || 0)) {
      try {
        // このイベントの予約データを取得（組織でフィルタ）
        let reservationQuery = supabase
          .from('reservations')
          .select('participant_names')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        if (orgId) {
          reservationQuery = reservationQuery.eq('organization_id', orgId)
        }
        
        const { data: reservations, error: reservationError } = await reservationQuery
        
        if (reservationError) {
          logger.error('予約データの取得に失敗:', reservationError)
          continue
        }
        
        // デモ参加者が既に存在するかチェック
        const hasDemoParticipant = reservations?.some(r => 
          r.participant_names?.includes('デモ参加者') || 
          r.participant_names?.some((name: string) => name.includes('デモ'))
        )
        
        if (!hasDemoParticipant) {
          // シナリオ情報を取得（組織固有設定: organization_scenarios_with_master）
          let scenarioQuery = supabase
            .from('organization_scenarios_with_master')
            .select('id, title, duration, participation_fee, gm_test_participation_fee')
            .eq('title', event.scenario)
          
          if (orgId) {
            scenarioQuery = scenarioQuery.eq('organization_id', orgId)
          }
          
          const { data: scenario, error: scenarioError } = await scenarioQuery.single()
          
          if (scenarioError) {
            logger.error('シナリオ情報の取得に失敗:', scenarioError)
            continue
          }
          
          // デモ参加者の参加費を計算
          const isGmTest = event.category === 'gmtest'
          const participationFee = isGmTest 
            ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
            : (scenario?.participation_fee || 0)
          
          // デモ参加者の予約を作成
          const demoReservation = {
            schedule_event_id: event.id,
            title: event.scenario || '',
            scenario_master_id: scenario?.id || null,
            store_id: event.venue || null,
            customer_id: null,
            customer_notes: 'デモ参加者',
            requested_datetime: `${event.date}T${event.start_time}+09:00`,
            duration: scenario?.duration || 120,
            participant_count: 1,
            participant_names: ['デモ参加者'],
            assigned_staff: event.gms || [],
            base_price: participationFee,
            options_price: 0,
            total_price: participationFee,
            discount_amount: 0,
            final_price: participationFee,
            payment_method: 'onsite',
            payment_status: 'paid',
            status: 'confirmed',
            reservation_source: 'demo',
            organization_id: event.organization_id // マルチテナント対応
          }
          
          // デモ参加者の予約を作成
          await supabase
            .from('reservations')
            .insert(demoReservation)
          
          logger.log('デモ参加者の予約を作成しました:', event.id)
        }
      } catch (error) {
        logger.error('デモ参加者の追加に失敗:', error)
      }
    }
  }
  
  return eventsWithDemoParticipants
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

// Supabaseから取得したイベントデータの型
interface RawEventData {
  id: string
  date: string
  store_id: string
  scenario?: string
  scenarios?: { id: string; title: string; player_count_max?: number } | { id: string; title: string; player_count_max?: number }[] | null
  scenario_masters?: { id: string; title: string; player_count_max?: number } | { id: string; title: string; player_count_max?: number }[] | null
  gms: string[]
  gm_roles?: Record<string, string> // 追加
  start_time: string
  end_time: string
  category: string
  is_cancelled: boolean
  is_tentative?: boolean // 仮状態（非公開）
  current_participants?: number
  capacity: number
  notes?: string
  is_reservation_enabled: boolean
  time_slot?: string // 時間帯（朝/昼/夜）
  reservation_name?: string // 貸切予約の予約者名
  reservation_id?: string // 貸切リクエストのID（重複防止用）
  is_reservation_name_overwritten?: boolean // 予約者名が手動上書きされたか
}

// 貸切リクエストの候補
interface CandidateDateTime {
  date: string
  startTime?: string
  endTime?: string
  order: number
  status?: 'confirmed' | 'pending'
  confirmedStore?: string
}

// GM応答データ
interface GMAvailabilityResponse {
  response_status: 'available' | 'unavailable'
  staff?: { name: string }
}

// 貸切リクエストデータ
interface PrivateRequestData {
  id: string
  title: string
  status: string
  store_id: string
  gm_staff?: string
  participant_count: number
  customer_name?: string
  display_customer_name?: string // 編集された予約者名
  candidate_datetimes?: {
    candidates: CandidateDateTime[]
    confirmedStore?: {
      storeId: string
      storeName?: string
    }
  }
  scenario_masters?: { title: string; player_count_max: number }
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
  // 初回読み込み完了フラグ（useRefで管理してレンダリングをトリガーしない）
  const initialLoadComplete = useRef(false)
  
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

  const [events, setEvents] = useState<ScheduleEvent[]>(() => {
    try {
      const cached = sessionStorage.getItem('scheduleEvents')
      return cached ? JSON.parse(cached) : []
    } catch {
      return []
    }
  })

  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('scheduleEvents')
      return !cached
    } catch {
      return true
    }
  })

  const [error, setError] = useState<string | null>(null)

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

  // イベントデータをキャッシュに保存（アイドル時にまとめて書き、メインスレッドのピークを避ける）
  const eventsStringRef = useRef<string>('')
  useEffect(() => {
    if (events.length === 0) return
    let cancelled = false
    const flush = () => {
      if (cancelled) return
      const eventsString = JSON.stringify(events)
      if (eventsStringRef.current !== eventsString) {
        eventsStringRef.current = eventsString
        try {
          sessionStorage.setItem('scheduleEvents', eventsString)
        } catch {
          /* 容量超過など */
        }
      }
    }
    let cancelScheduled: (() => void) | undefined
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(flush, { timeout: 2000 })
      cancelScheduled = () => cancelIdleCallback(id)
    } else {
      const id = window.setTimeout(flush, 0)
      cancelScheduled = () => clearTimeout(id)
    }
    return () => {
      cancelled = true
      cancelScheduled?.()
    }
  }, [events])

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
  

  // Supabaseからイベントデータを読み込む
  useEffect(() => {
    // 店舗データが読み込まれるまで待つ（店舗データが必要）
    if (storesLoading) return
    
    const loadEvents = async () => {
      try {
        // キャッシュがない場合のみローディング状態にする
        // キャッシュがある場合はバックグラウンドで静かに更新
        if (events.length === 0) {
          setIsLoading(true)
        }
        setError(null)
        
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        const data = (await scheduleApi.getByMonth(year, month)) as RawEventData[]
        let scenarioList = mergedScenariosForScheduleRef.current
        if (!scenarioList.length) {
          scenarioList = await scenarioApi.getAll()
          mergedScenariosForScheduleRef.current = scenarioList
        }
        const scenarioByTitle = new Map<string, any>()
        scenarioList.forEach((s: any) => {
          scenarioByTitle.set(s.title, s)
        })
        
        // シナリオ略称マッピング
        const SCENARIO_ALIAS: Record<string, string> = {
          'さきこさん': '裂き子さん',
          'サキコサン': '裂き子さん',
          'トレタリ': '撮れ高足りてますか',
          'ナナイロ橙': 'ナナイロの迷宮 橙',
          'ナナイロ緑': 'ナナイロの迷宮 緑',
          'ナナイロ黄': 'ナナイロの迷宮 黄',
          '童話裁判': '不思議の国の童話裁判',
          'TOOLS': 'TOOLS〜ぎこちない椅子',
          'カノケリ': '季節／カノケリ',
          'アニクシィ': '季節／アニクシィ',
          'シノポロ': '季節／シノポロ',
          'キモナス': '季節／キモナス',
          'ニィホン': '季節／ニィホン',
          '凍てつくあなたに6つの灯火': '凍てつくあなたに６つの灯火',
          'REDRUM1': 'REDRUM01泉涌館の変転',
          '傲慢な女王とアリスの不条理裁判': '傲慢女王とアリスの不条理裁判',
          // 狂気山脈
          '狂気山脈1': '狂気山脈　陰謀の分水嶺（１）',
          '狂気山脈2': '狂気山脈　星降る天辺（２）',
          '狂気山脈3': '狂気山脈　薄明三角点（３）',
          '狂気山脈１': '狂気山脈　陰謀の分水嶺（１）',
          '狂気山脈２': '狂気山脈　星降る天辺（２）',
          '狂気山脈３': '狂気山脈　薄明三角点（３）',
          '狂気山脈2.5': '狂気山脈　2.5　頂上戦争',
          '狂気山脈２．５': '狂気山脈　2.5　頂上戦争',
          // ソルシエ
          'ソルシエ': 'SORCIER〜賢者達の物語〜',
          'SORCIER': 'SORCIER〜賢者達の物語〜',
          // 藍雨
          '藍雨': '藍雨廻逢',
          // TheRealFork
          "THEREALFOLK'30s": "TheRealFork30's",
          'THEREALFOLK': "TheRealFork30's",
          'TheRealFolk': "TheRealFork30's",
          // 表記ゆれ
          '真渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
          '真渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
          '渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
          '渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
          '真・渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
          '土牢の悲鳴に谺して': '土牢に悲鳴は谺して',
          '百鬼の夜月光の影': '百鬼の夜、月光の影',
          'インビジブル亡霊列車': 'Invisible-亡霊列車-',
          'くずの葉の森': 'くずの葉のもり',
          'ドクターテラスの秘密の実験': 'ドクター・テラスの秘密の実験',
          'あるミステリーについて': 'あるマーダーミステリーについて',
        }
        
        const normalize = (s: string) => s.replace(/[\s\-・／/]/g, '').toLowerCase()
        
        // シナリオ名からシナリオ情報を検索
        const findScenario = (eventScenario: string) => {
          const mapped = SCENARIO_ALIAS[eventScenario] || eventScenario
          const norm = normalize(mapped)
          
          // 1. 完全一致
          if (scenarioByTitle.has(mapped)) return scenarioByTitle.get(mapped)
          if (scenarioByTitle.has(eventScenario)) return scenarioByTitle.get(eventScenario)
          
          // 2. 正規化後の完全一致
          for (const [t, s] of scenarioByTitle.entries()) {
            if (normalize(t) === norm) return s
          }
          
          // 3. 部分一致
          for (const [t, s] of scenarioByTitle.entries()) {
            if (t.includes(mapped) || mapped.includes(t)) return s
          }
          
          // 4. 正規化後の部分一致
          for (const [t, s] of scenarioByTitle.entries()) {
            const nt = normalize(t)
            if (nt.includes(norm) || norm.includes(nt)) return s
          }
          
          // 5. キーワードマッチ
          const kws = eventScenario.split(/[\s\-・／/]/).filter(k => k.length > 0)
          for (const [t, s] of scenarioByTitle.entries()) {
            const nt = normalize(t)
            if (kws.every(kw => nt.includes(normalize(kw))) && kws.length >= 1) return s
          }
          
          return null
        }
        
      // Supabaseのデータを内部形式に変換
      // 拡張プロパティ（scenarios, gm_roles, timeSlot等）を含むため型アサーションを使用
      const formattedEvents = data.map((event: RawEventData) => {
        // scenario_masters（新）または scenarios（旧）からシナリオ情報を取得
        const rawScenarioData = event.scenario_masters || event.scenarios
        const scenarioData = Array.isArray(rawScenarioData) ? rawScenarioData[0] : rawScenarioData
        const scenarioTitle = scenarioData?.title || event.scenario || ''
        // シナリオデータが有効かどうかをチェック（nullまたはidがない場合はフォールバック）
        const isValidScenario = scenarioData && scenarioData.id
        // シナリオデータが無効な場合はシナリオリストからタイトルで検索（略称マッピング対応）
        const scenarioInfo = isValidScenario 
          ? scenarioData 
          : (scenarioTitle ? findScenario(scenarioTitle) : null)
        
        return {
        id: event.id,
        date: event.date,
        venue: event.store_id, // store_idを直接使用
          scenario: scenarioTitle, // JOINされたタイトルを優先
          scenarios: scenarioInfo ? {
            id: scenarioInfo.id,
            title: scenarioInfo.title,
            player_count_max: scenarioInfo.player_count_max
          } : undefined,
          gms: event.gms || [],
          gm_roles: event.gm_roles || {},
          start_time: event.start_time,
          end_time: event.end_time,
          category: event.category,
          is_cancelled: event.is_cancelled || false,
          is_tentative: event.is_tentative || false,
          current_participants: event.current_participants || 0, // DBカラム名に統一
          max_participants: scenarioInfo?.player_count_max || event.capacity || 8,
          notes: event.notes || '',
          is_reservation_enabled: event.is_reservation_enabled || false,
          time_slot: event.time_slot,
          reservation_name: event.reservation_name || '', // 貸切予約の予約者名
          is_reservation_name_overwritten: event.is_reservation_name_overwritten || false, // DBから取得
          reservation_id: event.reservation_id // 貸切リクエストID（重複防止用）
          }
        })
        
        // schedule_events の予約者名をニックネームで上書き（手動上書きされていないもののみ）
        const reservationIdsForNickname = formattedEvents
          .filter(e => e.reservation_id && !e.is_reservation_name_overwritten)
          .map(e => e.reservation_id!)
        
        if (reservationIdsForNickname.length > 0) {
          const { data: nicknameData } = await supabase
            .from('reservations')
            .select('id, customer_name, display_customer_name, customers:customer_id(nickname)')
            .in('id', reservationIdsForNickname)
          
          if (nicknameData) {
            const nicknameMap = new Map<string, string>()
            nicknameData.forEach((r: any) => {
              const nickname = r.display_customer_name || r.customers?.nickname
              if (nickname) {
                nicknameMap.set(r.id, nickname)
              }
            })
            
            formattedEvents.forEach(e => {
              if (e.reservation_id && nicknameMap.has(e.reservation_id)) {
                e.reservation_name = nicknameMap.get(e.reservation_id)!
              }
            })
          }
        }
        
        // 貸切リクエストを取得して追加（確定済みのみ）
        // organization_idを取得（マルチテナント対応）
        const orgIdForPrivate = await getCurrentOrganizationId()
        
        let privateQuery = supabase
          .from('reservations')
          .select(`
            id,
            title,
            customer_name,
            display_customer_name,
            status,
            store_id,
            gm_staff,
            candidate_datetimes,
            participant_count,
            schedule_event_id,
            scenario_masters:scenario_master_id (
              title,
              player_count_max
            ),
            customers:customer_id (
              nickname
            )
          `)
          .eq('reservation_source', 'web_private')
          .eq('status', 'confirmed') // 確定のみ表示
          .is('schedule_event_id', null) // schedule_eventsに未登録のもののみ
        
        if (orgIdForPrivate) {
          privateQuery = privateQuery.eq('organization_id', orgIdForPrivate)
        }
        
        const { data: privateRequests, error: privateError } = await privateQuery
        
        if (privateError) {
          logger.error('貸切リクエスト取得エラー:', privateError)
        }
        
        // 貸切リクエストをスケジュールイベントに変換
        const privateEvents: ScheduleEvent[] = []
        if (privateRequests) {
          (privateRequests as unknown as PrivateRequestData[]).forEach((request: PrivateRequestData) => {
            if (request.candidate_datetimes?.candidates) {
              // GMの名前を取得
              let gmNames: string[] = []
              
              // 確定したGMがいる場合は、staff配列から名前を検索
              if (request.gm_staff && staff && staff.length > 0) {
                const assignedGM = staff.find((s: Staff) => s.id === request.gm_staff)
                if (assignedGM) {
                  gmNames = [assignedGM.name]
                }
              }
              
              // それでも見つからない場合
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }
              
              // 表示する候補を決定
              let candidatesToShow = request.candidate_datetimes.candidates
              
              // status='confirmed'の場合は、candidate.status='confirmed'の候補のみ表示
              if (request.status === 'confirmed') {
                const confirmedCandidates = candidatesToShow.filter((c: CandidateDateTime) => c.status === 'confirmed')
                if (confirmedCandidates.length > 0) {
                  candidatesToShow = confirmedCandidates.slice(0, 1) // 最初の1つだけ
                } else {
                  // フォールバック: candidate.status='confirmed'がない場合は最初の候補のみ
                  candidatesToShow = candidatesToShow.slice(0, 1)
                }
              }
              
              candidatesToShow.forEach((candidate: CandidateDateTime) => {
                const candidateDate = new Date(candidate.date)
                const candidateMonth = candidateDate.getMonth() + 1
                const candidateYear = candidateDate.getFullYear()
                
                // 表示対象の月のみ追加
                if (candidateYear === year && candidateMonth === month) {
                  // 確定済み/GM確認済みの場合は、確定店舗を使用
                  // confirmedStoreがnullの場合はstore_idを使用（古いデータ対応）
                  const confirmedStoreId = request.candidate_datetimes?.confirmedStore?.storeId || request.store_id
                  const venueId = (request.status === 'confirmed' || request.status === 'gm_confirmed') && confirmedStoreId 
                    ? confirmedStoreId 
                    : '' // 店舗未定
                  
                  const privateEvent: ScheduleEvent = {
                    id: `${request.id}-${candidate.order}`,
                    date: candidate.date,
                    venue: venueId,
                    scenario: request.scenario_masters?.title || request.title,
                    gms: gmNames,
                    start_time: candidate.startTime || '',
                    end_time: candidate.endTime || '',
                    category: 'private', // 貸切
                    is_cancelled: false,
                    current_participants: request.participant_count || 0, // Reservationのparticipant_countをScheduleEventのcurrent_participantsに変換
                    max_participants: request.scenario_masters?.player_count_max || 8,
                    notes: `【貸切${request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? 'GM確認済' : '希望'}】`,
                    is_reservation_enabled: true, // 貸切公演は常に公開中
                    is_private_request: true, // 貸切リクエストフラグ
                    reservation_info: request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? '店側確認待ち' : 'GM確認待ち',
                    reservation_id: request.id, // 元のreservation IDを保持
                    reservation_name: request.display_customer_name || (request as any).customers?.nickname || request.customer_name || '', // ニックネーム優先
                    original_customer_name: request.customer_name || '', // MMQからの元の予約者名
                    is_reservation_name_overwritten: !!request.display_customer_name // 手動上書きフラグ
                  }
                  
                  privateEvents.push(privateEvent)
                }
              })
            }
          })
        }
        
        // 満席の公演にデモ参加者を追加（パフォーマンス改善のため無効化）
        // const eventsWithDemoParticipants = await addDemoParticipantsToFullEvents([...formattedEvents, ...privateEvents])
        
        // schedule_events に既に保存されている reservation_id を収集（重複防止）
        const existingReservationIds = new Set(
          formattedEvents
            .filter(e => e.reservation_id)
            .map(e => e.reservation_id)
        )
        
        logger.log('🔍 重複チェック詳細:', {
          formattedEventsCount: formattedEvents.length,
          privateEventsCount: privateEvents.length,
          existingReservationIds: Array.from(existingReservationIds),
          privateEventIds: privateEvents.map(pe => pe.reservation_id),
          // 各privateEventがフィルタされるかどうか
          filterResults: privateEvents.map(pe => ({
            id: pe.reservation_id,
            willBeFiltered: existingReservationIds.has(pe.reservation_id),
            existsInSet: Array.from(existingReservationIds).includes(pe.reservation_id)
          }))
        })
        
        // reservations から生成されたイベントのうち、既に schedule_events に存在するものを除外
        const filteredPrivateEvents = privateEvents.filter(
          pe => !existingReservationIds.has(pe.reservation_id)
        )
        
        logger.log(`✅ 初期ロード: ${formattedEvents.length + filteredPrivateEvents.length}件のイベント（${privateEvents.length - filteredPrivateEvents.length}件重複除外）`)
        
        setEvents([...formattedEvents, ...filteredPrivateEvents] as ScheduleEvent[])
      } catch (err) {
        const apiError = handleSupabaseError(err, 'スケジュールデータの取得に失敗しました')
        logApiError(apiError, { scope: 'useScheduleData.loadEvents' })
        setError(getUserFriendlyMessage(apiError))
        
        // エラー時はモックデータを使用
        const mockEvents: ScheduleEvent[] = [
          {
            id: '1',
            date: '2025-09-01',
            venue: 'takadanobaba',
            scenario: '人狼村の悲劇',
            gms: ['田中太郎'],
            start_time: '14:00',
            end_time: '18:00',
            category: 'private',
            is_cancelled: false,
            current_participants: 6,
            max_participants: 8
          },
          {
            id: '2',
            date: '2025-09-01',
            venue: 'bekkan1',
            scenario: '密室の謎',
            gms: ['山田花子'],
            start_time: '19:00',
            end_time: '22:00',
            category: 'open',
            is_cancelled: false,
            current_participants: 8,
            max_participants: 8
          }
        ]
        setEvents(mockEvents)
      } finally {
        setIsLoading(false)
        initialLoadComplete.current = true // 初回読み込み完了をマーク
      }
    }

    loadEvents()
  }, [currentDate, storesLoading, staff]) // staffも依存配列に追加（貸切リクエストのGM名取得で必要）

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

  // スケジュールデータを再取得する関数
  const fetchSchedule = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      
      logger.log(`🔄 fetchSchedule: ${year}年${month}月のデータを取得`)
      
      const data = (await scheduleApi.getByMonth(year, month)) as RawEventData[]
      let scenarioList = mergedScenariosForScheduleRef.current
      if (!scenarioList.length) {
        scenarioList = await scenarioApi.getAll()
        mergedScenariosForScheduleRef.current = scenarioList
      }
      const scenarioByTitle2 = new Map<string, any>()
      scenarioList.forEach((s: any) => {
        scenarioByTitle2.set(s.title, s)
      })
      
      // シナリオ略称マッピング（fetchSchedule用）
      const SCENARIO_ALIAS2: Record<string, string> = {
        'さきこさん': '裂き子さん',
        'サキコサン': '裂き子さん',
        'トレタリ': '撮れ高足りてますか',
        'ナナイロ橙': 'ナナイロの迷宮 橙',
        'ナナイロ緑': 'ナナイロの迷宮 緑',
        'ナナイロ黄': 'ナナイロの迷宮 黄',
        '童話裁判': '不思議の国の童話裁判',
        'TOOLS': 'TOOLS〜ぎこちない椅子',
        'カノケリ': '季節／カノケリ',
        'アニクシィ': '季節／アニクシィ',
        'シノポロ': '季節／シノポロ',
        'キモナス': '季節／キモナス',
        'ニィホン': '季節／ニィホン',
        '凍てつくあなたに6つの灯火': '凍てつくあなたに６つの灯火',
        'REDRUM1': 'REDRUM01泉涌館の変転',
        '傲慢な女王とアリスの不条理裁判': '傲慢女王とアリスの不条理裁判',
        // 狂気山脈
        '狂気山脈1': '狂気山脈　陰謀の分水嶺（１）',
        '狂気山脈2': '狂気山脈　星降る天辺（２）',
        '狂気山脈3': '狂気山脈　薄明三角点（３）',
        '狂気山脈１': '狂気山脈　陰謀の分水嶺（１）',
        '狂気山脈２': '狂気山脈　星降る天辺（２）',
        '狂気山脈３': '狂気山脈　薄明三角点（３）',
        '狂気山脈2.5': '狂気山脈　2.5　頂上戦争',
        '狂気山脈２．５': '狂気山脈　2.5　頂上戦争',
        // ソルシエ
        'ソルシエ': 'SORCIER〜賢者達の物語〜',
        'SORCIER': 'SORCIER〜賢者達の物語〜',
        // 藍雨
        '藍雨': '藍雨廻逢',
        // TheRealFork
        "THEREALFOLK'30s": "TheRealFork30's",
        'THEREALFOLK': "TheRealFork30's",
        'TheRealFolk': "TheRealFork30's",
        // 表記ゆれ
        '真渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
        '真渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '渋谷陰陽奇譚': '真・渋谷陰陽奇譚',
        '渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '真・渋谷陰陽綺譚': '真・渋谷陰陽奇譚',
        '土牢の悲鳴に谺して': '土牢に悲鳴は谺して',
        '百鬼の夜月光の影': '百鬼の夜、月光の影',
        'インビジブル亡霊列車': 'Invisible-亡霊列車-',
        'くずの葉の森': 'くずの葉のもり',
        'ドクターテラスの秘密の実験': 'ドクター・テラスの秘密の実験',
        'あるミステリーについて': 'あるマーダーミステリーについて',
      }
      
      const normalize2 = (s: string) => s.replace(/[\s\-・／/]/g, '').toLowerCase()
      
      const findScenario2 = (eventScenario: string) => {
        const mapped = SCENARIO_ALIAS2[eventScenario] || eventScenario
        const norm = normalize2(mapped)
        
        if (scenarioByTitle2.has(mapped)) return scenarioByTitle2.get(mapped)
        if (scenarioByTitle2.has(eventScenario)) return scenarioByTitle2.get(eventScenario)
        
        for (const [t, s] of scenarioByTitle2.entries()) {
          if (normalize2(t) === norm) return s
        }
        for (const [t, s] of scenarioByTitle2.entries()) {
          if (t.includes(mapped) || mapped.includes(t)) return s
        }
        for (const [t, s] of scenarioByTitle2.entries()) {
          const nt = normalize2(t)
          if (nt.includes(norm) || norm.includes(nt)) return s
        }
        const kws = eventScenario.split(/[\s\-・／/]/).filter(k => k.length > 0)
        for (const [t, s] of scenarioByTitle2.entries()) {
          const nt = normalize2(t)
          if (kws.every(kw => nt.includes(normalize2(kw))) && kws.length >= 1) return s
        }
        return null
      }
      
      // Supabaseのデータを内部形式に変換
      // 拡張プロパティ（scenarios, gm_roles, timeSlot等）を含むため型アサーションを使用
      const formattedEvents = data.map((event: RawEventData) => {
        // scenario_masters（新）または scenarios（旧）からシナリオ情報を取得
        const rawScenarioData2 = event.scenario_masters || event.scenarios
        const scenarioData = Array.isArray(rawScenarioData2) ? rawScenarioData2[0] : rawScenarioData2
        const scenarioTitle = scenarioData?.title || event.scenario || ''
        // シナリオデータが有効かどうかをチェック（nullまたはidがない場合はフォールバック）
        const isValidScenario = scenarioData && scenarioData.id
        // シナリオデータが無効な場合はシナリオリストからタイトルで検索（略称マッピング対応）
        const scenarioInfo = isValidScenario 
          ? scenarioData 
          : (scenarioTitle ? findScenario2(scenarioTitle) : null)
        
        return {
        id: event.id,
        date: event.date,
        venue: event.store_id,
          scenario: scenarioTitle,
          scenarios: scenarioInfo ? {
            id: scenarioInfo.id,
            title: scenarioInfo.title,
            player_count_max: scenarioInfo.player_count_max
          } : undefined,
        gms: event.gms || [],
        gm_roles: event.gm_roles || {},
        start_time: event.start_time,
        end_time: event.end_time,
        category: event.category,
        is_cancelled: event.is_cancelled || false,
        is_tentative: event.is_tentative || false,
        current_participants: event.current_participants || 0, // DBカラム名に統一
        max_participants: scenarioInfo?.player_count_max || event.capacity || 8,
        notes: event.notes || '',
        is_reservation_enabled: event.is_reservation_enabled || false,
        time_slot: event.time_slot,
        reservation_name: event.reservation_name || '', // 貸切予約の予約者名
        is_reservation_name_overwritten: event.is_reservation_name_overwritten || false, // DBから取得
        reservation_id: event.reservation_id // 貸切リクエストID（重複防止用）
        }
      })
      
      // schedule_events の予約者名をニックネームで上書き（手動上書きされていないもののみ）
      const reservationIdsForNickname2 = formattedEvents
        .filter(e => e.reservation_id && !e.is_reservation_name_overwritten)
        .map(e => e.reservation_id!)
      
      if (reservationIdsForNickname2.length > 0) {
        const { data: nicknameData2 } = await supabase
          .from('reservations')
          .select('id, customer_name, display_customer_name, customers:customer_id(nickname)')
          .in('id', reservationIdsForNickname2)
        
        if (nicknameData2) {
          const nicknameMap2 = new Map<string, string>()
          nicknameData2.forEach((r: any) => {
            const nickname = r.display_customer_name || r.customers?.nickname
            if (nickname) {
              nicknameMap2.set(r.id, nickname)
            }
          })
          
          formattedEvents.forEach(e => {
            if (e.reservation_id && nicknameMap2.has(e.reservation_id)) {
              e.reservation_name = nicknameMap2.get(e.reservation_id)!
            }
          })
        }
      }
      
      // 貸切リクエストを取得して追加
      // organization_idを取得（マルチテナント対応）
      const orgIdForPrivate2 = await getCurrentOrganizationId()
      
      let privateQuery2 = supabase
        .from('reservations')
        .select(`
          id,
          title,
          customer_name,
          display_customer_name,
          status,
          store_id,
          gm_staff,
          candidate_datetimes,
          participant_count,
          schedule_event_id,
          scenario_masters:scenario_master_id (
            title,
            player_count_max
          ),
          customers:customer_id (
            nickname
          )
        `)
        .eq('reservation_source', 'web_private')
        .eq('status', 'confirmed')
        .is('schedule_event_id', null) // schedule_eventsに未登録のもののみ
      
      if (orgIdForPrivate2) {
        privateQuery2 = privateQuery2.eq('organization_id', orgIdForPrivate2)
      }
      
      const { data: privateRequests, error: privateError } = await privateQuery2
      
      if (privateError) {
        logger.error('貸切リクエスト取得エラー:', privateError)
      }
      
      // 貸切リクエストをスケジュールイベントに変換
      const privateEvents: ScheduleEvent[] = []
      if (privateRequests) {
        (privateRequests as unknown as PrivateRequestData[]).forEach((request: PrivateRequestData) => {
          if (request.candidate_datetimes?.candidates) {
            let gmNames: string[] = []
            
            if (request.gm_staff && staff && staff.length > 0) {
              const assignedGM = staff.find((s: Staff) => s.id === request.gm_staff)
              if (assignedGM) {
                gmNames = [assignedGM.name]
              }
            }
            
            if (gmNames.length === 0) {
              gmNames = ['未定']
            }
            
            let candidatesToShow = request.candidate_datetimes.candidates
            
            if (request.status === 'confirmed') {
              const confirmedCandidates = candidatesToShow.filter((c: CandidateDateTime) => c.status === 'confirmed')
              if (confirmedCandidates.length > 0) {
                candidatesToShow = confirmedCandidates.slice(0, 1)
              } else {
                candidatesToShow = candidatesToShow.slice(0, 1)
              }
            }
            
            candidatesToShow.forEach((candidate: CandidateDateTime) => {
              const candidateDate = new Date(candidate.date)
              const candidateMonth = candidateDate.getMonth() + 1
              const candidateYear = candidateDate.getFullYear()
              
              if (candidateYear === year && candidateMonth === month) {
                const confirmedStoreId = request.candidate_datetimes?.confirmedStore?.storeId || request.store_id
                const venueId = (request.status === 'confirmed' || request.status === 'gm_confirmed') && confirmedStoreId 
                  ? confirmedStoreId 
                  : ''
                
                const privateEvent: ScheduleEvent = {
                  id: `${request.id}-${candidate.order}`,
                  date: candidate.date,
                  venue: venueId,
                  scenario: request.scenario_masters?.title || request.title,
                  gms: gmNames,
                  start_time: candidate.startTime || '',
                  end_time: candidate.endTime || '',
                  category: 'private',
                  is_cancelled: false,
                  current_participants: request.participant_count || 0,
                  max_participants: request.scenario_masters?.player_count_max || 8,
                  notes: `【貸切${request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? 'GM確認済' : '希望'}】`,
                  is_reservation_enabled: true,
                  is_private_request: true,
                  reservation_info: request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? '店側確認待ち' : 'GM確認待ち',
                  reservation_id: request.id,
                  reservation_name: request.display_customer_name || (request as any).customers?.nickname || request.customer_name || '', // ニックネーム優先
                  original_customer_name: request.customer_name || '', // MMQからの元の予約者名
                  is_reservation_name_overwritten: !!request.display_customer_name // 手動上書きフラグ
                }
                
                privateEvents.push(privateEvent)
              }
            })
          }
        })
      }
      
      // 満席の公演にデモ参加者を追加（パフォーマンス改善のため無効化）
      // const eventsWithDemoParticipants = await addDemoParticipantsToFullEvents([...formattedEvents, ...privateEvents])
      
      // schedule_events に既に保存されている reservation_id を収集（重複防止）
      const existingReservationIds = new Set(
        formattedEvents
          .filter(e => e.reservation_id)
          .map(e => e.reservation_id)
      )
      
      logger.log('🔍 重複チェック (fetchSchedule):', {
        formattedEventsCount: formattedEvents.length,
        privateEventsCount: privateEvents.length,
        existingReservationIds: Array.from(existingReservationIds),
        privateEventIds: privateEvents.map(pe => pe.reservation_id)
      })
      
      // reservations から生成されたイベントのうち、既に schedule_events に存在するものを除外
      const filteredPrivateEvents = privateEvents.filter(
        pe => !existingReservationIds.has(pe.reservation_id)
      )
      
      setEvents([...formattedEvents, ...filteredPrivateEvents] as ScheduleEvent[])
      logger.log(`✅ fetchSchedule: ${formattedEvents.length + filteredPrivateEvents.length}件のイベントを取得（${privateEvents.length - filteredPrivateEvents.length}件重複除外）`)
    } catch (err) {
      logger.error('スケジュールデータの再取得エラー:', err)
      setError('スケジュールデータの再取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [currentDate, staff])

  // リアルタイム購読（複数ユーザー対応）
  // デバウンス用のタイマーref（バッチ更新時の大量通知を防ぐ）
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFetchRef = useRef(false)
  
  useEffect(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`
    
    // デバウンス付きfetchSchedule（500ms以内の連続イベントをまとめる）
    const debouncedFetchSchedule = () => {
      pendingFetchRef.current = true
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current)
      }
      realtimeDebounceRef.current = setTimeout(async () => {
        if (pendingFetchRef.current) {
          logger.log('🔄 Realtime: デバウンス後にデータ再取得')
          pendingFetchRef.current = false
          await fetchSchedule()
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
          if (reservation?.reservation_source !== 'web_private' || reservation?.status !== 'confirmed') {
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
  }, [currentDate, fetchSchedule]) // currentDate が変わったら再購読（scenariosは参照で取得）

  return {
    events,
    setEvents,
    stores,
    scenarios,
    staff,
    isLoading,
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

