import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'
import { MemoCell } from '@/components/schedule/MemoCell'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { ConflictWarningModal } from '@/components/schedule/ConflictWarningModal'
import { memoApi, scheduleApi, storeApi, scenarioApi, staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { shiftApi } from '@/lib/shiftApi'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/types'
import { 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  is_reservation_enabled?: boolean
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
}



export function ScheduleManager() {
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
  
  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = localStorage.getItem('scheduleCurrentDate')
      if (saved) {
        return new Date(saved)
      }
    } catch {
      // エラー時は現在の日付を使用
    }
    return new Date()
  })
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [storeIdMap, setStoreIdMap] = useState<Record<string, string>>({})
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<{
    date: string
    venue: string
    timeSlot: string
  } | undefined>(undefined)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<ScheduleEvent | null>(null)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [publishingEvent, setPublishingEvent] = useState<ScheduleEvent | null>(null)
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)
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
  const [shiftData, setShiftData] = useState<Record<string, Array<Staff & { timeSlot: string }>>>({})
  const [availableStaffByScenario, setAvailableStaffByScenario] = useState<Record<string, Staff[]>>({})
  
  // 店舗・シナリオ・スタッフのデータ（常にAPIから最新データを取得）
  const [stores, setStores] = useState<any[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [scenarios, setScenarios] = useState<any[]>([])

  // currentDateの変更をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('scheduleCurrentDate', currentDate.toISOString())
    } catch (error) {
      console.error('Failed to save current date:', error)
    }
  }, [currentDate])
  const [scenariosLoading, setScenariosLoading] = useState(true)
  const [staff, setStaff] = useState<any[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  
  // イベントデータをキャッシュに保存
  useEffect(() => {
    if (events.length > 0) {
      sessionStorage.setItem('scheduleEvents', JSON.stringify(events))
    }
  }, [events])
  
  // スクロール位置を保持（シンプル版）
  useEffect(() => {
    // ブラウザのデフォルトのスクロール復元を無効化
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    
    // スクロール位置を定期的に保存（デバウンス付き）
    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem('scheduleScrollY', window.scrollY.toString())
        sessionStorage.setItem('scheduleScrollTime', Date.now().toString())
      }, 100)
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
      // scrollRestorationはmanualのままにしておく
    }
  }, [])

  // マウント時にスクロール位置を即座に復元（リロード直後のみ）
  useLayoutEffect(() => {
    const savedY = sessionStorage.getItem('scheduleScrollY')
    const savedTime = sessionStorage.getItem('scheduleScrollTime')
    
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      // 10秒以内のスクロール位置のみ復元（リロード直後と判定）
      if (timeSinceScroll < 10000) {
        // 少し待ってからスクロール位置を復元
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, []) // マウント時のみ実行

  // データ読み込み完了後に再度復元
  useEffect(() => {
    if (!isLoading) {
      const savedY = sessionStorage.getItem('scheduleScrollY')
      const savedTime = sessionStorage.getItem('scheduleScrollTime')
      
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        // 10秒以内のスクロール位置のみ復元（リロード直後と判定）
        if (timeSinceScroll < 10000) {
          // データ読み込み後にスクロール復元
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
  }, [isLoading])

  // Supabaseからデータを読み込む
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
                  
                  const privateEvent = {
                    id: `${request.id}-${candidate.order}`,
                    date: candidate.date,
                    venue: venueId,
                    scenario: request.scenarios?.title || request.title,
                    gms: gmNames,
                    start_time: candidate.startTime,
                    end_time: candidate.endTime,
                    category: 'private' as any, // 貸切
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
  }, [currentDate, storesLoading]) // currentDateの変更時と店舗データ読み込み完了時

  // シフトデータを読み込む（staffデータの後に実行）
  useEffect(() => {
    const loadShiftData = async () => {
      try {
        // staffが読み込まれるまで待つ
        if (staffLoading || !staff || staff.length === 0) return
        
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        // 全スタッフのシフトを取得
        const shifts = await shiftApi.getAllStaffShifts(year, month)
        
        // 日付とタイムスロットごとにスタッフを整理
        const shiftMap: Record<string, Array<Staff & { timeSlot: string }>> = {}
        
        for (const shift of shifts) {
          const shiftStaff = (shift as any).staff
          if (!shiftStaff) continue
          
          // staffステートから完全なスタッフデータ（special_scenariosを含む）を取得
          const fullStaffData = staff.find(s => s.id === shiftStaff.id)
          if (!fullStaffData) continue
          
          const dateKey = shift.date
          
          // 各タイムスロットをチェック
          if (shift.morning || shift.all_day) {
            const key = `${dateKey}-morning`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'morning' })
          }
          
          if (shift.afternoon || shift.all_day) {
            const key = `${dateKey}-afternoon`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'afternoon' })
          }
          
          if (shift.evening || shift.all_day) {
            const key = `${dateKey}-evening`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'evening' })
          }
        }
        
        setShiftData(shiftMap)
      } catch (error) {
        console.error('Error loading shift data:', error)
      }
    }
    
    loadShiftData()
  }, [currentDate, staff, staffLoading])

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'schedule') {
        window.location.href = '/#' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])


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

  // シナリオごとの出勤可能GMを計算
  useEffect(() => {
    const calculateAvailableGMs = async () => {
      if (!isPerformanceModalOpen || !scenarios.length) return
      
      // 日付とタイムスロットの取得
      let date: string
      let timeSlot: string
      
      if (modalInitialData) {
        date = modalInitialData.date
        timeSlot = modalInitialData.timeSlot
      } else if (editingEvent) {
        date = editingEvent.date
        // 開始時刻からタイムスロットを判定
        const startHour = parseInt(editingEvent.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 17) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
      } else {
        return
      }
      
      const key = `${date}-${timeSlot}`
      const availableStaff = shiftData[key] || []
      
      // シナリオごとに、そのシナリオを担当できるGMをフィルタリング
      const staffByScenario: Record<string, Staff[]> = {}
      
      for (const scenario of scenarios) {
        const gmList = availableStaff.filter(staffMember => {
          // 担当シナリオに含まれているかチェック
          const specialScenarios = staffMember.special_scenarios || []
          const hasScenarioById = specialScenarios.includes(scenario.id)
          const hasScenarioByTitle = specialScenarios.includes(scenario.title)
          return hasScenarioById || hasScenarioByTitle
        })
        staffByScenario[scenario.title] = gmList
      }
      
      setAvailableStaffByScenario(staffByScenario)
    }
    
    calculateAvailableGMs()
  }, [isPerformanceModalOpen, modalInitialData, editingEvent, shiftData, scenarios])

  // 初期データ読み込み（月が変わった時も実行）
  useEffect(() => {
    const loadMemos = async () => {
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        const memoData = await memoApi.getByMonth(year, month)
        
        // メモデータを状態に変換
        const memoMap: Record<string, string> = {}
        const storeMap: Record<string, string> = {}
        
        memoData.forEach((memo: any) => {
          const key = getMemoKey(memo.date, memo.stores.name)
          memoMap[key] = memo.memo_text || ''
          storeMap[memo.stores.name] = memo.venue_id
        })
        
        setMemos(memoMap)
        setStoreIdMap(storeMap)
      } catch (error) {
        console.error('メモ読み込みエラー:', error)
      }
    }

    loadMemos()
  }, [currentDate])

  // 公演カテゴリの色設定
  const categoryConfig = {
    open: { label: 'オープン公演', badgeColor: 'bg-blue-100 text-blue-800', cardColor: 'bg-blue-50 border-blue-200' },
    private: { label: '貸切公演', badgeColor: 'bg-purple-100 text-purple-800', cardColor: 'bg-purple-50 border-purple-200' },
    gmtest: { label: 'GMテスト', badgeColor: 'bg-orange-100 text-orange-800', cardColor: 'bg-orange-50 border-orange-200' },
    testplay: { label: 'テストプレイ', badgeColor: 'bg-yellow-100 text-yellow-800', cardColor: 'bg-yellow-50 border-yellow-200' },
    trip: { label: '出張公演', badgeColor: 'bg-green-100 text-green-800', cardColor: 'bg-green-50 border-green-200' },
    venue_rental: { label: '場所貸し', badgeColor: 'bg-cyan-100 text-cyan-800', cardColor: 'bg-cyan-50 border-cyan-200' },
    venue_rental_free: { label: '場所貸無料', badgeColor: 'bg-teal-100 text-teal-800', cardColor: 'bg-teal-50 border-teal-200' },
    package: { label: 'パッケージ会', badgeColor: 'bg-pink-100 text-pink-800', cardColor: 'bg-pink-50 border-pink-200' }
  }



  // 予約状況によるバッジクラス取得
  const getReservationBadgeClass = (current: number, max: number): string => {
    const ratio = current / max
    if (ratio >= 1) return 'bg-red-100' // 満席
    if (ratio >= 0.8) return 'bg-yellow-100' // ほぼ満席
    if (ratio >= 0.5) return 'bg-green-100' // 順調
    return 'bg-gray-100' // 空きあり
  }

  // 月の変更
  const changeMonth = (direction: 'prev' | 'next') => {
    // 月切り替え時はスクロール位置をクリア（一番上に戻る）
    sessionStorage.removeItem('scheduleScrollY')
    sessionStorage.removeItem('scheduleScrollTime')
    
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  // 月間の日付リストを生成
  const generateMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      // UTCではなくローカル時間で日付文字列を生成
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        date: dateString,
        dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
        day: day,
        displayDate: `${month + 1}/${day}`
      })
    }
    
    return days
  }


  const monthDays = generateMonthDays()

  // 時間帯判定（開始時間のみで判定）
  const getTimeSlot = (startTime: string) => {
    const hour = parseInt(startTime.split(':')[0])
    if (hour < 12) return 'morning'      // 0-11時 → 朝
    if (hour < 17) return 'afternoon'    // 12-16時 → 昼
    return 'evening'                     // 17時以降 → 夜
  }

  // カテゴリごとの公演数を計算
  const getCategoryCounts = () => {
    const counts: Record<string, number> = {
      all: events.length,
      open: 0,
      private: 0,
      gmtest: 0,
      testplay: 0,
      trip: 0,
      venue_rental: 0,
      venue_rental_free: 0,
      package: 0,
      cancelled: 0,
      alerts: 0  // 警告が必要な公演
    }
    
    events.forEach(event => {
      if (event.is_cancelled) {
        counts.cancelled++
      }
      if (counts[event.category] !== undefined) {
        counts[event.category]++
      }
      
      // 警告条件：シナリオが未定、またはGMが未定・空
      const hasAlert = !event.scenario || event.scenario.trim() === '' || 
                       !event.gms || event.gms.length === 0 || 
                       event.gms.every((gm: string) => !gm || gm.trim() === '')
      
      if (hasAlert && !event.is_cancelled) {
        counts.alerts++
      }
    })
    
    return counts
  }

  const categoryCounts = getCategoryCounts()

  // 特定の日付・店舗・時間帯の公演を取得
  const getEventsForSlot = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    return events.filter(event => {
      // 日付とタイムスロットが一致するかチェック
      const dateMatch = event.date === date
      const detectedTimeSlot = getTimeSlot(event.start_time)
      const timeSlotMatch = detectedTimeSlot === timeSlot
      const categoryMatch = selectedCategory === 'all' || event.category === selectedCategory
      
      // 貸切リクエストの場合
      if (event.is_private_request) {
        // 店舗が確定している場合（venue が空でない）は、その店舗のセルにのみ表示
        if (event.venue) {
          const match = dateMatch && event.venue === venue && timeSlotMatch && categoryMatch
          return match
        }
        // 店舗が未確定の場合（venue が空）は、全ての店舗に表示
        return dateMatch && timeSlotMatch && categoryMatch
      }
      
      // 通常公演は厳密に店舗が一致する場合のみ
      const venueMatch = event.venue === venue
      
      return dateMatch && venueMatch && timeSlotMatch && categoryMatch
    })
  }

  // メモのキーを生成
  const getMemoKey = (date: string, venue: string) => `${date}-${venue}`

  // メモを保存
  const handleSaveMemo = async (date: string, venue: string, memo: string) => {
    const key = getMemoKey(date, venue)
    setMemos(prev => ({
      ...prev,
      [key]: memo
    }))

    try {
      // 店舗名から実際のSupabase IDを取得
      const store = stores.find(s => s.name === venue)
      let venueId = storeIdMap[venue]
      
      if (!venueId && store) {
        // storeIdMapにない場合は、店舗名で検索（初回保存時）
        console.warn(`店舗ID未取得: ${venue}, 店舗名で保存を試行`)
        venueId = store.id // 仮のID、実際はSupabaseから取得が必要
      }

      if (venueId) {
        await memoApi.save(date, venueId, memo)
        console.log('メモ保存成功:', { date, venue, memo })
      } else {
        console.error('店舗IDが見つかりません:', venue)
      }
    } catch (error) {
      console.error('メモ保存エラー:', error)
    }
  }

  // メモを取得
  const getMemo = (date: string, venue: string) => {
    const key = getMemoKey(date, venue)
    return memos[key] || ''
  }

  // シナリオリストを再読み込み
  const handleScenariosUpdate = async () => {
    try {
      const scenarioData = await scenarioApi.getAll()
      setScenarios(scenarioData)
      sessionStorage.setItem('scheduleScenarios', JSON.stringify(scenarioData))
    } catch (err) {
      console.error('シナリオデータの再読み込みエラー:', err)
    }
  }

  const handleStaffUpdate = async () => {
    try {
      const staffData = await staffApi.getAll()
      setStaff(staffData)
      sessionStorage.setItem('scheduleStaff', JSON.stringify(staffData))
    } catch (err) {
      console.error('スタッフデータの再読み込みエラー:', err)
    }
  }

  // 公演追加モーダルを開く
  const handleAddPerformance = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    setModalMode('add')
    setModalInitialData({ date, venue, timeSlot })
    setEditingEvent(null)
    setIsPerformanceModalOpen(true)
  }

  // 編集モーダルを開く
  const handleEditPerformance = (event: ScheduleEvent) => {
    setModalMode('edit')
    setEditingEvent(event)
    setModalInitialData(undefined)
    setIsPerformanceModalOpen(true)
  }

  // モーダルを閉じる
  const handleCloseModal = () => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)
  }

  // 🚨 CRITICAL: 公演保存時の重複チェック機能
  // この関数は同じ日付・店舗・時間帯の重複を防ぎます
  // ⚠️ 重複チェックを削除・スキップすると、同じ枠に複数の公演が登録されてしまいます
  const handleSavePerformance = async (performanceData: any) => {
    // タイムスロットを判定
    const startHour = parseInt(performanceData.start_time.split(':')[0])
    let timeSlot: 'morning' | 'afternoon' | 'evening'
    if (startHour < 12) {
      timeSlot = 'morning'
    } else if (startHour < 17) {
      timeSlot = 'afternoon'
    } else {
      timeSlot = 'evening'
    }
    
    // 重複チェック：同じ日時・店舗・時間帯に既に公演があるか
    const conflictingEvents = events.filter(event => {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        return false
      }
      
      const eventTimeSlot = getTimeSlot(event.start_time)
      return event.date === performanceData.date &&
             event.venue === performanceData.venue &&
             eventTimeSlot === timeSlot &&
             !event.is_cancelled
    })
    
    if (conflictingEvents.length > 0) {
      const conflictingEvent = conflictingEvents[0]
      const timeSlotLabel = timeSlot === 'morning' ? '午前' : timeSlot === 'afternoon' ? '午後' : '夜間'
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
      
      // 重複警告モーダルを表示
      setConflictInfo({
        date: performanceData.date,
        storeName,
        timeSlot: timeSlotLabel,
        conflictingEvent: {
          scenario: conflictingEvent.scenario,
          gms: conflictingEvent.gms,
          start_time: conflictingEvent.start_time,
          end_time: conflictingEvent.end_time
        }
      })
      setPendingPerformanceData(performanceData)
      setIsConflictWarningOpen(true)
      return
    }
    
    // 重複がない場合は直接保存
    await doSavePerformance(performanceData)
  }

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = async (performanceData: any) => {
    try {
      if (modalMode === 'add') {
        // 新規追加
        console.log('新しい公演を保存:', performanceData)
        
        const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
        
        // 店舗IDを取得
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('id')
          .eq('name', storeName)
          .single()
        
        if (storeError || !storeData) {
          console.error(`店舗データが見つかりません: ${storeName}`)
          throw new Error(`店舗「${storeName}」が見つかりません。先に店舗管理で店舗を追加してください。`)
        }
        
        // シナリオIDを取得
        let scenarioId = null
        if (performanceData.scenario) {
          const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
          scenarioId = matchingScenario?.id || null
        }
        
        // Supabaseに保存するデータ形式に変換
        const eventData = {
          date: performanceData.date,
          store_id: storeData.id,
          venue: storeName,
          scenario: performanceData.scenario || '',
          scenario_id: scenarioId, // scenario_idを追加
          category: performanceData.category,
          start_time: performanceData.start_time,
          end_time: performanceData.end_time,
          capacity: performanceData.max_participants,
          gms: performanceData.gms.filter((gm: string) => gm.trim() !== ''),
          notes: performanceData.notes || null
        }
        
        // Supabaseに保存
        const savedEvent = await scheduleApi.create(eventData)
        
        // 内部形式に変換して状態に追加
        const formattedEvent: ScheduleEvent = {
          id: savedEvent.id,
          date: savedEvent.date,
          venue: savedEvent.store_id, // store_idを直接使用
          scenario: savedEvent.scenario || '',
          gms: savedEvent.gms || [],
          start_time: savedEvent.start_time,
          end_time: savedEvent.end_time,
          category: savedEvent.category,
          is_cancelled: savedEvent.is_cancelled || false,
          participant_count: savedEvent.current_participants || 0,
          max_participants: savedEvent.capacity || 8,
          notes: savedEvent.notes || ''
        }
        
        setEvents(prev => [...prev, formattedEvent])
      } else {
        // 編集更新
        
        // 貸切リクエストの場合は reservations テーブルを更新
        if (performanceData.is_private_request && performanceData.reservation_id) {
          // 店舗IDを取得
          const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
          const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('name', storeName)
            .single()
          
          const storeId = storeData?.id || performanceData.venue
          
          // reservations テーブルを更新（店舗とGMを変更）
          const { error: reservationError } = await supabase
            .from('reservations')
            .update({
              store_id: storeId,
              updated_at: new Date().toISOString()
            })
            .eq('id', performanceData.reservation_id)
          
          if (reservationError) {
            console.error('貸切リクエスト更新エラー:', reservationError)
            throw new Error('貸切リクエストの更新に失敗しました')
          }
          
          // ローカル状態を更新
          setEvents(prev => prev.map(event => 
            event.reservation_id === performanceData.reservation_id 
              ? { ...event, venue: storeId } 
              : event
          ))
        } else {
          // シナリオIDを取得
          let scenarioId = null
          if (performanceData.scenario) {
            const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
            scenarioId = matchingScenario?.id || null
          }
          
          // 通常公演の場合は schedule_events テーブルを更新
          await scheduleApi.update(performanceData.id, {
            scenario: performanceData.scenario,
            scenario_id: scenarioId, // scenario_idも更新
            category: performanceData.category,
            start_time: performanceData.start_time,
            end_time: performanceData.end_time,
            capacity: performanceData.max_participants,
            gms: performanceData.gms,
            notes: performanceData.notes
          })

          // ローカル状態を更新
          setEvents(prev => prev.map(event => 
            event.id === performanceData.id ? performanceData : event
          ))
        }
      }

      handleCloseModal()
    } catch (error) {
      console.error('公演保存エラー:', error)
      alert(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
    }
  }

  // 削除確認ダイアログを開く
  const handleDeletePerformance = (event: ScheduleEvent) => {
    setDeletingEvent(event)
    setIsDeleteDialogOpen(true)
  }

  // 中止確認ダイアログを開く
  const handleCancelConfirmPerformance = (event: ScheduleEvent) => {
    setCancellingEvent(event)
    setIsCancelDialogOpen(true)
  }

  // 公演を削除
  const handleConfirmDelete = async () => {
    if (!deletingEvent) return

    try {
      // 貸切リクエストの場合は reservations テーブルから削除
      // IDが "private-" で始まる場合も貸切として扱う
      const isPrivateBooking = deletingEvent.is_private_request || deletingEvent.id.startsWith('private-')
      
      if (isPrivateBooking) {
        // reservation_idを抽出（"private-{uuid}-{order}"から{uuid}部分を取得）
        const reservationId = deletingEvent.reservation_id || deletingEvent.id.split('-').slice(1, 6).join('-')
        
        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', reservationId)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を削除
        setEvents(prev => prev.filter(event => {
          const eventReservationId = event.reservation_id || (event.id.startsWith('private-') ? event.id.split('-').slice(1, 6).join('-') : null)
          return eventReservationId !== reservationId
        }))
      } else {
        // 通常公演の場合は schedule_events から削除
        await scheduleApi.delete(deletingEvent.id)
        
        // ローカル状態から削除
        setEvents(prev => prev.filter(event => event.id !== deletingEvent.id))
      }

      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    } catch (error) {
      console.error('公演削除エラー:', error)
      alert('公演の削除に失敗しました')
    }
  }

  // 中止を実行
  const handleConfirmCancel = async () => {
    if (!cancellingEvent) return

    try {
      // 貸切リクエストの場合は reservations テーブルを更新
      if (cancellingEvent.is_private_request && cancellingEvent.reservation_id) {
        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', cancellingEvent.reservation_id)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を中止状態に
        setEvents(prev => prev.map(e => 
          e.reservation_id === cancellingEvent.reservation_id ? { ...e, is_cancelled: true } : e
        ))
      } else {
        // 通常公演の場合は schedule_events を更新
        await scheduleApi.toggleCancel(cancellingEvent.id, true)

        // ローカル状態を更新
        setEvents(prev => prev.map(e => 
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true } : e
        ))
      }

      setIsCancelDialogOpen(false)
      setCancellingEvent(null)
    } catch (error) {
      console.error('公演中止エラー:', error)
      alert('公演の中止処理に失敗しました')
    }
  }

  // 公演をキャンセル解除
  const handleCancelPerformance = async (event: ScheduleEvent) => {
    try {
      // 貸切リクエストの場合は reservations テーブルを更新
      if (event.is_private_request && event.reservation_id) {
        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'gm_confirmed', // 元のステータスに戻す
            updated_at: new Date().toISOString()
          })
          .eq('id', event.reservation_id)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を復活
        setEvents(prev => prev.map(e => 
          e.reservation_id === event.reservation_id ? { ...e, is_cancelled: false } : e
        ))
      } else {
        // 通常公演の場合は schedule_events を更新
        await scheduleApi.toggleCancel(event.id, false)

        // ローカル状態を更新
        setEvents(prev => prev.map(e => 
          e.id === event.id ? { ...e, is_cancelled: false } : e
        ))
      }
    } catch (error) {
      console.error('公演キャンセル解除エラー:', error)
      alert('公演のキャンセル解除処理に失敗しました')
    }
  }

  // 公演のキャンセルを解除
  const handleUncancelPerformance = async (event: ScheduleEvent) => {
    handleCancelPerformance(event) // キャンセル解除処理
  }

  // 予約サイト公開/非公開トグル
  const handleToggleReservation = (event: ScheduleEvent) => {
    // 貸切公演の場合は操作不可
    if (event.is_private_request) {
      alert('貸切公演の公開状態は変更できません')
      return
    }
    setPublishingEvent(event)
    setIsPublishDialogOpen(true)
  }
  
  const handleConfirmPublishToggle = async () => {
    if (!publishingEvent) return
    
    // 貸切公演の場合は操作不可（念のためダブルチェック）
    // IDが "private-" で始まる場合も貸切公演とみなす
    if (publishingEvent.is_private_request || publishingEvent.id.startsWith('private-')) {
      alert('貸切公演の公開状態は変更できません')
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
      return
    }
    
    try {
      const newStatus = !publishingEvent.is_reservation_enabled
      
      // Supabaseで更新
      await scheduleApi.update(publishingEvent.id, {
        is_reservation_enabled: newStatus
      })

      // ローカル状態を更新
      setEvents(prev => prev.map(e => 
        e.id === publishingEvent.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))
      
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
    } catch (error) {
      console.error('予約サイト公開状態の更新エラー:', error)
      alert('予約サイト公開状態の更新に失敗しました')
    }
  }


  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="schedule" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
          
          {/* 初回ローディング表示（一度もロードされていない場合のみ） */}
          {!hasEverLoadedStores.current && stores.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <div className="text-muted-foreground">データを読み込み中...</div>
              </div>
            </div>
          )}
          
          {/* ヘッダー部分とカテゴリタブ（一度でもロードされたら常に表示） */}
          {(stores.length > 0 || hasEverLoadedStores.current) && (
          <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">月間スケジュール管理</h2>
              {/* 更新中のインジケーター */}
              {isLoading && stores.length > 0 && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                  <span>更新中...</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {/* 月選択コントロール */}
              <div className="flex items-center gap-2 border rounded-lg p-1">
                <Button variant="ghost" size="sm" onClick={() => changeMonth('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={currentDate.getMonth().toString()} onValueChange={(value) => {
                  // 月切り替え時はスクロール位置をクリア
                  sessionStorage.removeItem('scheduleScrollY')
                  sessionStorage.removeItem('scheduleScrollTime')
                  const newDate = new Date(currentDate)
                  newDate.setMonth(parseInt(value))
                  setCurrentDate(newDate)
                }}>
                  <SelectTrigger className="w-32 border-0 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {new Date(2025, i).toLocaleDateString('ja-JP', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => changeMonth('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* インポートボタン */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
              >
                インポート
              </Button>
            </div>
          </div>

          {/* カテゴリタブ */}
          <div className="bg-card border rounded-lg p-4">
            <h3 className="flex items-center gap-2">
              公演カテゴリ
              <span className="text-sm text-muted-foreground">
                （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
              </span>
            </h3>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mt-4">
              <TabsList className="grid grid-cols-6 w-fit gap-1">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  すべて ({categoryCounts.all})
                </TabsTrigger>
                <TabsTrigger value="open" className="bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900">
                  オープン公演 ({categoryCounts.open})
                </TabsTrigger>
                <TabsTrigger value="private" className="bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900">
                  貸切公演 ({categoryCounts.private})
                </TabsTrigger>
                <TabsTrigger value="gmtest" className="bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900">
                  GMテスト ({categoryCounts.gmtest})
                </TabsTrigger>
                <TabsTrigger value="testplay" className="bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900">
                  テストプレイ ({categoryCounts.testplay})
                </TabsTrigger>
                <TabsTrigger value="trip" className="bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900">
                  出張公演 ({categoryCounts.trip})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* メインカード・テーブル */}
          <Card>
            <CardHeader className="bg-muted/30 border-b border-border">
              <CardTitle>リストカレンダー - {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</CardTitle>
              <CardDescription className="text-muted-foreground">
                ※公演のタイトルが未決定の場合、当該公演は薄い色で警告表示されます<br/>
                ※シナリオやGMが未定の場合は赤い色で警告表示されます
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="table-fixed w-full">
                <colgroup>
                  <col className="w-24" />
                  <col className="w-16" />
                  <col className="w-24" />
                  <col style={{ width: '300px' }} />
                  <col style={{ width: '300px' }} />
                  <col style={{ width: '300px' }} />
                  <col className="w-32" />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="border-r">日付</TableHead>
                    <TableHead className="border-r">曜日</TableHead>
                    <TableHead className="border-r">会場</TableHead>
                    <TableHead className="border-r">午前 (~12:00)</TableHead>
                    <TableHead className="border-r">午後 (12:00-17:00)</TableHead>
                    <TableHead className="border-r">夜間 (17:00~)</TableHead>
                    <TableHead>メモ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDays.map(day => {
                    return stores.map((store, storeIndex) => (
                      <TableRow key={`${day.date}-${store.id}`} className="h-16">
                        {/* 日付セル */}
                        {storeIndex === 0 ? (
                          <TableCell className="schedule-table-cell border-r text-sm" rowSpan={stores.length}>
                            {day.displayDate}
                          </TableCell>
                        ) : null}
                        
                        {/* 曜日セル */}
                        {storeIndex === 0 ? (
                          <TableCell className={`schedule-table-cell border-r text-sm ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.length}>
                            {day.dayOfWeek}
                          </TableCell>
                        ) : null}
                        
                        {/* 店舗セル */}
                        <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-sm">
                          {store.short_name}
                        </TableCell>
                        
                        {/* 午前セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'morning')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="morning"
                          availableStaff={shiftData[`${day.date}-morning`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                          onToggleReservation={handleToggleReservation}
                        />
                        
                        {/* 午後セル */}
                        <TimeSlotCell
                          events={(() => {
                            const events = getEventsForSlot(day.date, store.id, 'afternoon')
                            return events
                          })()}
                          date={day.date}
                          venue={store.id}
                          timeSlot="afternoon"
                          availableStaff={shiftData[`${day.date}-afternoon`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                          onToggleReservation={handleToggleReservation}
                        />
                        
                        {/* 夜間セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'evening')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="evening"
                          availableStaff={shiftData[`${day.date}-evening`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onToggleReservation={handleToggleReservation}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                        />
                        
                        {/* メモセル */}
                        <MemoCell
                          date={day.date}
                          venue={store.id}
                          initialMemo={getMemo(day.date, store.id)}
                          onSave={handleSaveMemo}
                        />
                      </TableRow>
                    ))
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
          )}
        </div>
      </div>

          {/* 公演モーダル（追加・編集共通） */}
          <PerformanceModal
            isOpen={isPerformanceModalOpen}
            onClose={handleCloseModal}
            onSave={handleSavePerformance}
            mode={modalMode}
            event={editingEvent}
            initialData={modalInitialData}
            stores={stores}
            scenarios={scenarios}
            staff={staff}
            availableStaffByScenario={availableStaffByScenario}
            onScenariosUpdate={handleScenariosUpdate}
            onStaffUpdate={handleStaffUpdate}
          />

          {/* 削除確認ダイアログ */}
          {isDeleteDialogOpen && deletingEvent && (
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>公演を削除</DialogTitle>
                  <DialogDescription>
                    この公演を削除してもよろしいですか？この操作は取り消せません。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p><strong>日付:</strong> {deletingEvent.date}</p>
                  <p><strong>時間:</strong> {deletingEvent.start_time.slice(0, 5)} - {deletingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {deletingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {deletingEvent.gms.join(', ') || '未定'}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmDelete}>
                    削除
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* 中止確認ダイアログ */}
          {isCancelDialogOpen && cancellingEvent && (
            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>公演を中止</DialogTitle>
                  <DialogDescription>
                    この公演を中止してもよろしいですか？中止後も復活させることができます。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p><strong>日付:</strong> {cancellingEvent.date}</p>
                  <p><strong>時間:</strong> {cancellingEvent.start_time.slice(0, 5)} - {cancellingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {cancellingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {cancellingEvent.gms.join(', ') || '未定'}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmCancel}>
                    中止
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          {/* 予約サイト公開/非公開確認ダイアログ */}
          {publishingEvent && (
            <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {publishingEvent.is_reservation_enabled ? '予約サイトから非公開にする' : '予約サイトに公開する'}
                  </DialogTitle>
                  <DialogDescription>
                    {publishingEvent.is_reservation_enabled 
                      ? 'この公演を予約サイトから非公開にしてもよろしいですか？'
                      : 'この公演を予約サイトに公開してもよろしいですか？お客様が予約できるようになります。'
                    }
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 bg-muted/50 p-4 rounded">
                  <p><strong>日付:</strong> {publishingEvent.date}</p>
                  <p><strong>時間:</strong> {publishingEvent.start_time.slice(0, 5)} - {publishingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {publishingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {publishingEvent.gms.join(', ') || '未定'}</p>
                  <p><strong>最大参加者数:</strong> {publishingEvent.max_participants || 8}名</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button 
                    onClick={handleConfirmPublishToggle}
                    className={publishingEvent.is_reservation_enabled ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {publishingEvent.is_reservation_enabled ? '非公開にする' : '公開する'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

      {/* インポートモーダル */}
      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          // インポート完了後にデータを再読み込み
          const loadEvents = async () => {
            const year = currentDate.getFullYear()
            const month = currentDate.getMonth() + 1
            const data = await scheduleApi.getByMonth(year, month)
            const formattedEvents: ScheduleEvent[] = data.map((event: any) => ({
              id: event.id,
              date: event.date,
              venue: event.store_id,
              scenario: event.scenarios?.title || event.scenario || '',
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
            setEvents(formattedEvents)
          }
          loadEvents()
        }}
      />

      {/* 重複警告モーダル */}
      <ConflictWarningModal
        isOpen={isConflictWarningOpen}
        onClose={() => {
          setIsConflictWarningOpen(false)
          setConflictInfo(null)
          setPendingPerformanceData(null)
        }}
        onContinue={async () => {
          if (pendingPerformanceData && conflictInfo) {
            try {
              // タイムスロットを判定
              const startHour = parseInt(pendingPerformanceData.start_time.split(':')[0])
              let timeSlot: 'morning' | 'afternoon' | 'evening'
              if (startHour < 12) {
                timeSlot = 'morning'
              } else if (startHour < 18) {
                timeSlot = 'afternoon'
              } else {
                timeSlot = 'evening'
              }
              
              // 既存の重複公演を削除
              const conflictingEvents = events.filter(event => {
                // 編集中の公演自身は除外
                if (modalMode === 'edit' && event.id === pendingPerformanceData.id) {
                  return false
                }
                
                const eventTimeSlot = getTimeSlot(event.start_time)
                return event.date === pendingPerformanceData.date &&
                       event.venue === pendingPerformanceData.venue &&
                       eventTimeSlot === timeSlot &&
                       !event.is_cancelled
              })
              
              // 既存公演を削除
              for (const conflictEvent of conflictingEvents) {
                if (conflictEvent.is_private_request && conflictEvent.reservation_id) {
                  // 貸切リクエストの場合
                  await supabase
                    .from('reservations')
                    .delete()
                    .eq('id', conflictEvent.reservation_id)
                } else {
                  // 通常公演の場合
                  await scheduleApi.delete(conflictEvent.id)
                }
              }
              
              // ローカル状態から削除
              setEvents(prev => prev.filter(event => {
                const eventTimeSlot = getTimeSlot(event.start_time)
                const isConflict = event.date === pendingPerformanceData.date &&
                                  event.venue === pendingPerformanceData.venue &&
                                  eventTimeSlot === timeSlot &&
                                  !event.is_cancelled &&
                                  event.id !== pendingPerformanceData.id
                return !isConflict
              }))
              
              // 新しい公演を保存
              await doSavePerformance(pendingPerformanceData)
              setPendingPerformanceData(null)
            } catch (error) {
              console.error('既存公演の削除エラー:', error)
              alert('既存公演の削除に失敗しました')
            }
          }
        }}
        conflictInfo={conflictInfo}
      />
    </div>
  )
}

