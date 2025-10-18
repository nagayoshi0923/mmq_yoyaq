// スケジュールデータの読み込みと管理

import { useState, useEffect, useRef } from 'react'
import { scheduleApi, storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { supabase } from '@/lib/supabase'
import type { ScheduleEvent } from '@/types/schedule'
import type { Staff } from '@/types'

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
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(true)
  const [staff, setStaff] = useState<Staff[]>([])
  const [staffLoading, setStaffLoading] = useState(true)

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
        setScenariosLoading(true)
        
        // 店舗・シナリオ・スタッフを並列で読み込み
        const [storeData, scenarioData, staffData] = await Promise.all([
          storeApi.getAll().catch(err => {
            console.error('店舗データの読み込みエラー:', err)
            return []
          }),
          scenarioApi.getAll().catch(err => {
            console.error('シナリオデータの読み込みエラー:', err)
            return []
          }),
          staffApi.getAll().catch(err => {
            console.error('スタッフデータの読み込みエラー:', err)
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
        setScenarios(scenarioData)
        sessionStorage.setItem('scheduleScenarios', JSON.stringify(scenarioData))
        setScenariosLoading(false)
        
        // スタッフの担当シナリオを並列で取得（バックグラウンド）
        const staffWithScenarios = await Promise.all(
          staffData.map(async (staffMember) => {
            try {
              const assignments = await assignmentApi.getStaffAssignments(staffMember.id)
              const scenarioIds = assignments.map((a: any) => a.scenario_id)
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
        console.error('初期データの読み込みエラー:', err)
        setStoresLoading(false)
        setScenariosLoading(false)
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
        const formattedEvents: ScheduleEvent[] = data.map((event: any) => ({
          id: event.id,
          date: event.date,
          venue: event.store_id, // store_idを直接使用
          scenario: event.scenarios?.title || event.scenario || '', // JOINされたタイトルを優先
          gms: event.gms || [],
          start_time: event.start_time,
          end_time: event.end_time,
          category: event.category,
          is_cancelled: event.is_cancelled || false,
          participant_count: event.current_participants || 0,
          max_participants: event.capacity || 8,
          notes: event.notes || '',
          is_reservation_enabled: event.is_reservation_enabled || false
        }))
        
        // 貸切リクエストを取得して追加（全期間から取得してフィルタリング）
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
          console.error('貸切リクエスト取得エラー:', privateError)
        }
        
        // 貸切リクエストをスケジュールイベントに変換
        const privateEvents: ScheduleEvent[] = []
        if (privateRequests) {
          privateRequests.forEach((request: any) => {
            if (request.candidate_datetimes?.candidates) {
              // GMの名前を取得
              let gmNames: string[] = []
              
              // 確定したGMがいる場合は、staff配列から名前を検索
              if (request.gm_staff && staff && staff.length > 0) {
                const assignedGM = staff.find((s: any) => s.id === request.gm_staff)
                if (assignedGM) {
                  gmNames = [assignedGM.name]
                }
              }
              
              // staffから見つからなかった場合、gm_availability_responsesから取得
              if (gmNames.length === 0 && request.gm_availability_responses) {
                gmNames = request.gm_availability_responses
                  ?.filter((r: any) => r.response_status === 'available')
                  ?.map((r: any) => r.staff?.name)
                  ?.filter((name: string) => name) || []
              }
              
              // それでも見つからない場合
              if (gmNames.length === 0) {
                gmNames = ['未定']
              }
              
              // 表示する候補を決定
              let candidatesToShow = request.candidate_datetimes.candidates
              
              // status='confirmed'の場合は、candidate.status='confirmed'の候補のみ表示
              if (request.status === 'confirmed') {
                const confirmedCandidates = candidatesToShow.filter((c: any) => c.status === 'confirmed')
                if (confirmedCandidates.length > 0) {
                  candidatesToShow = confirmedCandidates.slice(0, 1) // 最初の1つだけ
                } else {
                  // フォールバック: candidate.status='confirmed'がない場合は最初の候補のみ
                  candidatesToShow = candidatesToShow.slice(0, 1)
                }
              }
              
              candidatesToShow.forEach((candidate: any) => {
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
        
        setEvents([...formattedEvents, ...privateEvents])
      } catch (err) {
        console.error('公演データの読み込みエラー:', err)
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
      console.error('シナリオデータの再読み込みエラー:', err)
    }
  }

  // スタッフリストを再読み込み
  const refetchStaff = async () => {
    try {
      const staffData = await staffApi.getAll()
      setStaff(staffData)
      sessionStorage.setItem('scheduleStaff', JSON.stringify(staffData))
    } catch (err) {
      console.error('スタッフデータの再読み込みエラー:', err)
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
    refetchStaff
  }
}

