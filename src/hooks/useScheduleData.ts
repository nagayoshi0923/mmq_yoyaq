// スケジュールデータの読み込みと管理

import { useState, useEffect, useRef, useMemo } from 'react'
import { scheduleApi, storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
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
    // デモ顧客を取得
    const { data: demoCustomer, error: customerError } = await supabase
      .from('customers')
      .select('id, name')
      .or('name.ilike.%デモ%,email.ilike.%demo%')
      .limit(1)
      .single()
    
    if (customerError || !demoCustomer) {
      console.error('デモ顧客が見つかりません:', customerError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    console.log(`デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`)
    
    // 今日以前の公演を取得（中止されていない、カテゴリーがopenまたはgmtest）
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
        capacity
      `)
      .lte('date', today.toISOString().split('T')[0])
      .eq('is_cancelled', false)
      .in('category', ['open', 'gmtest'])
      .order('date', { ascending: false })
    
    if (eventsError) {
      console.error('過去の公演取得エラー:', eventsError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    if (!pastEvents || pastEvents.length === 0) {
      console.log('対象の過去公演がありません')
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    console.log(`対象公演: ${pastEvents.length}件`)
    
    for (const event of pastEvents) {
      const currentParticipants = event.current_participants || 0
      const maxParticipants = event.capacity || 8
      
      // 定員に達している場合はスキップ
      if (currentParticipants >= maxParticipants) {
        skippedCount++
        continue
      }
      
      // 既存のデモ参加者がいるかチェック
      const { data: existingReservations, error: reservationCheckError } = await supabase
        .from('reservations')
        .select('id, participant_names, reservation_source')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      
      if (reservationCheckError) {
        console.error('予約チェックエラー:', reservationCheckError)
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
        console.log('シナリオ名が空のためスキップ:', event.id)
        skippedCount++
        continue
      }

      const { data: scenario, error: scenarioError } = await supabase
        .from('scenarios')
        .select('id, title, duration, participation_fee, gm_test_participation_fee')
        .eq('title', event.scenario.trim())
        .maybeSingle()
      
      if (scenarioError) {
        console.error('シナリオ取得エラー:', scenarioError)
        failedCount++
        continue
      }

      if (!scenario) {
        console.log('シナリオが見つかりません:', event.scenario)
        skippedCount++
        continue
      }
      
      // 参加費を計算
      const isGmTest = event.category === 'gmtest'
      const participationFee = isGmTest 
        ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
        : (scenario?.participation_fee || 0)
      
      // 店舗名から店舗IDを取得
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .or(`name.eq.${event.venue},short_name.eq.${event.venue}`)
        .single()
      
      if (storeError) {
        console.error('店舗ID取得エラー:', storeError)
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
        scenario_id: scenario?.id || null,
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
        reservation_source: 'demo_auto'
      }
      
      const { error: insertError } = await supabase
        .from('reservations')
        .insert(demoReservation)
      
      if (insertError) {
        console.error(`デモ参加者追加エラー [${event.date} ${event.scenario}]:`, insertError)
        failedCount++
      } else {
        console.log(`✅ デモ参加者追加成功: ${event.date} ${event.scenario} (${shortfall}名追加)`)
        successCount++
      }
    }
    
    console.log(`処理完了 - 成功: ${successCount}, スキップ: ${skippedCount}, 失敗: ${failedCount}`)
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  } catch (error) {
    console.error('処理エラー:', error)
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  }
}

// 満席の公演にデモ参加者を追加する関数（既存）
async function addDemoParticipantsToFullEvents(events: ScheduleEvent[]): Promise<ScheduleEvent[]> {
  const eventsWithDemoParticipants = [...events]
  
  for (const event of events) {
    // 満席判定（参加者数が最大参加者数以上）
    if (event.participant_count >= event.max_participants) {
      try {
        // このイベントの予約データを取得
        const { data: reservations, error: reservationError } = await supabase
          .from('reservations')
          .select('participant_names')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        if (reservationError) {
          console.error('予約データの取得に失敗:', reservationError)
          continue
        }
        
        // デモ参加者が既に存在するかチェック
        const hasDemoParticipant = reservations?.some(r => 
          r.participant_names?.includes('デモ参加者') || 
          r.participant_names?.some(name => name.includes('デモ'))
        )
        
        if (!hasDemoParticipant) {
          // シナリオ情報を取得
          const { data: scenario, error: scenarioError } = await supabase
            .from('scenarios')
            .select('id, title, duration, participation_fee, gm_test_participation_fee')
            .eq('title', event.scenario)
            .single()
          
          if (scenarioError) {
            console.error('シナリオ情報の取得に失敗:', scenarioError)
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
            scenario_id: scenario?.id || null,
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
            reservation_source: 'demo'
          }
          
          // デモ参加者の予約を作成
          await supabase
            .from('reservations')
            .insert(demoReservation)
          
          console.log('デモ参加者の予約を作成しました:', event.id)
        }
      } catch (error) {
        console.error('デモ参加者の追加に失敗:', error)
      }
    }
  }
  
  return eventsWithDemoParticipants
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
  scenarios?: { title: string }
  gms: string[]
  start_time: string
  end_time: string
  category: string
  is_cancelled: boolean
  current_participants?: number
  capacity: number
  notes?: string
  is_reservation_enabled: boolean
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
  candidate_datetimes?: {
    candidates: CandidateDateTime[]
  }
  scenarios?: { title: string; player_count_max: number }
  gm_availability_responses?: GMAvailabilityResponse[]
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

  // 店舗・シナリオ・スタッフのデータ（常にAPIから最新データを取得）
  const [stores, setStores] = useState<Store[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  
  // React Queryを使ってシナリオデータを取得（自動更新される）
  const { data: scenariosData = [], isLoading: scenariosLoading } = useScenariosQuery()
  
  // React Queryのデータをstateに同期（後方互換性のため）
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  
  // React Queryのデータが更新されたらstateに同期（メモ化して不要な再レンダリングを防ぐ）
  const scenariosRef = useRef<Scenario[]>([])
  useEffect(() => {
    // データが実際に変更されたときだけ更新（参照の比較ではなく内容の比較）
    const hasChanged = JSON.stringify(scenariosRef.current) !== JSON.stringify(scenariosData)
    if (hasChanged || scenariosData.length !== scenariosRef.current.length) {
      scenariosRef.current = scenariosData
      setScenarios(scenariosData)
      if (scenariosData.length > 0) {
        sessionStorage.setItem('scheduleScenarios', JSON.stringify(scenariosData))
      }
      logger.log('🔄 シナリオデータをstateに同期:', scenariosData.length)
    }
  }, [scenariosData])

  // イベントデータをキャッシュに保存
  useEffect(() => {
    if (events.length > 0) {
      sessionStorage.setItem('scheduleEvents', JSON.stringify(events))
    }
  }, [events])

  // 初期データを並列で読み込む（高速化）
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // 常にローディング状態にする（APIから最新データを取得）
        setStoresLoading(true)
        setStaffLoading(true)
        
        // 店舗・スタッフを並列で読み込み（シナリオはReact Queryが管理）
        const [storeData, staffData] = await Promise.all([
          storeApi.getAll().catch(err => {
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
        
        // スタッフの担当シナリオを並列で取得（バックグラウンド）
        const staffWithScenarios = await Promise.all(
          staffData.map(async (staffMember) => {
            try {
              const assignments = await assignmentApi.getStaffAssignments(staffMember.id)
              const scenarioIds = assignments.map((a: { scenario_id: string }) => a.scenario_id)
              return {
                ...staffMember,
                special_scenarios: scenarioIds
              }
            } catch (error) {
              return {
                ...staffMember,
                special_scenarios: []
              }
            }
          })
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
  }, [])
  

  // Supabaseからイベントデータを読み込む
  useEffect(() => {
    // 店舗データが読み込まれるまで待つ（店舗データが必要）
    if (storesLoading) return
    
    const loadEvents = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        const data = await scheduleApi.getByMonth(year, month)
        
        // Supabaseのデータを内部形式に変換
        const formattedEvents: ScheduleEvent[] = data.map((event: RawEventData) => ({
          id: event.id,
          date: event.date,
          venue: event.store_id, // store_idを直接使用
          scenario: event.scenarios?.title || event.scenario || '', // JOINされたタイトルを優先
          gms: event.gms || [],
          start_time: event.start_time,
          end_time: event.end_time,
          category: event.category,
          is_cancelled: event.is_cancelled || false,
          participant_count: event.current_participants || 0, // 実際の参加者数を使用
          max_participants: event.capacity || 8,
          notes: event.notes || '',
          is_reservation_enabled: event.is_reservation_enabled || false
        }))
        
        // 貸切リクエストを取得して追加（確定済みのみ）
        const { data: privateRequests, error: privateError } = await supabase
          .from('reservations')
          .select(`
            id,
            title,
            customer_name,
            status,
            store_id,
            gm_staff,
            candidate_datetimes,
            participant_count,
            scenarios:scenario_id (
              title,
              player_count_max
            ),
            gm_availability_responses (
              staff_id,
              response_status,
              staff:staff_id (name)
            )
          `)
          .eq('reservation_source', 'web_private')
          .eq('status', 'confirmed') // 確定のみ表示
        
        if (privateError) {
          logger.error('貸切リクエスト取得エラー:', privateError)
        }
        
        // 貸切リクエストをスケジュールイベントに変換
        const privateEvents: ScheduleEvent[] = []
        if (privateRequests) {
          privateRequests.forEach((request: PrivateRequestData) => {
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
              
              // staffから見つからなかった場合、gm_availability_responsesから取得
              if (gmNames.length === 0 && request.gm_availability_responses) {
                gmNames = request.gm_availability_responses
                  ?.filter((r: GMAvailabilityResponse) => r.response_status === 'available')
                  ?.map((r: GMAvailabilityResponse) => r.staff?.name)
                  ?.filter((name): name is string => !!name) || []
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
                    scenario: request.scenarios?.title || request.title,
                    gms: gmNames,
                    start_time: candidate.startTime,
                    end_time: candidate.endTime,
                    category: 'private', // 貸切
                    is_cancelled: false,
                    participant_count: request.participant_count || 0,
                    max_participants: request.scenarios?.player_count_max || 8,
                    notes: `【貸切${request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? 'GM確認済' : '希望'}】${request.customer_name || ''}`,
                    is_reservation_enabled: true, // 貸切公演は常に公開中
                    is_private_request: true, // 貸切リクエストフラグ
                    reservation_info: request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? '店側確認待ち' : 'GM確認待ち',
                    reservation_id: request.id // 元のreservation IDを保持
                  }
                  
                  privateEvents.push(privateEvent)
                }
              })
            }
          })
        }
        
        // 満席の公演にデモ参加者を追加（パフォーマンス改善のため無効化）
        // const eventsWithDemoParticipants = await addDemoParticipantsToFullEvents([...formattedEvents, ...privateEvents])
        
        setEvents([...formattedEvents, ...privateEvents])
      } catch (err) {
        logger.error('公演データの読み込みエラー:', err)
        setError('公演データの読み込みに失敗しました')
        
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
            participant_count: 6,
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
            participant_count: 8,
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
  const fetchSchedule = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      
      const data = await scheduleApi.getByMonth(year, month)
      
      // Supabaseのデータを内部形式に変換
      const formattedEvents: ScheduleEvent[] = data.map((event: RawEventData) => ({
        id: event.id,
        date: event.date,
        venue: event.store_id,
        scenario: event.scenarios?.title || event.scenario || '',
        gms: event.gms || [],
        start_time: event.start_time,
        end_time: event.end_time,
        category: event.category,
        is_cancelled: event.is_cancelled || false,
        participant_count: event.current_participants || 0, // 実際の参加者数を使用
        max_participants: event.capacity || 8,
        notes: event.notes || '',
        is_reservation_enabled: event.is_reservation_enabled || false
      }))
      
      // 貸切リクエストを取得して追加
      const { data: privateRequests, error: privateError } = await supabase
        .from('reservations')
        .select(`
          id,
          title,
          customer_name,
          status,
          store_id,
          gm_staff,
          candidate_datetimes,
          participant_count,
          scenarios:scenario_id (
            title,
            player_count_max
          ),
          gm_availability_responses (
            staff_id,
            response_status,
            staff:staff_id (name)
          )
        `)
        .eq('reservation_source', 'web_private')
        .eq('status', 'confirmed')
      
      if (privateError) {
        logger.error('貸切リクエスト取得エラー:', privateError)
      }
      
      // 貸切リクエストをスケジュールイベントに変換
      const privateEvents: ScheduleEvent[] = []
      if (privateRequests) {
        privateRequests.forEach((request: PrivateRequestData) => {
          if (request.candidate_datetimes?.candidates) {
            let gmNames: string[] = []
            
            if (request.gm_staff && staff && staff.length > 0) {
              const assignedGM = staff.find((s: Staff) => s.id === request.gm_staff)
              if (assignedGM) {
                gmNames = [assignedGM.name]
              }
            }
            
            if (gmNames.length === 0 && request.gm_availability_responses) {
              gmNames = request.gm_availability_responses
                ?.filter((r: GMAvailabilityResponse) => r.response_status === 'available')
                ?.map((r: GMAvailabilityResponse) => r.staff?.name)
                ?.filter((name): name is string => !!name) || []
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
                  scenario: request.scenarios?.title || request.title,
                  gms: gmNames,
                  start_time: candidate.startTime,
                  end_time: candidate.endTime,
                  category: 'private',
                  is_cancelled: false,
                  participant_count: request.participant_count || 0,
                  max_participants: request.scenarios?.player_count_max || 8,
                  notes: `【貸切${request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? 'GM確認済' : '希望'}】${request.customer_name || ''}`,
                  is_reservation_enabled: true,
                  is_private_request: true,
                  reservation_info: request.status === 'confirmed' ? '確定' : request.status === 'gm_confirmed' ? '店側確認待ち' : 'GM確認待ち',
                  reservation_id: request.id
                }
                
                privateEvents.push(privateEvent)
              }
            })
          }
        })
      }
      
      // 満席の公演にデモ参加者を追加（パフォーマンス改善のため無効化）
      // const eventsWithDemoParticipants = await addDemoParticipantsToFullEvents([...formattedEvents, ...privateEvents])
      
      setEvents([...formattedEvents, ...privateEvents])
    } catch (err) {
      logger.error('スケジュールデータの再取得エラー:', err)
      setError('スケジュールデータの再取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

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

