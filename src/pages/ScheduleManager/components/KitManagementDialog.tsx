/**
 * キット管理ダイアログ
 * 
 * シナリオキットの現在位置確認、週間需要の可視化、移動計画の作成を行う
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { kitApi } from '@/lib/api/kitApi'
import { storeApi, scenarioApi, scheduleApi } from '@/lib/api'
import { showToast } from '@/utils/toast'
import { calculateKitTransfers, type KitState } from '@/utils/kitOptimizer'
import type { KitLocation, KitTransferEvent, KitTransferSuggestion, Store, Scenario, KitCondition } from '@/types'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu'
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw, Plus, Minus, Search, GripVertical } from 'lucide-react'

// ドラッグ中のキット情報
interface DraggedKit {
  scenarioId: string
  kitNumber: number
  fromStoreId: string
}

// コンテキストメニュー情報
interface ContextMenuState {
  x: number
  y: number
  scenarioId: string
  kitNumber: number
  storeId: string
  condition: KitCondition
}

interface KitManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}

// 曜日の選択肢
const WEEKDAYS = [
  { value: 0, label: '日曜日', short: '日' },
  { value: 1, label: '月曜日', short: '月' },
  { value: 2, label: '火曜日', short: '火' },
  { value: 3, label: '水曜日', short: '水' },
  { value: 4, label: '木曜日', short: '木' },
  { value: 5, label: '金曜日', short: '金' },
  { value: 6, label: '土曜日', short: '土' },
]

export function KitManagementDialog({ isOpen, onClose }: KitManagementDialogProps) {
  // データ
  const [kitLocations, setKitLocations] = useState<KitLocation[]>([])
  const [transferEvents, setTransferEvents] = useState<KitTransferEvent[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<Array<{
    date: string
    store_id: string
    scenario_id: string
  }>>([])

  // UI状態
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('current')
  const [startDayOfWeek, setStartDayOfWeek] = useState(1) // デフォルト: 月曜日
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => {
    // 今日を含む週の開始日
    const today = new Date()
    const day = today.getDay()
    const diff = (day - 1 + 7) % 7 // 月曜日からの差分
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - diff)
    return weekStart
  })

  // 移動提案
  const [suggestions, setSuggestions] = useState<KitTransferSuggestion[]>([])
  const [isCalculating, setIsCalculating] = useState(false)
  
  // 移動可能曜日（デフォルト: 月・木）
  const [transferDays, setTransferDays] = useState<number[]>([1, 5])
  
  // シナリオ検索
  const [scenarioSearch, setScenarioSearch] = useState('')
  
  // コンテキストメニュー
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  
  // ドラッグ&ドロップ
  const [draggedKit, setDraggedKit] = useState<DraggedKit | null>(null)
  const [dragOverStoreId, setDragOverStoreId] = useState<string | null>(null)
  

  // 週の日付リスト
  const weekDates = useMemo(() => {
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(selectedWeekStart)
      date.setDate(selectedWeekStart.getDate() + i)
      dates.push(date.toISOString().split('T')[0])
    }
    return dates
  }, [selectedWeekStart])

  // 検索フィルタ関数
  const matchesSearch = useCallback((scenario: Scenario) => {
    if (!scenarioSearch.trim()) return true
    const search = scenarioSearch.toLowerCase()
    return (
      scenario.title.toLowerCase().includes(search) ||
      scenario.author?.toLowerCase().includes(search)
    )
  }, [scenarioSearch])
  
  // キット数があるシナリオのみフィルタ
  const scenariosWithKits = useMemo(() => {
    return scenarios
      .filter(s => s.kit_count && s.kit_count > 0)
      .filter(matchesSearch)
  }, [scenarios, matchesSearch])
  
  // キット未設定のシナリオ
  const scenariosWithoutKits = useMemo(() => {
    return scenarios
      .filter(s => !s.kit_count || s.kit_count === 0)
      .filter(matchesSearch)
  }, [scenarios, matchesSearch])

  // シナリオIDからシナリオ情報を取得
  const scenarioMap = useMemo(() => {
    return new Map(scenarios.map(s => [s.id, s]))
  }, [scenarios])

  // 店舗IDから店舗情報を取得
  const storeMap = useMemo(() => {
    return new Map(stores.map(s => [s.id, s]))
  }, [stores])
  
  // キットグループのマッピング（同じグループの店舗は同一拠点）
  const getStoreGroupId = useMemo(() => {
    return (storeId: string): string => {
      const store = storeMap.get(storeId)
      if (store?.kit_group_id) {
        return store.kit_group_id
      }
      // 自分が他店舗のkit_group_idとして参照されている場合、自分がグループ代表
      return storeId
    }
  }, [storeMap])
  
  // 同じキットグループかどうかをチェック
  const isSameStoreGroup = useMemo(() => {
    return (storeId1: string, storeId2: string): boolean => {
      return getStoreGroupId(storeId1) === getStoreGroupId(storeId2)
    }
  }, [getStoreGroupId])
  
  // グループ表示名を取得（森①と森②→「森」、グループなし→そのまま）
  const getGroupDisplayName = useCallback((storeId: string): string => {
    const store = storeMap.get(storeId)
    if (!store) return '?'
    
    const name = store.short_name || store.name
    
    // このストアがグループに属しているか、または他のストアから参照されているかチェック
    const hasGroup = store.kit_group_id || 
      [...storeMap.values()].some(s => s.kit_group_id === storeId)
    
    if (hasGroup) {
      // 数字や記号（①②など）を除去して共通名を取得
      const commonName = name.replace(/[①②③④⑤⑥⑦⑧⑨⑩0-9１２３４５６７８９０]/g, '').trim()
      return commonName || name
    }
    
    return name
  }, [storeMap])
  
  // 店舗ごとの在庫（store_id -> シナリオ情報の配列）
  const storeInventory = useMemo(() => {
    const inventory = new Map<string, Array<{
      scenario: Scenario
      kits: Array<{ kitNumber: number; condition: KitCondition; conditionNotes?: string | null }>
    }>>()
    
    // アクティブな店舗で初期化
    stores.filter(s => s.status === 'active').forEach(store => {
      inventory.set(store.id, [])
    })
    
    // キット位置情報を集約
    for (const loc of kitLocations) {
      const scenario = scenarioMap.get(loc.scenario_id)
      if (!scenario) continue
      
      const storeKits = inventory.get(loc.store_id)
      if (!storeKits) continue
      
      const existing = storeKits.find(s => s.scenario.id === loc.scenario_id)
      const kitInfo = {
        kitNumber: loc.kit_number,
        condition: (loc.condition || 'good') as KitCondition,
        conditionNotes: loc.condition_notes
      }
      
      if (existing) {
        existing.kits.push(kitInfo)
      } else {
        storeKits.push({ scenario, kits: [kitInfo] })
      }
    }
    
    return inventory
  }, [kitLocations, scenarioMap, stores])
  
  // 週間の日付×店舗×シナリオでキット不足を計算
  const kitShortages = useMemo(() => {
    const shortages: Array<{
      date: string
      store_id: string
      scenario_id: string
      needed: number
      available: number
    }> = []
    
    // 現在のキット状態をシミュレート
    const currentState = new Map<string, string>() // `${scenario_id}-${kit_number}` -> store_id
    for (const loc of kitLocations) {
      currentState.set(`${loc.scenario_id}-${loc.kit_number}`, loc.store_id)
    }
    
    // 日付順に需要をチェック
    for (const date of weekDates) {
      const dayEvents = scheduleEvents.filter(e => e.date === date)
      
      // 店舗×シナリオで集計
      const needs = new Map<string, number>() // `${store_id}-${scenario_id}` -> count
      for (const event of dayEvents) {
        const key = `${event.store_id}-${event.scenario_id}`
        needs.set(key, (needs.get(key) || 0) + 1)
      }
      
      // 各需要に対して在庫をチェック
      for (const [key, needed] of needs) {
        const [storeId, scenarioId] = key.split('-')
        const scenario = scenarioMap.get(scenarioId)
        if (!scenario) continue
        
        // その店舗（または同じグループの店舗）にあるキット数をカウント
        const kitCount = scenario.kit_count || 1
        let available = 0
        for (let i = 1; i <= kitCount; i++) {
          const kitLocation = currentState.get(`${scenarioId}-${i}`)
          if (kitLocation && isSameStoreGroup(kitLocation, storeId)) {
            available++
          }
        }
        
        if (available < needed) {
          shortages.push({
            date,
            store_id: storeId,
            scenario_id: scenarioId,
            needed,
            available
          })
        }
      }
    }
    
    return shortages
  }, [weekDates, scheduleEvents, kitLocations, scenarioMap, isSameStoreGroup])
  
  // 移動提案をルート（店舗グループ→店舗グループ）でグループ化
  // ヘッダーはグループ名、個々のアイテムは実際の店舗名を保持
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, {
      from_store_id: string
      from_store_name: string
      to_store_id: string
      to_store_name: string
      isGrouped: boolean  // 複数店舗がグループ化されているか
      items: KitTransferSuggestion[]
    }>()
    
    for (const s of suggestions) {
      // 同じグループ内の移動は除外
      if (isSameStoreGroup(s.from_store_id, s.to_store_id)) {
        continue
      }
      
      // グループの代表店舗IDでキーを作成
      const fromGroupId = getStoreGroupId(s.from_store_id)
      const toGroupId = getStoreGroupId(s.to_store_id)
      const key = `${fromGroupId}->${toGroupId}`
      
      if (!groups.has(key)) {
        // グループ代表店舗の名前を取得
        const fromGroupStore = storeMap.get(fromGroupId)
        const toGroupStore = storeMap.get(toGroupId)
        // 行き先がグループ化されているか（代表店舗と違う店舗への移動があるか）
        const isToGrouped = toGroupId !== s.to_store_id
        groups.set(key, {
          from_store_id: fromGroupId,
          from_store_name: fromGroupStore?.short_name || fromGroupStore?.name || s.from_store_name,
          to_store_id: toGroupId,
          to_store_name: toGroupStore?.short_name || toGroupStore?.name || s.to_store_name,
          isGrouped: isToGrouped,
          items: []
        })
      } else {
        // 既にグループがある場合、異なる店舗への移動があればグループ化フラグを立てる
        const group = groups.get(key)!
        if (s.to_store_id !== group.to_store_id && s.to_store_id !== toGroupId) {
          group.isGrouped = true
        }
      }
      groups.get(key)!.items.push(s)
    }
    
    // 配列に変換して起点店舗の表示順でソート
    return [...groups.values()].sort((a, b) => {
      const fromStoreA = storeMap.get(a.from_store_id)
      const fromStoreB = storeMap.get(b.from_store_id)
      const orderA = fromStoreA?.display_order ?? 999
      const orderB = fromStoreB?.display_order ?? 999
      if (orderA !== orderB) return orderA - orderB
      // 同じ起点なら行き先の表示順でソート
      const toStoreA = storeMap.get(a.to_store_id)
      const toStoreB = storeMap.get(b.to_store_id)
      const toOrderA = toStoreA?.display_order ?? 999
      const toOrderB = toStoreB?.display_order ?? 999
      return toOrderA - toOrderB
    })
  }, [suggestions, storeMap, isSameStoreGroup, getStoreGroupId])
  
  // 確定済み移動イベントをルート（店舗グループ）でグループ化
  const groupedTransferEvents = useMemo(() => {
    // 同グループ内の移動を除外
    const activeEvents = transferEvents.filter(e => 
      e.status !== 'cancelled' && !isSameStoreGroup(e.from_store_id, e.to_store_id)
    )
    const groups = new Map<string, {
      from_store_id: string
      from_store_name: string
      to_store_id: string
      to_store_name: string
      isGrouped: boolean
      items: KitTransferEvent[]
    }>()
    
    for (const e of activeEvents) {
      // グループの代表店舗IDでキーを作成
      const fromGroupId = getStoreGroupId(e.from_store_id)
      const toGroupId = getStoreGroupId(e.to_store_id)
      const key = `${fromGroupId}->${toGroupId}`
      
      if (!groups.has(key)) {
        const fromGroupStore = storeMap.get(fromGroupId)
        const toGroupStore = storeMap.get(toGroupId)
        const isToGrouped = toGroupId !== e.to_store_id
        groups.set(key, {
          from_store_id: fromGroupId,
          from_store_name: fromGroupStore?.short_name || fromGroupStore?.name || '?',
          to_store_id: toGroupId,
          to_store_name: toGroupStore?.short_name || toGroupStore?.name || '?',
          isGrouped: isToGrouped,
          items: []
        })
      } else {
        const group = groups.get(key)!
        if (e.to_store_id !== group.to_store_id && e.to_store_id !== toGroupId) {
          group.isGrouped = true
        }
      }
      groups.get(key)!.items.push(e)
    }
    
    // 起点店舗の表示順でソート
    return [...groups.values()].sort((a, b) => {
      const fromStoreA = storeMap.get(a.from_store_id)
      const fromStoreB = storeMap.get(b.from_store_id)
      const orderA = fromStoreA?.display_order ?? 999
      const orderB = fromStoreB?.display_order ?? 999
      if (orderA !== orderB) return orderA - orderB
      // 同じ起点なら行き先の表示順でソート
      const toStoreA = storeMap.get(a.to_store_id)
      const toStoreB = storeMap.get(b.to_store_id)
      const toOrderA = toStoreA?.display_order ?? 999
      const toOrderB = toStoreB?.display_order ?? 999
      return toOrderA - toOrderB
    })
  }, [transferEvents, storeMap, isSameStoreGroup, getStoreGroupId])

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [locationsData, storesData, scenariosData] = await Promise.all([
        kitApi.getKitLocations(),
        storeApi.getAll(),
        scenarioApi.getAll()
      ])
      setKitLocations(locationsData)
      setStores(storesData)
      setScenarios(scenariosData)

      // 週間スケジュールを取得
      const startDate = weekDates[0]
      const endDate = weekDates[6]
      const eventsData = await scheduleApi.getByDateRange(startDate, endDate)
      
      // デバッグログ
      console.log('📅 スケジュール取得:', {
        startDate,
        endDate,
        totalEvents: eventsData.length,
        eventsWithScenarioId: eventsData.filter(e => e.scenario_id).length,
        sampleEvents: eventsData.slice(0, 3).map(e => ({
          date: e.date,
          scenario: e.scenario,
          scenario_id: e.scenario_id,
          store_id: e.store_id
        }))
      })
      
      setScheduleEvents(eventsData.map(e => ({
        date: e.date,
        store_id: e.store_id || e.venue,
        scenario_id: e.scenario_id || ''
      })).filter(e => e.scenario_id))

      // 移動イベントを取得
      const transfersData = await kitApi.getTransferEvents(startDate, endDate)
      setTransferEvents(transfersData)
    } catch (error) {
      console.error('Failed to fetch kit data:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [weekDates])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen, fetchData])

  // 週の開始日を変更
  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newStart = new Date(selectedWeekStart)
    newStart.setDate(selectedWeekStart.getDate() + (direction === 'next' ? 7 : -7))
    setSelectedWeekStart(newStart)
  }

  // 起点曜日を変更した時に週の開始日を調整
  const handleStartDayChange = (value: string) => {
    const newStartDay = parseInt(value)
    setStartDayOfWeek(newStartDay)
    
    // 今日を含む週の開始日を再計算
    const today = new Date()
    const day = today.getDay()
    const diff = (day - newStartDay + 7) % 7
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - diff)
    setSelectedWeekStart(weekStart)
  }

  // 移動計画を計算
  const handleCalculateTransfers = useCallback(async () => {
    setIsCalculating(true)
    try {
      // 現在のキット状態を構築
      const kitState: KitState = {}
      for (const loc of kitLocations) {
        if (!kitState[loc.scenario_id]) {
          kitState[loc.scenario_id] = {}
        }
        kitState[loc.scenario_id][loc.kit_number] = loc.store_id
      }

      // 週間需要を構築（scenario_idがあるイベントのみ）
      const demands: Array<{ date: string; store_id: string; scenario_id: string }> = []
      for (const event of scheduleEvents) {
        if (weekDates.includes(event.date) && event.scenario_id) {
          demands.push({
            date: event.date,
            store_id: event.store_id,
            scenario_id: event.scenario_id
          })
        }
      }

      // デバッグログ
      console.log('📦 移動計算デバッグ:', {
        kitLocations: kitLocations.length,
        kitState: Object.keys(kitState).length,
        scheduleEvents: scheduleEvents.length,
        weekDates,
        demands: demands.length,
        scenariosWithKits: scenariosWithKits.length,
        transferDays
      })
      
      if (demands.length === 0) {
        console.warn('⚠️ 週間需要が0件です。スケジュールにシナリオが設定されていない可能性があります。')
      }

      // 移動計画を計算
      const result = calculateKitTransfers(
        kitState,
        demands,
        scenariosWithKits,
        stores,
        transferDays
      )

      console.log('📦 移動計算結果:', result)
      setSuggestions(result)
      
      if (result.length === 0) {
        if (demands.length === 0) {
          showToast.info('この週にシナリオ付きのイベントがありません')
        } else {
          showToast.success('移動は不要です（すべてのキットが適切な店舗にあります）')
        }
      } else {
        showToast.success(`${result.length}件の移動が必要です`)
      }
    } catch (error) {
      console.error('Failed to calculate transfers:', error)
      showToast.error('移動計画の計算に失敗しました')
    } finally {
      setIsCalculating(false)
    }
  }, [kitLocations, scheduleEvents, weekDates, scenariosWithKits, stores, transferDays])

  // 移動提案を確定（イベントとして登録）
  const handleConfirmSuggestions = async () => {
    if (suggestions.length === 0) return

    try {
      const events = suggestions.map(s => ({
        scenario_id: s.scenario_id,
        kit_number: s.kit_number,
        from_store_id: s.from_store_id,
        to_store_id: s.to_store_id,
        transfer_date: s.transfer_date,
        status: 'pending' as const,
        notes: s.reason
      }))

      await kitApi.createTransferEvents(events)
      showToast.success('移動計画を登録しました')
      setSuggestions([])
      fetchData()
    } catch (error) {
      console.error('Failed to create transfer events:', error)
      showToast.error('移動計画の登録に失敗しました')
    }
  }

  // 移動イベントのステータス更新
  const handleUpdateStatus = async (eventId: string, status: 'completed' | 'cancelled') => {
    try {
      await kitApi.updateTransferStatus(eventId, status)
      showToast.success(status === 'completed' ? '移動完了としてマークしました' : 'キャンセルしました')
      fetchData()
    } catch (error) {
      console.error('Failed to update transfer status:', error)
      showToast.error('更新に失敗しました')
    }
  }

  // キット位置を手動更新
  const handleSetKitLocation = async (scenarioId: string, kitNumber: number, storeId: string) => {
    try {
      await kitApi.setKitLocation(scenarioId, kitNumber, storeId)
      showToast.success('キット位置を更新しました')
      fetchData()
    } catch (error) {
      console.error('Failed to set kit location:', error)
      showToast.error('更新に失敗しました')
    }
  }

  // キット数を変更
  const handleChangeKitCount = async (scenarioId: string, newCount: number) => {
    if (newCount < 1) return
    
    try {
      await scenarioApi.update(scenarioId, { kit_count: newCount })
      showToast.success(`キット数を${newCount}に変更しました`)
      
      // シナリオリストを更新
      setScenarios(prev => prev.map(s => 
        s.id === scenarioId ? { ...s, kit_count: newCount } : s
      ))
    } catch (error) {
      console.error('Failed to update kit count:', error)
      showToast.error('キット数の更新に失敗しました')
    }
  }
  
  // キット状態を更新
  const handleUpdateCondition = async (
    scenarioId: string,
    kitNumber: number,
    condition: KitCondition,
    conditionNotes?: string | null
  ) => {
    try {
      await kitApi.updateKitCondition(scenarioId, kitNumber, condition, conditionNotes)
      showToast.success('キット状態を更新しました')
      fetchData()
    } catch (error) {
      console.error('Failed to update kit condition:', error)
      showToast.error('状態の更新に失敗しました')
    }
  }
  
  // キットを別店舗に移動
  const handleMoveKit = async (scenarioId: string, kitNumber: number, toStoreId: string) => {
    try {
      await kitApi.setKitLocation(scenarioId, kitNumber, toStoreId)
      const targetStore = storeMap.get(toStoreId)
      showToast.success(`${targetStore?.short_name || targetStore?.name || '別店舗'}に移動しました`)
      fetchData()
    } catch (error) {
      console.error('Failed to move kit:', error)
      showToast.error('移動に失敗しました')
    }
  }
  
  // ドラッグ開始
  const handleDragStart = (e: React.DragEvent, scenarioId: string, kitNumber: number, fromStoreId: string) => {
    setDraggedKit({ scenarioId, kitNumber, fromStoreId })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${scenarioId}:${kitNumber}`)
  }
  
  // ドラッグ終了
  const handleDragEnd = () => {
    setDraggedKit(null)
    setDragOverStoreId(null)
  }
  
  // ドラッグオーバー（ドロップ先）
  const handleDragOver = (e: React.DragEvent, storeId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedKit && draggedKit.fromStoreId !== storeId) {
      setDragOverStoreId(storeId)
    }
  }
  
  // ドラッグ離れ
  const handleDragLeave = () => {
    setDragOverStoreId(null)
  }
  
  // ドロップ
  const handleDrop = async (e: React.DragEvent, toStoreId: string) => {
    e.preventDefault()
    setDragOverStoreId(null)
    
    if (draggedKit && draggedKit.fromStoreId !== toStoreId) {
      await handleMoveKit(draggedKit.scenarioId, draggedKit.kitNumber, toStoreId)
    }
    setDraggedKit(null)
  }
  
  // コンテキストメニュー表示
  const handleContextMenu = (
    e: React.MouseEvent,
    scenarioId: string,
    kitNumber: number,
    storeId: string,
    condition: KitCondition
  ) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      scenarioId,
      kitNumber,
      storeId,
      condition
    })
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
    return `${month}/${day}(${dayOfWeek})`
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            キット配置管理
          </DialogTitle>
          <DialogDescription>
            シナリオキットの現在位置を確認し、週間の公演スケジュールに合わせた移動計画を作成します
          </DialogDescription>
        </DialogHeader>

        {/* 週選択 */}
        <div className="flex items-center gap-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">起点曜日:</span>
            <Select value={startDayOfWeek.toString()} onValueChange={handleStartDayChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map(day => (
                  <SelectItem key={day.value} value={day.value.toString()}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleWeekChange('prev')}>
              ← 前週
            </Button>
            <span className="font-medium min-w-[200px] text-center">
              {formatDate(weekDates[0])} 〜 {formatDate(weekDates[6])}
            </span>
            <Button variant="outline" size="sm" onClick={() => handleWeekChange('next')}>
              次週 →
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>

        {/* タブ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="current">シナリオ別</TabsTrigger>
            <TabsTrigger value="store">店舗別在庫</TabsTrigger>
            <TabsTrigger value="demand">
              週間需要
              {kitShortages.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {kitShortages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="transfers">移動計画</TabsTrigger>
          </TabsList>

          {/* 現在の配置 */}
          <TabsContent value="current" className="flex-1 overflow-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="シナリオを検索..."
                    value={scenarioSearch}
                    onChange={(e) => setScenarioSearch(e.target.value)}
                    className="pl-8 h-8"
                  />
                  {scenarioSearch && (
                    <button
                      onClick={() => setScenarioSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  各シナリオのキットが現在どの店舗にあるかを表示・編集します
                </p>
              </div>
              
              {scenariosWithKits.length === 0 && scenariosWithoutKits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {scenarioSearch 
                    ? `「${scenarioSearch}」に一致するシナリオがありません`
                    : 'シナリオがありません'
                  }
                </div>
              ) : (
                <>
                <div className="grid gap-3">
                  {scenariosWithKits.map(scenario => {
                    const kitCount = scenario.kit_count || 1
                    const locations = kitLocations.filter(l => l.scenario_id === scenario.id)
                    
                    return (
                      <div key={scenario.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{scenario.title}</div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleChangeKitCount(scenario.id, kitCount - 1)}
                              disabled={kitCount <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Badge variant="outline" className="min-w-[60px] justify-center">
                              {kitCount}キット
                            </Badge>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleChangeKitCount(scenario.id, kitCount + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Array.from({ length: kitCount }, (_, i) => {
                            const kitNum = i + 1
                            const location = locations.find(l => l.kit_number === kitNum)
                            const currentStore = location ? storeMap.get(location.store_id) : null
                            const condition = location?.condition || 'good'
                            const conditionNotes = location?.condition_notes
                            
                            return (
                              <div
                                key={kitNum}
                                className={`rounded p-2 border ${
                                  condition !== 'good'
                                    ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/10'
                                    : 'border-transparent bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-sm font-medium">
                                    #{kitNum}
                                  </span>
                                  <Select
                                    value={location?.store_id || ''}
                                    onValueChange={(value) => handleSetKitLocation(scenario.id, kitNum, value)}
                                  >
                                    <SelectTrigger className="flex-1 h-7 text-xs">
                                      <SelectValue placeholder="店舗を選択">
                                        {currentStore?.short_name || currentStore?.name || '未設定'}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {stores.filter(s => s.status === 'active').map(store => (
                                        <SelectItem key={store.id} value={store.id}>
                                          {store.short_name || store.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                {/* 状態選択 */}
                                <div className="flex items-center gap-1.5">
                                  <Select
                                    value={condition}
                                    onValueChange={(value) => handleUpdateCondition(
                                      scenario.id,
                                      kitNum,
                                      value as KitCondition,
                                      conditionNotes
                                    )}
                                    disabled={!location}
                                  >
                                    <SelectTrigger className={`h-6 text-[10px] w-[72px] ${KIT_CONDITION_COLORS[condition as KitCondition]}`}>
                                      <SelectValue>
                                        {KIT_CONDITION_LABELS[condition as KitCondition]}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Object.keys(KIT_CONDITION_LABELS) as KitCondition[]).map(cond => (
                                        <SelectItem key={cond} value={cond}>
                                          <span className={`text-xs px-1 rounded ${KIT_CONDITION_COLORS[cond]}`}>
                                            {KIT_CONDITION_LABELS[cond]}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  
                                  {/* メモ入力 */}
                                  <Input
                                    placeholder="メモ..."
                                    value={conditionNotes || ''}
                                    onChange={(e) => {
                                      // ローカル状態を即座に更新（デバウンス用）
                                      const newNotes = e.target.value
                                      setKitLocations(prev => prev.map(loc =>
                                        loc.scenario_id === scenario.id && loc.kit_number === kitNum
                                          ? { ...loc, condition_notes: newNotes }
                                          : loc
                                      ))
                                    }}
                                    onBlur={(e) => {
                                      // フォーカスが外れたら保存
                                      if (location && e.target.value !== (location.condition_notes || '')) {
                                        handleUpdateCondition(scenario.id, kitNum, condition as KitCondition, e.target.value || null)
                                      }
                                    }}
                                    className="h-6 text-[10px] flex-1"
                                    disabled={!location}
                                  />
                                </div>
                                
                                {/* 状態に問題がある場合の警告 */}
                                {condition !== 'good' && conditionNotes && (
                                  <div className="mt-1 text-[10px] text-orange-700 dark:text-orange-300 truncate" title={conditionNotes}>
                                    ⚠ {conditionNotes}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* キット未設定のシナリオ */}
                {scenariosWithoutKits.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      キット未設定のシナリオ（クリックでキット管理を有効化）
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {scenariosWithoutKits.slice(0, 20).map(scenario => (
                        <Button
                          key={scenario.id}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleChangeKitCount(scenario.id, 1)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {scenario.title.slice(0, 15)}{scenario.title.length > 15 ? '...' : ''}
                        </Button>
                      ))}
                      {scenariosWithoutKits.length > 20 && (
                        <span className="text-xs text-muted-foreground self-center">
                          他 {scenariosWithoutKits.length - 20} 件
                        </span>
                      )}
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </TabsContent>

          {/* 店舗別在庫（カラム式） */}
          <TabsContent value="store" className="flex-1 overflow-auto">
            <p className="text-xs text-muted-foreground mb-2">
              ドラッグ&ドロップまたは右クリックで店舗間移動・状態変更ができます
            </p>
            <div className="flex gap-3 h-full overflow-x-auto pb-2">
              {stores.filter(s => s.status === 'active').map(store => {
                const inventory = storeInventory.get(store.id) || []
                const totalKits = inventory.reduce((sum, item) => sum + item.kits.length, 0)
                const isDragOver = dragOverStoreId === store.id
                
                return (
                  <div
                    key={store.id}
                    className={`
                      flex-shrink-0 w-48 bg-muted/30 rounded-lg flex flex-col transition-colors
                      ${isDragOver ? 'ring-2 ring-primary bg-primary/10' : ''}
                    `}
                    onDragOver={(e) => handleDragOver(e, store.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, store.id)}
                  >
                    {/* カラムヘッダー */}
                    <div className="p-2 border-b bg-muted/50 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {store.short_name || store.name}
                        </span>
                        <Badge variant="secondary" className="text-xs h-5">
                          {totalKits}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* キットカード一覧 */}
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-[100px]">
                      {inventory.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {isDragOver ? 'ここにドロップ' : 'キットなし'}
                        </p>
                      ) : (
                        inventory.flatMap(item =>
                          item.kits.map(kit => {
                            const hasIssue = kit.condition !== 'good'
                            const isDragging = draggedKit?.scenarioId === item.scenario.id && 
                                              draggedKit?.kitNumber === kit.kitNumber
                            return (
                              <div
                                key={`${item.scenario.id}-${kit.kitNumber}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item.scenario.id, kit.kitNumber, store.id)}
                                onDragEnd={handleDragEnd}
                                onContextMenu={(e) => handleContextMenu(e, item.scenario.id, kit.kitNumber, store.id, kit.condition)}
                                className={`
                                  px-2 py-1 rounded border bg-background text-xs cursor-grab active:cursor-grabbing
                                  ${hasIssue ? 'border-orange-300 dark:border-orange-700' : 'border-border'}
                                  ${isDragging ? 'opacity-50' : ''}
                                  hover:border-primary/50 hover:shadow-sm transition-all
                                `}
                                title={kit.conditionNotes || 'ドラッグで移動 / 右クリックでメニュー'}
                              >
                                {/* 状態 + シナリオ名 */}
                                <div className="flex items-center gap-1.5">
                                  <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span
                                    className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] ${KIT_CONDITION_COLORS[kit.condition]}`}
                                  >
                                    {kit.condition === 'good' ? '✓' : '!'}
                                  </span>
                                  <span className="font-medium leading-tight truncate flex-1">
                                    {(item.scenario.kit_count || 1) > 1 && (
                                      <span className="text-muted-foreground mr-1">#{kit.kitNumber}</span>
                                    )}
                                    {item.scenario.title}
                                  </span>
                                </div>
                                {/* 問題がある場合のみメモを表示 */}
                                {hasIssue && (
                                  <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5 truncate pl-7">
                                    {KIT_CONDITION_LABELS[kit.condition]}
                                    {kit.conditionNotes && `: ${kit.conditionNotes}`}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>

          {/* 週間需要 */}
          <TabsContent value="demand" className="flex-1 overflow-auto">
            <div className="space-y-4">
              {/* 警告表示 */}
              {kitShortages.length > 0 && (
                <div className="border border-red-200 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 font-medium text-red-800 dark:text-red-200 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    キット不足警告 ({kitShortages.length}件)
                  </div>
                  <div className="space-y-1 text-sm">
                    {kitShortages.slice(0, 5).map((shortage, index) => {
                      const store = storeMap.get(shortage.store_id)
                      const scenario = scenarioMap.get(shortage.scenario_id)
                      return (
                        <div key={index} className="flex items-center gap-2 text-red-700 dark:text-red-300">
                          <span className="font-medium">{formatDate(shortage.date)}</span>
                          <span>{store?.short_name || store?.name}</span>
                          <span>-</span>
                          <span>{scenario?.title.slice(0, 15)}{(scenario?.title.length || 0) > 15 ? '...' : ''}</span>
                          <span className="text-red-500">
                            (必要: {shortage.needed}, 在庫: {shortage.available})
                          </span>
                        </div>
                      )
                    })}
                    {kitShortages.length > 5 && (
                      <p className="text-muted-foreground">他 {kitShortages.length - 5} 件</p>
                    )}
                  </div>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                選択した週の各日・各店舗で必要なキットを表示します
              </p>

              {/* 日別×店舗別の需要表示 */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">日付</th>
                      {stores.filter(s => s.status === 'active').map(store => (
                        <th key={store.id} className="text-center p-2 font-medium min-w-[80px]">
                          {store.short_name || store.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekDates.map(date => {
                      const dayEvents = scheduleEvents.filter(e => e.date === date)
                      
                      return (
                        <tr key={date} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-medium">{formatDate(date)}</td>
                          {stores.filter(s => s.status === 'active').map(store => {
                            const storeEvents = dayEvents.filter(e => e.store_id === store.id)
                            const scenarioIds = [...new Set(storeEvents.map(e => e.scenario_id))]
                            
                            return (
                              <td key={store.id} className="p-2 text-center">
                                {scenarioIds.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {scenarioIds.map(sid => {
                                      const scenario = scenarioMap.get(sid)
                                      if (!scenario) return null
                                      const count = storeEvents.filter(e => e.scenario_id === sid).length
                                      
                                      // この店舗（または同じグループの店舗）にあるキット数をチェック
                                      const kitsAtStore = kitLocations.filter(
                                        loc => loc.scenario_id === sid && isSameStoreGroup(loc.store_id, store.id)
                                      ).length
                                      
                                      // キット不足チェック
                                      const shortage = kitShortages.find(
                                        s => s.date === date && s.store_id === store.id && s.scenario_id === sid
                                      )
                                      const hasShortage = !!shortage
                                      const notAtStore = kitsAtStore === 0  // この店舗にキットがない
                                      
                                      // バッジの色を決定
                                      let badgeVariant: 'destructive' | 'secondary' | 'outline' = 'secondary'
                                      let badgeClass = 'text-[10px] truncate max-w-[80px]'
                                      
                                      if (hasShortage) {
                                        badgeVariant = 'destructive'
                                        badgeClass += ' animate-pulse'
                                      } else if (notAtStore) {
                                        // 不足ではないが、この店舗にはない（移動が必要）
                                        badgeVariant = 'outline'
                                        badgeClass += ' border-orange-400 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20'
                                      }
                                      
                                      return (
                                        <Badge
                                          key={sid}
                                          variant={badgeVariant}
                                          className={badgeClass}
                                          title={
                                            hasShortage 
                                              ? `${scenario.title} × ${count} ⚠️ キット不足 (在庫: ${shortage.available})`
                                              : notAtStore
                                                ? `${scenario.title} × ${count} 📦 要移動 (この店舗にキットなし)`
                                                : `${scenario.title} × ${count} ✓ 在庫あり`
                                          }
                                        >
                                          {hasShortage && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" />}
                                          {notAtStore && !hasShortage && <ArrowRight className="h-2.5 w-2.5 mr-0.5 inline" />}
                                          {scenario.title.slice(0, 6)}
                                          {count > 1 && ` ×${count}`}
                                        </Badge>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* 移動計画 */}
          <TabsContent value="transfers" className="flex-1 overflow-auto">
            <div className="space-y-4">
              {/* 移動曜日設定 */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium whitespace-nowrap">移動曜日:</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {WEEKDAYS.map(day => (
                    <label
                      key={day.value}
                      className="flex items-center gap-1.5 cursor-pointer"
                    >
                      <Checkbox
                        checked={transferDays.includes(day.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setTransferDays(prev => [...prev, day.value].sort())
                          } else {
                            setTransferDays(prev => prev.filter(d => d !== day.value))
                          }
                        }}
                      />
                      <span className="text-sm">{day.short}</span>
                    </label>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">
                  {transferDays.length === 0 
                    ? '曜日を選択してください' 
                    : `週${transferDays.length}回の移動`}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  週間スケジュールに基づいて最適な移動計画を提案します
                </p>
                <Button
                  onClick={handleCalculateTransfers}
                  disabled={isCalculating || transferDays.length === 0}
                >
                  {isCalculating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      計算中...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      移動計画を計算
                    </>
                  )}
                </Button>
              </div>

              {/* 移動提案 */}
              {suggestions.length > 0 && (
                <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      移動提案 ({suggestions.length}件)
                    </div>
                    <Button size="sm" onClick={handleConfirmSuggestions}>
                      <Check className="h-4 w-4 mr-1" />
                      すべて確定
                    </Button>
                  </div>
                  
                  {/* 移動日別 → 出発店舗別にまとめて表示 */}
                  <div className="space-y-4">
                    {(() => {
                      // まず移動日（曜日）でグループ化
                      const sortedTransferDays = [...transferDays].sort((a, b) => a - b)
                      
                      // 公演日から移動日を決定する関数
                      const getTransferDayForPerformance = (performanceDate: string): number => {
                        const date = new Date(performanceDate)
                        const perfDayOfWeek = date.getDay()
                        
                        // 公演日より前の直近の移動日を探す
                        let bestTransferDay = sortedTransferDays[sortedTransferDays.length - 1]
                        
                        for (let i = sortedTransferDays.length - 1; i >= 0; i--) {
                          const transferDay = sortedTransferDays[i]
                          if (transferDay < perfDayOfWeek) {
                            bestTransferDay = transferDay
                            break
                          }
                        }
                        
                        // 公演日が最初の移動日以前なら、前週の最後の移動日
                        if (perfDayOfWeek <= sortedTransferDays[0]) {
                          bestTransferDay = sortedTransferDays[sortedTransferDays.length - 1]
                        }
                        
                        return bestTransferDay
                      }
                      
                      // 移動日ごとにグループ化
                      const byTransferDay = new Map<number, typeof groupedSuggestions>()
                      for (const group of groupedSuggestions) {
                        // グループ内の最初のアイテムで移動日を決定
                        const firstItem = group.items[0]
                        const transferDayOfWeek = getTransferDayForPerformance(firstItem.performance_date)
                        
                        if (!byTransferDay.has(transferDayOfWeek)) {
                          byTransferDay.set(transferDayOfWeek, [])
                        }
                        byTransferDay.get(transferDayOfWeek)!.push(group)
                      }
                      
                      // 移動日順にソート
                      const sortedDays = [...byTransferDay.entries()].sort((a, b) => a[0] - b[0])
                      
                      return sortedDays.map(([dayOfWeek, groups], dayIndex) => {
                        const dayLabel = WEEKDAYS.find(w => w.value === dayOfWeek)?.label || '?'
                        const dayKitCount = groups.reduce((sum, g) => sum + g.items.length, 0)
                        
                        // 出発店舗でグループ化
                        const bySource = new Map<string, typeof groups>()
                        for (const group of groups) {
                          const key = group.from_store_id
                          if (!bySource.has(key)) {
                            bySource.set(key, [])
                          }
                          bySource.get(key)!.push(group)
                        }
                        
                        return (
                          <div key={dayOfWeek}>
                            {/* 移動日ヘッダー（複数日ある場合のみ表示） */}
                            {transferDays.length > 1 && (
                              <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-primary/10 rounded-lg">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span className="font-bold">{dayLabel}移動分</span>
                                <Badge variant="secondary" className="ml-auto">
                                  {dayKitCount}キット
                                </Badge>
                              </div>
                            )}
                            
                            {/* 出発店舗別 */}
                            <div className="space-y-3">
                              {[...bySource.entries()].map(([sourceId, routes]) => {
                                const sourceName = routes[0].from_store_name
                                const totalKits = routes.reduce((sum, r) => sum + r.items.length, 0)
                                
                                return (
                                  <div
                                    key={sourceId}
                                    className="bg-white dark:bg-gray-800 rounded-lg p-3"
                                  >
                                    {/* 出発店舗ヘッダー */}
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                                      <MapPin className="h-4 w-4 text-primary" />
                                      <span className="font-bold text-lg">{sourceName}から</span>
                                      <Badge variant="secondary" className="ml-auto">
                                        {totalKits}キット
                                      </Badge>
                                    </div>
                                    
                                    {/* 配達先ごと */}
                                    <div className="space-y-3">
                                      {routes.map((route, routeIdx) => (
                                        <div key={routeIdx}>
                                          {/* 配達先ヘッダー */}
                                          <div className="flex items-center gap-2 mb-1">
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                            <span className="font-medium text-primary">{route.to_store_name}</span>
                                            <span className="text-sm text-muted-foreground">
                                              ({route.items.length}キット)
                                            </span>
                                          </div>
                                          
                                          {/* キット一覧 */}
                                          <div className="space-y-1 pl-6">
                                            {route.items.map((suggestion, index) => {
                                              const actualToStore = storeMap.get(suggestion.to_store_id)
                                              const showActualStore = route.isGrouped && suggestion.to_store_id !== route.to_store_id
                                              // 公演日を表示
                                              const perfDate = new Date(suggestion.performance_date)
                                              const perfDateStr = `${perfDate.getMonth() + 1}/${perfDate.getDate()}`
                                              
                                              return (
                                                <div
                                                  key={index}
                                                  className="flex items-center gap-2 text-sm py-0.5"
                                                >
                                                  <Badge variant="outline" className="text-[10px] shrink-0 bg-orange-50 dark:bg-orange-900/20">
                                                    {perfDateStr}公演
                                                  </Badge>
                                                  {showActualStore && (
                                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                                      {actualToStore?.short_name || actualToStore?.name}
                                                    </Badge>
                                                  )}
                                                  <span className="truncate max-w-[180px]">
                                                    {suggestion.scenario_title}
                                                  </span>
                                                  <span className="text-muted-foreground text-xs">
                                                    #{suggestion.kit_number}
                                                  </span>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {/* 確定済み移動イベント（ルートでグループ化） */}
              <div>
                <h3 className="font-medium mb-2">確定済み移動</h3>
                {groupedTransferEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    この週に予定されている移動はありません
                  </p>
                ) : (
                  <div className="space-y-3">
                    {groupedTransferEvents.map((group, groupIndex) => {
                      const completedCount = group.items.filter(e => e.status === 'completed').length
                      const allCompleted = completedCount === group.items.length
                      
                      return (
                        <div
                          key={groupIndex}
                          className={`border rounded-lg p-3 ${allCompleted ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                        >
                          {/* ルートヘッダー */}
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{group.from_store_name}</span>
                            <ArrowRight className="h-4 w-4" />
                            <span className="font-bold text-primary">{group.to_store_name}</span>
                            <div className="ml-auto flex items-center gap-2">
                              <Badge variant={allCompleted ? 'default' : 'secondary'}>
                                {completedCount}/{group.items.length} 完了
                              </Badge>
                            </div>
                          </div>
                          
                          {/* キット一覧 */}
                          <div className="space-y-1">
                            {group.items.map(event => {
                              const scenario = scenarioMap.get(event.scenario_id)
                              // 実際の行き先店舗名を取得
                              const actualToStore = storeMap.get(event.to_store_id)
                              const showActualStore = group.isGrouped && event.to_store_id !== group.to_store_id
                              
                              return (
                                <div
                                  key={event.id}
                                  className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                                    event.status === 'completed' ? 'bg-green-100 dark:bg-green-800/30' : 'hover:bg-muted/50'
                                  }`}
                                >
                                  <Badge variant="outline" className="text-xs">
                                    {formatDate(event.transfer_date)}
                                  </Badge>
                                  {showActualStore && (
                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                      → {actualToStore?.short_name || actualToStore?.name}
                                    </Badge>
                                  )}
                                  <span className="truncate max-w-[180px]">
                                    {scenario?.title || '不明'}
                                  </span>
                                  <span className="text-muted-foreground text-xs">
                                    #{event.kit_number}
                                  </span>
                                  
                                  {event.status === 'pending' && (
                                    <div className="flex gap-1 ml-auto">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-1.5"
                                        onClick={() => handleUpdateStatus(event.id, 'completed')}
                                        title="完了"
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-1.5 text-destructive"
                                        onClick={() => handleUpdateStatus(event.id, 'cancelled')}
                                        title="キャンセル"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {event.status === 'completed' && (
                                    <Check className="h-4 w-4 text-green-600 ml-auto" />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
      
      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenuContent
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          <ContextMenuLabel>状態を変更</ContextMenuLabel>
          {(Object.keys(KIT_CONDITION_LABELS) as KitCondition[]).map(cond => (
            <ContextMenuItem
              key={cond}
              onClick={() => {
                handleUpdateCondition(contextMenu.scenarioId, contextMenu.kitNumber, cond)
                setContextMenu(null)
              }}
              className={contextMenu.condition === cond ? 'bg-accent' : ''}
            >
              <span className={`mr-2 px-1 py-0.5 rounded text-[10px] ${KIT_CONDITION_COLORS[cond]}`}>
                {cond === 'good' ? '✓' : '!'}
              </span>
              {KIT_CONDITION_LABELS[cond]}
              {contextMenu.condition === cond && <Check className="h-3 w-3 ml-auto" />}
            </ContextMenuItem>
          ))}
          
          <ContextMenuSeparator />
          
          <ContextMenuLabel>店舗に移動</ContextMenuLabel>
          {stores.filter(s => s.status === 'active' && s.id !== contextMenu.storeId).map(store => (
            <ContextMenuItem
              key={store.id}
              onClick={() => {
                handleMoveKit(contextMenu.scenarioId, contextMenu.kitNumber, store.id)
                setContextMenu(null)
              }}
            >
              <ArrowRight className="h-3 w-3 mr-2" />
              {store.short_name || store.name}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      )}
    </Dialog>
  )
}
