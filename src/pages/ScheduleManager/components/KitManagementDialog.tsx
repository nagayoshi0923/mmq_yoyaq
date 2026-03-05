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
import type { KitLocation, KitTransferEvent, KitTransferSuggestion, Store, Scenario, KitCondition, KitTransferCompletion } from '@/types'
import { getCurrentStaff, getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu'
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw, Plus, Minus, Search, GripVertical, HelpCircle } from 'lucide-react'

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

// 日時を「M/D(曜)」形式でフォーマット
const formatCompletionDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayOfWeek = WEEKDAYS.find(w => w.value === date.getDay())?.short || ''
  return `${month}/${day}(${dayOfWeek})`
}

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
  const [activeTab, setActiveTab] = useState('transfers')
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
  
  // 移動日（実際の日付文字列、デフォルトは空 - weekDatesが決まってから初期化）
  const [transferDates, setTransferDates] = useState<string[]>([])
  
  // 移動完了状態（DBから取得）
  const [completions, setCompletions] = useState<KitTransferCompletion[]>([])
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null)
  const [currentStaffName, setCurrentStaffName] = useState<string>('')
  
  // シナリオ検索
  const [scenarioSearch, setScenarioSearch] = useState('')
  
  // コンテキストメニュー
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  
  // ドラッグ&ドロップ
  const [draggedKit, setDraggedKit] = useState<DraggedKit | null>(null)
  const [dragOverStoreId, setDragOverStoreId] = useState<string | null>(null)
  
  // 設置確認ダイアログ
  const [deliveryConfirm, setDeliveryConfirm] = useState<{
    scenarioId: string
    kitNumber: number
    performanceDate: string
    toStoreId: string
    scenarioTitle: string
    toStoreName: string
  } | null>(null)
  
  // ヘルプダイアログ
  const [showHelp, setShowHelp] = useState(false)

  // 週の日付リスト（移動日判定用）
  // ローカル日付を使用（toISOStringはUTCに変換されるため日本時間だとずれる）
  const weekDates = useMemo(() => {
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(selectedWeekStart)
      date.setDate(selectedWeekStart.getDate() + i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      dates.push(`${year}-${month}-${day}`)
    }
    return dates
  }, [selectedWeekStart])
  
  // 過去の週かどうかを判定（今日より前の週末なら過去）
  const isPastWeek = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(selectedWeekStart)
    weekEnd.setDate(selectedWeekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    return weekEnd < today
  }, [selectedWeekStart])
  
  // 週が変わったらデフォルトの移動日を設定（月曜と金曜）
  useEffect(() => {
    if (weekDates.length > 0) {
      // 月曜 (index 0) と金曜 (index 4)
      const defaultDates: string[] = []
      if (weekDates[0]) defaultDates.push(weekDates[0]) // 月曜
      if (weekDates[4]) defaultDates.push(weekDates[4]) // 金曜
      setTransferDates(defaultDates)
    }
  }, [weekDates])
  
  // 週間需要で表示する日付リスト（公演期間 = 移動日の翌日〜最後の移動日がカバーする範囲）
  // 例: 月・金移動の場合 → 火曜〜翌週月曜
  const demandDates = useMemo(() => {
    if (transferDates.length === 0) return weekDates
    
    const sortedDates = [...transferDates].sort()
    const firstTransferDateStr = sortedDates[0]
    const lastTransferDateStr = sortedDates[sortedDates.length - 1]
    
    // 日付文字列からDateオブジェクトを作成
    const parseDate = (dateStr: string): Date => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
    
    const formatDate = (date: Date): string => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    
    const firstTransferDate = parseDate(firstTransferDateStr)
    const lastTransferDate = parseDate(lastTransferDateStr)
    
    // 公演開始日 = 最初の移動日の翌日
    const demandStartDate = new Date(firstTransferDate)
    demandStartDate.setDate(firstTransferDate.getDate() + 1)
    
    // 公演終了日 = 次週の最初の移動日（lastTransfer + 次の移動日までの日数）
    // ただしシンプルに最終移動日から7日後の最初の移動日前日まで
    const demandEndDate = new Date(firstTransferDate)
    demandEndDate.setDate(firstTransferDate.getDate() + 7) // 翌週の同じ曜日
    
    // 日付リストを作成
    const dates: string[] = []
    const currentDate = new Date(demandStartDate)
    while (currentDate <= demandEndDate) {
      dates.push(formatDate(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return dates
  }, [transferDates, weekDates])

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
    
    // 日付順に需要をチェック（公演期間 = demandDates）
    for (const date of demandDates) {
      const dayEvents = scheduleEvents.filter(e => e.date === date)
      
      // 店舗×シナリオで集計（同じ日・店舗・シナリオは1キットで済む）
      const needs = new Set<string>() // `${store_id}-${scenario_id}`
      for (const event of dayEvents) {
        if (event.scenario_id) {
          const key = `${event.store_id}-${event.scenario_id}`
          needs.add(key)
        }
      }
      
      // 各需要に対して在庫をチェック（needed は常に1）
      for (const key of needs) {
        const needed = 1 // 同日なら1キットで足りる
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
  }, [demandDates, scheduleEvents, kitLocations, scenarioMap, isSameStoreGroup])
  
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

  // 完了状態のキー生成（performance_dateを含むフルキー）
  const getCompletionKeyFull = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ) => {
    return `${scenarioId}-${kitNumber}-${performanceDate}-${toStoreId}`
  }, [])
  
  // 完了状態のキー生成（シナリオとキット番号のみ - 同じキットなら一致とみなす）
  const getCompletionKeyLoose = useCallback((
    scenarioId: string,
    kitNumber: number,
    _toStoreId?: string  // 未使用（互換性のため残す）
  ) => {
    return `${scenarioId}-${kitNumber}`
  }, [])
  
  // 完了状態のマップ（高速ルックアップ用）- フルキーとルーズキーの両方で登録
  const completionMapFull = useMemo(() => {
    const map = new Map<string, KitTransferCompletion>()
    for (const c of completions) {
      const key = getCompletionKeyFull(c.scenario_id, c.kit_number, c.performance_date, c.to_store_id)
      map.set(key, c)
    }
    return map
  }, [completions, getCompletionKeyFull])
  
  // ルーズキーのマップ（同じシナリオ・キット・店舗の最新完了状態）
  const completionMapLoose = useMemo(() => {
    const map = new Map<string, KitTransferCompletion>()
    // 日付順にソートして最新を保持
    const sorted = [...completions].sort((a, b) => 
      (a.performance_date || '').localeCompare(b.performance_date || '')
    )
    for (const c of sorted) {
      const key = getCompletionKeyLoose(c.scenario_id, c.kit_number, c.to_store_id)
      // 後のエントリが上書きするので、最新の日付のものが残る
      map.set(key, c)
    }
    return map
  }, [completions, getCompletionKeyLoose])
  
  // 回収済みかどうか（フルキーまたはルーズキーでマッチ）
  const isPickedUp = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ) => {
    // まずフルキーで探す
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    let completion = completionMapFull.get(fullKey)
    
    // なければルーズキーで探す
    if (!completion) {
      const looseKey = getCompletionKeyLoose(scenarioId, kitNumber, toStoreId)
      completion = completionMapLoose.get(looseKey)
    }
    
    return completion?.picked_up_at != null
  }, [completionMapFull, completionMapLoose, getCompletionKeyFull, getCompletionKeyLoose])
  
  // 設置済みかどうか（フルキーまたはルーズキーでマッチ）
  const isDelivered = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ) => {
    // まずフルキーで探す
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    let completion = completionMapFull.get(fullKey)
    
    // なければルーズキーで探す
    if (!completion) {
      const looseKey = getCompletionKeyLoose(scenarioId, kitNumber, toStoreId)
      completion = completionMapLoose.get(looseKey)
    }
    
    return completion?.delivered_at != null
  }, [completionMapFull, completionMapLoose, getCompletionKeyFull, getCompletionKeyLoose])
  
  // 完了情報を取得（フルキーまたはルーズキーでマッチ）
  const getCompletion = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ): KitTransferCompletion | undefined => {
    // まずフルキーで探す
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    let completion = completionMapFull.get(fullKey)
    
    // なければルーズキーで探す
    if (!completion) {
      const looseKey = getCompletionKeyLoose(scenarioId, kitNumber, toStoreId)
      completion = completionMapLoose.get(looseKey)
    }
    
    return completion
  }, [completionMapFull, completionMapLoose, getCompletionKeyFull, getCompletionKeyLoose])
  
  // 提案と完了記録をマージ（過去の完了記録をオプティマイザ提案に追加）
  const mergedSuggestions = useMemo(() => {
    // 設置完了済みのキーを記録（カウント用）
    const deliveredKeys = new Set<string>()
    for (const c of completions) {
      if (c.delivered_at) {
        deliveredKeys.add(`${c.scenario_id}-${c.kit_number}-${c.performance_date}`)
      }
    }
    
    // 全ての提案を保持（設置完了済みも含む - チェック状態確認のため）
    const filteredSuggestions = [...suggestions]
    
    // 過去の完了記録を追加（履歴表示用）
    const suggestionFullKeys = new Set<string>()
    for (const s of filteredSuggestions) {
      suggestionFullKeys.add(`${s.scenario_id}-${s.kit_number}-${s.performance_date}-${s.to_store_id}`)
    }
    
    // 完了記録から追加の「提案」を生成（過去の移動日のもののみ）
    const additionalFromCompletions: typeof suggestions = []
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    
    for (const c of completions) {
      // 設置完了済みはスキップ（履歴表示も不要）
      if (c.delivered_at) continue
      
      // フルキーで重複チェック
      const fullKey = `${c.scenario_id}-${c.kit_number}-${c.performance_date}-${c.to_store_id}`
      
      // オプティマイザの提案にすでにある場合はスキップ
      if (suggestionFullKeys.has(fullKey)) continue
      
      // シナリオ情報を取得
      const scenario = scenarios.find(s => s.id === c.scenario_id)
      if (!scenario) continue
      
      // 店舗情報を取得
      const fromStore = stores.find(s => s.id === c.from_store_id)
      const toStore = stores.find(s => s.id === c.to_store_id)
      if (!fromStore || !toStore) continue
      
      // 実際の移動日を計算（picked_up_at から取得、なければ created_at、最後の手段で performance_date の前日）
      let actualTransferDate: string
      if (c.picked_up_at) {
        // picked_up_at の日付部分を取得（ローカル時間に変換）
        const pickedUpDate = new Date(c.picked_up_at)
        actualTransferDate = `${pickedUpDate.getFullYear()}-${String(pickedUpDate.getMonth() + 1).padStart(2, '0')}-${String(pickedUpDate.getDate()).padStart(2, '0')}`
      } else if (c.created_at) {
        // created_at の日付部分を取得（記録作成日 = 移動計画が立てられた日）
        const createdDate = new Date(c.created_at)
        actualTransferDate = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`
      } else {
        // 最後の手段: performance_date の前日
        const [year, month, day] = c.performance_date.split('-').map(Number)
        const perfDate = new Date(year, month - 1, day)
        perfDate.setDate(perfDate.getDate() - 1)
        actualTransferDate = `${perfDate.getFullYear()}-${String(perfDate.getMonth() + 1).padStart(2, '0')}-${String(perfDate.getDate()).padStart(2, '0')}`
      }
      
      // 過去の移動日で未完了のもののみ追加（チェック漏れを表示）
      if (actualTransferDate >= todayStr) continue
      
      // 提案形式に変換
      additionalFromCompletions.push({
        scenario_id: c.scenario_id,
        scenario_title: scenario.title,
        kit_number: c.kit_number,
        from_store_id: c.from_store_id,
        from_store_name: fromStore.short_name || fromStore.name,
        to_store_id: c.to_store_id,
        to_store_name: toStore.short_name || toStore.name,
        transfer_date: actualTransferDate,
        performance_date: c.performance_date,
        reason: '完了記録から復元'
      })
      
      // キーを追加して重複を防ぐ
      suggestionFullKeys.add(fullKey)
    }
    
    return [...filteredSuggestions, ...additionalFromCompletions]
  }, [suggestions, completions, scenarios, stores])

  // データ取得
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
      
      const [locationsData, storesData, scenariosData] = await Promise.all([
        kitApi.getKitLocations(),
        storeApi.getAll(),
        scenarioApi.getAll()
      ])
      
      // デバッグ: データ取得結果
      console.log('🔧 キット管理データ取得:', {
        locationsCount: locationsData.length,
        scenariosCount: scenariosData.length,
        sampleLocations: locationsData.slice(0, 5).map(l => ({
          id: l.id,
          org_scenario_id: l.org_scenario_id,
          scenario_id: l.scenario_id,
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
      setScenarios(scenariosData)

      // 週間スケジュールを取得
      // 金曜移動分は翌週月曜までカバーするので、+3日まで取得
      const startDate = weekDates[0]
      const endDateObj = new Date(weekDates[6])
      endDateObj.setDate(endDateObj.getDate() + 3) // 週末+3日（翌週の水曜まで）
      const endDate = endDateObj.toISOString().split('T')[0]
      const eventsData = await scheduleApi.getByDateRange(startDate, endDate)
      
      // 完了状態を取得（週の開始の1週間前から取得して、前週の公演で今週移動したものも含める）
      const completionsStartDateObj = new Date(weekDates[0])
      completionsStartDateObj.setDate(completionsStartDateObj.getDate() - 7)
      const completionsStartDate = `${completionsStartDateObj.getFullYear()}-${String(completionsStartDateObj.getMonth() + 1).padStart(2, '0')}-${String(completionsStartDateObj.getDate()).padStart(2, '0')}`
      const completionsData = await kitApi.getTransferCompletions(completionsStartDate, endDate)
      setCompletions(completionsData)
      
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

      // 移動イベントを取得（週の範囲内のみ）
      const transfersData = await kitApi.getTransferEvents(weekDates[0], weekDates[6])
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
  
  // 回収完了をトグル
  const handleTogglePickup = async (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    fromStoreId: string,
    toStoreId: string
  ) => {
    if (!currentStaffId) {
      showToast.error('スタッフ情報が取得できません')
      return
    }
    
    const currentlyPickedUp = isPickedUp(scenarioId, kitNumber, performanceDate, toStoreId)
    
    try {
      if (currentlyPickedUp) {
        // 回収解除（設置も解除される）
        await kitApi.unmarkPickedUp(scenarioId, kitNumber, performanceDate, toStoreId)
      } else {
        // 回収完了
        await kitApi.markPickedUp(scenarioId, kitNumber, performanceDate, fromStoreId, toStoreId, currentStaffId)
      }
      // 完了状態を手動で再取得（リアルタイム購読のバックアップ）
      const startDate = weekDates[0]
      const endDateObj = new Date(weekDates[6])
      endDateObj.setDate(endDateObj.getDate() + 3)
      const endDate = endDateObj.toISOString().split('T')[0]
      const completionsData = await kitApi.getTransferCompletions(startDate, endDate)
      setCompletions(completionsData)
    } catch (error) {
      console.error('Failed to toggle pickup:', error)
      showToast.error('操作に失敗しました')
    }
  }
  
  // 設置完了をトグル（確認ダイアログを表示）
  const handleToggleDelivery = (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string,
    scenarioTitle?: string
  ) => {
    if (!currentStaffId) {
      showToast.error('スタッフ情報が取得できません')
      return
    }
    
    // 回収されていない場合は設置できない
    if (!isPickedUp(scenarioId, kitNumber, performanceDate, toStoreId)) {
      return
    }
    
    const currentlyDelivered = isDelivered(scenarioId, kitNumber, performanceDate, toStoreId)
    
    if (currentlyDelivered) {
      // 設置解除は確認なしで実行
      executeDeliveryToggle(scenarioId, kitNumber, performanceDate, toStoreId, true)
    } else {
      // 設置完了時は確認ダイアログを表示
      const toStore = storeMap.get(toStoreId)
      const toStoreName = toStore?.short_name || toStore?.name || '移動先'
      setDeliveryConfirm({
        scenarioId,
        kitNumber,
        performanceDate,
        toStoreId,
        scenarioTitle: scenarioTitle || 'このキット',
        toStoreName
      })
    }
  }
  
  // 設置完了/解除を実行
  const executeDeliveryToggle = async (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string,
    isUnmark: boolean
  ) => {
    if (!currentStaffId) return
    
    try {
      if (isUnmark) {
        // 設置解除（キット位置は戻さない - 手動で戻す必要あり）
        await kitApi.unmarkDelivered(scenarioId, kitNumber, performanceDate, toStoreId)
      } else {
        // 設置完了
        await kitApi.markDelivered(scenarioId, kitNumber, performanceDate, toStoreId, currentStaffId)
        // キットの登録場所も移動先に更新
        await kitApi.setKitLocation(scenarioId, kitNumber, toStoreId)
      }
      // リアルタイム購読で更新されるので手動更新不要
      // ただしキット位置変更は再取得が必要
      fetchData()
    } catch (error) {
      console.error('Failed to toggle delivery:', error)
      showToast.error('操作に失敗しました')
    }
  }
  
  // 設置確認ダイアログでOKを押した時
  const handleConfirmDelivery = () => {
    if (deliveryConfirm) {
      executeDeliveryToggle(
        deliveryConfirm.scenarioId,
        deliveryConfirm.kitNumber,
        deliveryConfirm.performanceDate,
        deliveryConfirm.toStoreId,
        false
      )
      setDeliveryConfirm(null)
    }
  }
  

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

  // 移動計画を計算（showNotification: 手動実行時のみトースト表示）
  const handleCalculateTransfers = useCallback(async (showNotification = false) => {
    setIsCalculating(true)
    try {
      // 現在のキット状態を構築（使用可能なキットのみ）
      // 破損(damaged)、修理中(repairing)、欠けあり(missing_parts)、引退(retired)は除外
      const USABLE_CONDITIONS: KitCondition[] = ['good']
      const kitState: KitState = {}
      for (const loc of kitLocations) {
        // 使用不可のキットは移動計算から除外
        if (!USABLE_CONDITIONS.includes(loc.condition)) {
          continue
        }
        if (!kitState[loc.scenario_id]) {
          kitState[loc.scenario_id] = {}
        }
        kitState[loc.scenario_id][loc.kit_number] = loc.store_id
      }

      // 週間需要を構築（scenario_idがあるイベントのみ）
      // 同じ日・同じ店舗・同じシナリオは1キットで済む（朝使ったキットを夜も使える）
      // demandDatesを使用して、移動日がカバーする期間全体の公演を含める
      const demandSet = new Set<string>()
      const demands: Array<{ date: string; store_id: string; scenario_id: string }> = []
      for (const event of scheduleEvents) {
        if (demandDates.includes(event.date) && event.scenario_id) {
          const key = `${event.date}::${event.store_id}::${event.scenario_id}`
          if (!demandSet.has(key)) {
            demandSet.add(key)
            demands.push({
              date: event.date,
              store_id: event.store_id,
              scenario_id: event.scenario_id
            })
          }
        }
      }

      // 移動日から曜日番号を抽出（calculateKitTransfers用）
      const transferDaysOfWeek = transferDates.map(dateStr => {
        const [year, month, day] = dateStr.split('-').map(Number)
        return new Date(year, month - 1, day).getDay()
      })
      
      // デバッグログ
      console.log('📦 移動計算デバッグ:', {
        kitLocations: kitLocations.length,
        kitState: Object.keys(kitState).length,
        scheduleEvents: scheduleEvents.length,
        demandDates,
        demands: demands.length,
        scenariosWithKits: scenariosWithKits.length,
        transferDates,
        transferDaysOfWeek
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
        transferDaysOfWeek
      )

      console.log('📦 移動計算結果:', result)
      setSuggestions(result)
      
      // 手動実行時のみトースト表示
      if (showNotification) {
        if (result.length === 0) {
          if (demands.length === 0) {
            showToast.info('この週にシナリオ付きのイベントがありません')
          } else {
            showToast.success('移動は不要です（すべてのキットが適切な店舗にあります）')
          }
        } else {
          showToast.success(`${result.length}件の移動が必要です`)
        }
      }
    } catch (error) {
      console.error('Failed to calculate transfers:', error)
      if (showNotification) {
        showToast.error('移動計画の計算に失敗しました')
      }
    } finally {
      setIsCalculating(false)
    }
  }, [kitLocations, scheduleEvents, demandDates, scenariosWithKits, stores, transferDates])

  // データが揃ったら自動で移動計画を計算（デバウンス付き）
  useEffect(() => {
    if (isOpen && !loading && kitLocations.length > 0 && scheduleEvents.length > 0 && transferDates.length > 0) {
      const timer = setTimeout(() => {
        handleCalculateTransfers(false)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, loading, kitLocations.length, scheduleEvents.length, transferDates, demandDates, handleCalculateTransfers])

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
      // キット数を減らす場合、超過するkit_locationレコードを削除
      // scenarioId は org_scenario_id または scenario.id
      const currentScenario = scenarios.find(s => {
        const orgScenarioId = (s as { org_scenario_id?: string }).org_scenario_id
        return orgScenarioId === scenarioId || s.id === scenarioId
      })
      const currentCount = currentScenario?.kit_count || 0
      
      if (newCount < currentCount) {
        // 超過するキット位置レコードを削除
        const orgId = await getCurrentOrganizationId()
        if (orgId) {
          // org_scenario_id で削除を試みる
          const { error: deleteError } = await supabase
            .from('scenario_kit_locations')
            .delete()
            .eq('organization_id', orgId)
            .eq('org_scenario_id', scenarioId)
            .gt('kit_number', newCount)
          
          if (deleteError) {
            // フォールバック: scenario_id で削除
            await supabase
              .from('scenario_kit_locations')
              .delete()
              .eq('organization_id', orgId)
              .eq('scenario_id', scenarioId)
              .gt('kit_number', newCount)
          }
        }
      }
      
      // scenarioApi.update は scenario_master_id (= scenario.id) を期待
      const updateId = currentScenario?.id || scenarioId
      await scenarioApi.update(updateId, { kit_count: newCount })
      showToast.success(`キット数を${newCount}に変更しました`)
      
      // シナリオリストを更新
      setScenarios(prev => prev.map(s => {
        const orgScenarioId = (s as { org_scenario_id?: string }).org_scenario_id
        return (orgScenarioId === scenarioId || s.id === scenarioId) 
          ? { ...s, kit_count: newCount } 
          : s
      }))
      
      // キット位置も再取得して同期
      const locationsData = await kitApi.getKitLocations()
      setKitLocations(locationsData)
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
      <DialogContent size="xl" className="max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-[85vh] overflow-hidden flex flex-col w-full sm:w-[900px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              キット配置管理
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHelp(true)}
              className="mr-6 gap-1"
            >
              <HelpCircle className="h-4 w-4" />
              使い方
            </Button>
          </div>
          <DialogDescription>
            シナリオキットの現在位置を確認し、週間の公演スケジュールに合わせた移動計画を作成します
          </DialogDescription>
        </DialogHeader>

        {/* 週選択 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">起点曜日:</span>
            <Select value={startDayOfWeek.toString()} onValueChange={handleStartDayChange}>
              <SelectTrigger className="w-[100px] sm:w-[120px]">
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

          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="sm" className="px-2 sm:px-3" onClick={() => handleWeekChange('prev')}>
              <span className="hidden sm:inline">← 前週</span>
              <span className="sm:hidden">←</span>
            </Button>
            <span className="font-medium text-sm sm:text-base min-w-[140px] sm:min-w-[200px] text-center">
              {formatDate(demandDates[0] || weekDates[0])} 〜 {formatDate(demandDates[demandDates.length - 1] || weekDates[6])}
            </span>
            <Button variant="outline" size="sm" className="px-2 sm:px-3" onClick={() => handleWeekChange('next')}>
              <span className="hidden sm:inline">次週 →</span>
              <span className="sm:hidden">→</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="px-2 sm:px-3"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-1">更新</span>
            </Button>
          </div>
        </div>

        {/* タブ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="transfers" className="text-xs sm:text-sm py-1.5 sm:py-2">
              <span className="hidden sm:inline">移動計画</span>
              <span className="sm:hidden">移動</span>
            </TabsTrigger>
            <TabsTrigger value="demand" className="text-xs sm:text-sm py-1.5 sm:py-2">
              <span className="hidden sm:inline">週間需要</span>
              <span className="sm:hidden">需要</span>
              {kitShortages.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                  {kitShortages.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="current" className="text-xs sm:text-sm py-1.5 sm:py-2">
              <span className="hidden sm:inline">シナリオ別</span>
              <span className="sm:hidden">シナリオ</span>
            </TabsTrigger>
            <TabsTrigger value="store" className="text-xs sm:text-sm py-1.5 sm:py-2">
              <span className="hidden sm:inline">店舗別在庫</span>
              <span className="sm:hidden">在庫</span>
            </TabsTrigger>
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
                  {scenariosWithKits.map((scenario, idx) => {
                    const kitCount = scenario.kit_count || 1
                    // scenario.id (= scenario_master_id) で比較
                    const locations = kitLocations.filter(l => l.scenario?.id === scenario.id)
                    
                    // デバッグ: 最初の3件のみログ出力
                    if (idx < 3) {
                      console.log(`🔍 シナリオ[${scenario.title}]`, {
                        scenarioId: scenario.id,
                        kitCount,
                        locationsFound: locations.length,
                        matchingLocations: locations.map(l => ({
                          scenario_id: l.scenario?.id,
                          title: l.scenario?.title,
                          store_id: l.store_id
                        }))
                      })
                    }
                    
                    // org_scenario_id（API用）
                    const orgScenarioId = (scenario as { org_scenario_id?: string }).org_scenario_id
                    
                    return (
                      <div key={scenario.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{scenario.title}</div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleChangeKitCount(orgScenarioId || scenario.id, kitCount - 1)}
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
                              onClick={() => handleChangeKitCount(orgScenarioId || scenario.id, kitCount + 1)}
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
                                    onValueChange={(value) => handleSetKitLocation(orgScenarioId || scenario.id, kitNum, value)}
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
                                      orgScenarioId || scenario.id,
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
                                        loc.scenario?.id === scenario.id && loc.kit_number === kitNum
                                          ? { ...loc, condition_notes: newNotes }
                                          : loc
                                      ))
                                    }}
                                    onBlur={(e) => {
                                      // フォーカスが外れたら保存
                                      if (location && e.target.value !== (location.condition_notes || '')) {
                                        handleUpdateCondition(orgScenarioId || scenario.id, kitNum, condition as KitCondition, e.target.value || null)
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
                      {scenariosWithoutKits.slice(0, 20).map(scenario => {
                        const orgScenarioId = (scenario as { org_scenario_id?: string }).org_scenario_id
                        return (
                        <Button
                          key={orgScenarioId || scenario.id}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleChangeKitCount(orgScenarioId || scenario.id, 1)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {scenario.title.slice(0, 15)}{scenario.title.length > 15 ? '...' : ''}
                        </Button>
                        )
                      })}
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
                    {demandDates.map(date => {
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
                                      const kitsAtStore = kitLocations.filter(loc => 
                                        loc.scenario?.id === sid && isSameStoreGroup(loc.store_id, store.id)
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
              {/* 移動日設定 */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg flex-wrap">
                <span className="text-sm font-medium whitespace-nowrap">移動日:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {weekDates.map(dateStr => {
                    const [year, month, day] = dateStr.split('-').map(Number)
                    const date = new Date(year, month - 1, day)
                    const dayOfWeek = date.getDay()
                    const dayLabel = WEEKDAYS.find(d => d.value === dayOfWeek)?.short || ''
                    const isSelected = transferDates.includes(dateStr)
                    
                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          if (isSelected) {
                            setTransferDates(prev => prev.filter(d => d !== dateStr))
                          } else {
                            setTransferDates(prev => [...prev, dateStr].sort())
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground border-primary' 
                            : 'bg-background border-muted-foreground/30 hover:border-primary/50'
                        }`}
                      >
                        {month}/{day}({dayLabel})
                      </button>
                    )
                  })}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">
                  {transferDates.length === 0 
                    ? '移動日を選択してください' 
                    : `${transferDates.length}日の移動`}
                </span>
              </div>

              {isCalculating && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  計算中...
                </p>
              )}

              {/* 移動提案 */}
              {mergedSuggestions.length > 0 && (
                <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 font-medium text-yellow-800 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm sm:text-base">移動提案 ({mergedSuggestions.length}件)</span>
                      {(() => {
                        const deliveredCount = completions.filter(c => c.delivered_at).length
                        const pickedUpCount = completions.filter(c => c.picked_up_at && !c.delivered_at).length
                        const remainingCount = mergedSuggestions.length - deliveredCount - pickedUpCount
                        return (
                          <>
                            {deliveredCount > 0 && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                                {deliveredCount}件完了
                              </Badge>
                            )}
                            {pickedUpCount > 0 && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                {pickedUpCount}件移動中
                              </Badge>
                            )}
                            {(deliveredCount > 0 || pickedUpCount > 0) && remainingCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                残り{remainingCount}件
                              </Badge>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  
                  {/* 移動日別 → 出発店舗別にまとめて表示 */}
                  <div className="space-y-4">
                    {(() => {
                      const sortedTransferDateStrs = [...transferDates].sort()
                      
                      // 日付文字列からローカル日付オブジェクトを作成（タイムゾーン問題を回避）
                      const parseLocalDate = (dateStr: string): Date => {
                        const [year, month, day] = dateStr.split('-').map(Number)
                        return new Date(year, month - 1, day)
                      }
                      
                      // 日付をYYYY-MM-DD形式の文字列に変換（ローカル）
                      const formatDateStr = (date: Date): string => {
                        const year = date.getFullYear()
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const day = String(date.getDate()).padStart(2, '0')
                        return `${year}-${month}-${day}`
                      }
                      
                      // 今日の日付（ローカル）
                      const todayStr = formatDateStr(new Date())
                      
                      // 移動日が過去かどうかを判定
                      const isTransferDatePast = (transferDateStr: string): boolean => {
                        return transferDateStr < todayStr
                      }
                      
                      // 公演日から実際の移動日を計算する関数
                      // ルール: 当日運搬は危険なので、公演日より前の直近の移動日を使用
                      const getActualTransferDate = (performanceDate: string): string | null => {
                        if (sortedTransferDateStrs.length === 0) return null
                        
                        const perfDateStr = performanceDate
                        
                        // 公演日より前の移動日を探す（直近のもの）
                        let responsibleTransferDate: string | null = null
                        
                        for (let i = sortedTransferDateStrs.length - 1; i >= 0; i--) {
                          const transferDateStr = sortedTransferDateStrs[i]
                          if (transferDateStr < perfDateStr) {
                            responsibleTransferDate = transferDateStr
                            break
                          }
                        }
                        
                        // 公演日より前の移動日がない場合、前週の最後の移動日を探す
                        if (!responsibleTransferDate && sortedTransferDateStrs.length > 0) {
                          // 最後の移動日を使用（週をまたぐケース）
                          const lastTransferDate = parseLocalDate(sortedTransferDateStrs[sortedTransferDateStrs.length - 1])
                          // 1週間前の同じ曜日を計算
                          const prevWeekDate = new Date(lastTransferDate)
                          prevWeekDate.setDate(prevWeekDate.getDate() - 7)
                          responsibleTransferDate = formatDateStr(prevWeekDate)
                        }
                        
                        return responsibleTransferDate
                      }
                      
                      // 間に合わない公演を検出（選択した移動日では対応できない公演）
                      // 最初の移動日より前の公演は間に合わない
                      const missedPerformances: typeof suggestions = []
                      const firstTransferDate = sortedTransferDateStrs[0] || ''
                      
                      // 各キットを個別に移動日で振り分け、その後ルートでグループ化
                      // Map: transferDate -> Map: (from+to+scenario) -> items[]
                      type ItemWithTransfer = typeof suggestions[0] & { actualTransferDate: string }
                      const itemsByTransferDate = new Map<string, ItemWithTransfer[]>()
                      
                      // デバッグ用
                      console.log('🚚 移動日計算デバッグ:', {
                        sortedTransferDateStrs,
                        weekDates,
                        totalItems: mergedSuggestions.length
                      })
                      
                      // キットの現在位置マップを作成
                      const kitCurrentLocationMap = new Map<string, string>()
                      for (const loc of kitLocations) {
                        kitCurrentLocationMap.set(`${loc.scenario_id}-${loc.kit_number}`, loc.store_id)
                      }
                      
                      // 各アイテムを個別に処理
                      for (const item of mergedSuggestions) {
                        const perfDateStr = item.performance_date
                        
                        // キットが既に目的地にある場合はスキップ（移動不要）
                        // ただし回収済み or 設置完了済みはチェック状態表示のため残す
                        const currentLocation = kitCurrentLocationMap.get(`${item.scenario_id}-${item.kit_number}`)
                        const itemPickedUp = isPickedUp(item.scenario_id, item.kit_number, item.performance_date, item.to_store_id)
                        const itemDelivered = isDelivered(item.scenario_id, item.kit_number, item.performance_date, item.to_store_id)
                        if (currentLocation === item.to_store_id && !itemPickedUp && !itemDelivered) {
                          continue
                        }
                        
                        // 回収済み・設置済みも表示する（チェック状態を確認できるように）
                        // 視覚的にはスタイリングで区別される（青=回収済み、緑=設置完了）
                        
                        // 完了記録からの項目かどうか
                        const isFromCompletion = !!item.transfer_date
                        
                        // 移動日を決定
                        let actualTransferDateStr: string | null
                        if (isFromCompletion) {
                          // 完了記録: 実際のピックアップ日より前の最も近い選択された移動日を使用
                          const completionTransferDate = item.transfer_date!
                          actualTransferDateStr = null
                          for (let i = sortedTransferDateStrs.length - 1; i >= 0; i--) {
                            if (sortedTransferDateStrs[i] <= completionTransferDate) {
                              actualTransferDateStr = sortedTransferDateStrs[i]
                              break
                            }
                          }
                          // 見つからない場合は最初の移動日を使用
                          if (!actualTransferDateStr && sortedTransferDateStrs.length > 0) {
                            actualTransferDateStr = sortedTransferDateStrs[0]
                          }
                        } else {
                          // オプティマイザ提案: performance_date から計算
                          actualTransferDateStr = getActualTransferDate(item.performance_date)
                        }
                        
                        // 移動日より前または同日の公演はスキップ（間に合わない）
                        if (actualTransferDateStr && perfDateStr <= actualTransferDateStr) {
                          if (!isFromCompletion) {
                            missedPerformances.push(item)
                          }
                          continue
                        }
                        
                        if (!actualTransferDateStr) continue
                        
                        // 選択された移動日のみ含める
                        if (!transferDates.includes(actualTransferDateStr)) continue
                        
                        // 移動日でグループ化
                        if (!itemsByTransferDate.has(actualTransferDateStr)) {
                          itemsByTransferDate.set(actualTransferDateStr, [])
                        }
                        itemsByTransferDate.get(actualTransferDateStr)!.push({
                          ...item,
                          actualTransferDate: actualTransferDateStr
                        })
                      }
                      
                      // 移動日ごとにルートでグループ化し直す
                      const byTransferDate = new Map<string, typeof groupedSuggestions>()
                      
                      for (const [transferDateStr, items] of itemsByTransferDate) {
                        // このtransferDate内でルートごとにグループ化
                        const routeGroups = new Map<string, typeof items>()
                        
                        for (const item of items) {
                          const fromGroupId = getStoreGroupId(item.from_store_id)
                          const toGroupId = getStoreGroupId(item.to_store_id)
                          const routeKey = `${fromGroupId}->${toGroupId}::${item.scenario_id}`
                          
                          if (!routeGroups.has(routeKey)) {
                            routeGroups.set(routeKey, [])
                          }
                          routeGroups.get(routeKey)!.push(item)
                        }
                        
                        // groupedSuggestions形式に変換（アイテムは公演日の昇順でソート）
                        const groups: typeof groupedSuggestions = []
                        for (const [, routeItems] of routeGroups) {
                          const first = routeItems[0]
                          const fromGroupId = getStoreGroupId(first.from_store_id)
                          const toGroupId = getStoreGroupId(first.to_store_id)
                          // 公演日の昇順でソート
                          const sortedItems = [...routeItems].sort((a, b) => 
                            a.performance_date.localeCompare(b.performance_date)
                          )
                          groups.push({
                            from_store_id: first.from_store_id,
                            from_store_name: first.from_store_name,
                            to_store_id: first.to_store_id,
                            to_store_name: first.to_store_name,
                            isGrouped: fromGroupId === toGroupId,
                            items: sortedItems
                          })
                        }
                        
                        byTransferDate.set(transferDateStr, groups)
                      }
                      
                      // 日付順にソート
                      const sortedDays = [...byTransferDate.entries()].sort((a, b) => 
                        a[0].localeCompare(b[0])
                      )
                      
                      // 間に合わない公演の警告表示
                      const missedWarning = missedPerformances.length > 0 ? (
                        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-orange-800 dark:text-orange-200 text-sm">
                                以下の公演は選択した移動日では間に合いません
                              </p>
                              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                                前週の移動で対応するか、移動日を追加してください
                              </p>
                              <ul className="mt-2 space-y-1">
                                {missedPerformances.slice(0, 5).map((item, idx) => {
                                  const perfDate = parseLocalDate(item.performance_date)
                                  const dayShort = WEEKDAYS.find(w => w.value === perfDate.getDay())?.short || '?'
                                  return (
                                    <li key={idx} className="text-xs text-orange-700 dark:text-orange-300">
                                      {perfDate.getMonth() + 1}/{perfDate.getDate()}({dayShort}) - {item.to_store_name}: {item.scenario_title}
                                    </li>
                                  )
                                })}
                                {missedPerformances.length > 5 && (
                                  <li className="text-xs text-orange-600">...他{missedPerformances.length - 5}件</li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : null
                      
                      if (sortedDays.length === 0) {
                        return (
                          <>
                            {missedWarning}
                            <div className="text-center py-4 text-muted-foreground">
                              選択した移動日に該当する提案はありません
                            </div>
                          </>
                        )
                      }
                      
                      return (
                        <>
                          {missedWarning}
                          {sortedDays.map(([dateStr, groups], dayIndex) => {
                        const transferDate = parseLocalDate(dateStr)
                        const transferDayOfWeek = transferDate.getDay()
                        const dayShort = WEEKDAYS.find(w => w.value === transferDayOfWeek)?.short || '?'
                        const dayKitCount = groups.reduce((sum, g) => sum + g.items.length, 0)
                        const transferDateLabel = `${transferDate.getMonth() + 1}/${transferDate.getDate()}(${dayShort})`
                        
                        // この移動日がカバーする公演期間を計算
                        // 移動日の翌日 ～ 次の移動日まで（最後の移動日は需要期間の終わりまで）
                        const currentIdx = sortedTransferDateStrs.indexOf(dateStr)
                        const isLastTransferDate = currentIdx === sortedTransferDateStrs.length - 1
                        
                        // 公演開始日 = 移動日の翌日
                        const perfStartDate = new Date(transferDate)
                        perfStartDate.setDate(perfStartDate.getDate() + 1)
                        
                        // 公演終了日 = 次の移動日、または最後なら需要期間の終わり
                        let perfEndDate: Date
                        if (isLastTransferDate) {
                          // 需要期間の最後の日（demandDatesの最大値）
                          const lastDemandDate = demandDates.length > 0 
                            ? demandDates.reduce((max, d) => d > max ? d : max, demandDates[0])
                            : dateStr
                          perfEndDate = parseLocalDate(lastDemandDate)
                        } else {
                          const nextTransferDateStr = sortedTransferDateStrs[currentIdx + 1]
                          perfEndDate = parseLocalDate(nextTransferDateStr)
                        }
                        
                        const perfStartLabel = `${perfStartDate.getMonth() + 1}/${perfStartDate.getDate()}`
                        const perfEndLabel = `${perfEndDate.getMonth() + 1}/${perfEndDate.getDate()}`
                        const perfPeriodLabel = `${perfStartLabel}~${perfEndLabel}公演分`
                        
                        // この移動日が過去かどうか（表示のみに使用、チェックは可能）
                        const isPastTransferDate = isTransferDatePast(dateStr)
                        
                        // 出発店舗・到着店舗でグループ化
                        const bySource = new Map<string, typeof groups>()
                        const byDestination = new Map<string, typeof groups>()
                        const allStoreIds = new Set<string>()
                        
                        for (const group of groups) {
                          // 出発でグループ化
                          if (!bySource.has(group.from_store_id)) {
                            bySource.set(group.from_store_id, [])
                          }
                          bySource.get(group.from_store_id)!.push(group)
                          
                          // 到着でグループ化
                          if (!byDestination.has(group.to_store_id)) {
                            byDestination.set(group.to_store_id, [])
                          }
                          byDestination.get(group.to_store_id)!.push(group)
                          
                          // 関連する店舗IDを収集
                          allStoreIds.add(group.from_store_id)
                          allStoreIds.add(group.to_store_id)
                        }
                        
                        // 店舗をグループ別にまとめる（同じkit_group_idは1つのカードに）
                        const storeGroups = new Map<string, string[]>()
                        allStoreIds.forEach(storeId => {
                          const groupId = getStoreGroupId(storeId)
                          if (!storeGroups.has(groupId)) {
                            storeGroups.set(groupId, [])
                          }
                          storeGroups.get(groupId)!.push(storeId)
                        })
                        
                        // グループを表示順でソート
                        const sortedGroups = [...storeGroups.entries()].sort((a, b) => {
                          const storeA = storeMap.get(a[1][0])
                          const storeB = storeMap.get(b[1][0])
                          return (storeA?.display_order || 0) - (storeB?.display_order || 0)
                        })
                        
                        return (
                          <div key={dateStr}>
                            {/* 移動日ヘッダー（複数日ある場合のみ表示） */}
                            {transferDates.length > 1 && (
                              <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded-lg ${isPastTransferDate ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'}`}>
                                <Calendar className={`h-4 w-4 ${isPastTransferDate ? 'text-amber-600' : 'text-primary'}`} />
                                <span className="font-bold">{transferDateLabel} 移動</span>
                                <span className="text-sm text-muted-foreground">→ {perfPeriodLabel}</span>
                                {isPastTransferDate && (
                                  <Badge variant="secondary" className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                                    過去
                                  </Badge>
                                )}
                                <Badge variant="secondary" className="ml-auto">
                                  {dayKitCount}キット
                                </Badge>
                              </div>
                            )}
                            
                            {/* 店舗グループ別（同じkit_groupは1つのカードに） */}
                            <div className="space-y-3">
                              {sortedGroups.map(([groupId, storeIdsInGroup]) => {
                                // グループ内の全店舗の出入りを集計
                                const groupOutgoing: typeof groups = []
                                const groupIncoming: typeof groups = []
                                
                                storeIdsInGroup.forEach(storeId => {
                                  const outgoing = bySource.get(storeId) || []
                                  const incoming = byDestination.get(storeId) || []
                                  // 同グループ内への移動は除外（不要な移動）
                                  outgoing.forEach(route => {
                                    if (getStoreGroupId(route.to_store_id) !== groupId) {
                                      groupOutgoing.push(route)
                                    }
                                  })
                                  incoming.forEach(route => {
                                    if (getStoreGroupId(route.from_store_id) !== groupId) {
                                      groupIncoming.push(route)
                                    }
                                  })
                                })
                                
                                // ルートをソート
                                const sortRoutesByGroup = (routes: typeof groups) => {
                                  return [...routes].sort((a, b) => {
                                    const storeAData = storeMap.get(a.to_store_id)
                                    const storeBData = storeMap.get(b.to_store_id)
                                    return (storeAData?.display_order || 0) - (storeBData?.display_order || 0)
                                  })
                                }
                                const sortIncomingByGroup = (routes: typeof groups) => {
                                  return [...routes].sort((a, b) => {
                                    const storeAData = storeMap.get(a.from_store_id)
                                    const storeBData = storeMap.get(b.from_store_id)
                                    return (storeAData?.display_order || 0) - (storeBData?.display_order || 0)
                                  })
                                }
                                
                                const outgoingRoutes = sortRoutesByGroup(groupOutgoing)
                                const incomingRoutes = sortIncomingByGroup(groupIncoming)
                                const outgoingCount = outgoingRoutes.reduce((sum, r) => sum + r.items.length, 0)
                                const incomingCount = incomingRoutes.reduce((sum, r) => sum + r.items.length, 0)
                                
                                // グループ名（複数店舗ならスラッシュで繋ぐ）
                                const groupStoreName = storeIdsInGroup.map(id => {
                                  const store = storeMap.get(id)
                                  return store?.short_name || store?.name || '?'
                                }).join(' / ')
                                
                                return (
                                  <div
                                    key={groupId}
                                    className="bg-white dark:bg-gray-800 rounded-lg p-3"
                                  >
                                    {/* 店舗グループヘッダー */}
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                                      <MapPin className="h-4 w-4 text-primary" />
                                      <span className="font-bold text-lg">{groupStoreName}</span>
                                      <div className="ml-auto flex items-center gap-2">
                                        {outgoingCount > 0 && (
                                          <Badge variant="outline" className="bg-red-50 text-red-700">
                                            出{outgoingCount}
                                          </Badge>
                                        )}
                                        {incomingCount > 0 && (
                                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                            入{incomingCount}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* 到着（このグループが必要としているキット）- 設置チェック */}
                                    {incomingRoutes.length > 0 && (
                                      <div className="mb-3">
                                        <div className="text-xs font-medium text-blue-600 mb-1 flex items-center gap-1">
                                          <ArrowRight className="h-3 w-3" />
                                          ここへ届ける（設置）
                                        </div>
                                        <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                                          {incomingRoutes.map((route, routeIdx) => {
                                            const toStore = storeMap.get(route.to_store_id)
                                            const toStoreName = toStore?.short_name || toStore?.name || ''
                                            return (
                                            <div key={`in-${routeIdx}`}>
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                                                ← {route.from_store_name}から {storeIdsInGroup.length > 1 && `→ ${toStoreName}へ`}
                                              </div>
                                              <div className="space-y-1">
                                                {route.items.map((suggestion, index) => {
                                                  // 移動先店舗（グループ含む）でこのシナリオが使われる全ての日付を取得
                                                  const toGroupId = getStoreGroupId(suggestion.to_store_id)
                                                  const allDatesForScenario = scheduleEvents
                                                    .filter(event => 
                                                      event.scenario_id === suggestion.scenario_id &&
                                                      getStoreGroupId(event.store_id) === toGroupId &&
                                                      demandDates.includes(event.date)
                                                    )
                                                    .map(event => event.date)
                                                    .filter((date, idx, arr) => arr.indexOf(date) === idx) // 重複排除
                                                    .sort()
                                                  const allDatesStr = allDatesForScenario.length > 0 
                                                    ? allDatesForScenario.map(d => {
                                                        const date = parseLocalDate(d)
                                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                                      }).join(', ')
                                                    : `${parseLocalDate(suggestion.performance_date).getMonth() + 1}/${parseLocalDate(suggestion.performance_date).getDate()}`
                                                  
                                                  const pickedUp = isPickedUp(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const delivered = isDelivered(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const completion = getCompletion(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  
                                                  // 誰が設置したか
                                                  const deliveredByName = completion?.delivered_by_staff?.name
                                                  
                                                  return (
                                                    <div key={index} className={`flex items-center gap-2 py-1 ${delivered ? 'opacity-40 bg-green-50 dark:bg-green-900/10 rounded' : ''}`}>
                                                      {/* 設置チェックボックス */}
                                                      <div 
                                                        className={`w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 ${pickedUp ? 'cursor-pointer active:scale-95 hover:border-green-400' : 'cursor-not-allowed opacity-30'} ${delivered ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                                                        onClick={() => handleToggleDelivery(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id, suggestion.scenario_title)}
                                                        title={pickedUp ? '設置完了' : '回収してから設置できます'}
                                                      >
                                                        {delivered && <Check className="h-3 w-3 text-white" />}
                                                      </div>
                                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                                        {allDatesStr}
                                                      </Badge>
                                                      <span className={`text-xs truncate ${delivered ? 'line-through' : ''}`}>{suggestion.scenario_title}</span>
                                                      <span className="text-muted-foreground text-[10px]">#{suggestion.kit_number}</span>
                                                      {delivered && deliveredByName && (
                                                        <span className="text-[10px] text-green-600 font-medium">
                                                          {deliveredByName}設置 {formatCompletionDate(completion?.delivered_at || null)}
                                                        </span>
                                                      )}
                                                      {!pickedUp && (
                                                        <span className="text-[10px] text-orange-500">未回収</span>
                                                      )}
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )})}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 出発（このグループから持ち出すキット）- 回収チェック */}
                                    {outgoingRoutes.length > 0 && (
                                      <div>
                                        <div className="text-xs font-medium text-red-600 mb-1 flex items-center gap-1">
                                          <ArrowRight className="h-3 w-3 rotate-180" />
                                          ここから持ち出す（回収）
                                        </div>
                                        <div className="space-y-2 pl-2 border-l-2 border-red-200">
                                          {outgoingRoutes.map((route, routeIdx) => {
                                            const fromStore = storeMap.get(route.from_store_id)
                                            const fromStoreName = fromStore?.short_name || fromStore?.name || ''
                                            return (
                                            <div key={`out-${routeIdx}`}>
                                              {/* 配達先ヘッダー */}
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                                                {storeIdsInGroup.length > 1 && `${fromStoreName}から `}→ {route.to_store_name}へ
                                              </div>
                                              
                                              {/* キット一覧 */}
                                              <div className="space-y-1">
                                                {route.items.map((suggestion, index) => {
                                                  // 移動先店舗（グループ含む）でこのシナリオが使われる全ての日付を取得
                                                  const toGroupId = getStoreGroupId(suggestion.to_store_id)
                                                  const allDatesForScenario = scheduleEvents
                                                    .filter(event => 
                                                      event.scenario_id === suggestion.scenario_id &&
                                                      getStoreGroupId(event.store_id) === toGroupId &&
                                                      demandDates.includes(event.date)
                                                    )
                                                    .map(event => event.date)
                                                    .filter((date, idx, arr) => arr.indexOf(date) === idx) // 重複排除
                                                    .sort()
                                                  const allDatesStr = allDatesForScenario.length > 0 
                                                    ? allDatesForScenario.map(d => {
                                                        const date = parseLocalDate(d)
                                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                                      }).join(', ')
                                                    : `${parseLocalDate(suggestion.performance_date).getMonth() + 1}/${parseLocalDate(suggestion.performance_date).getDate()}`
                                                  
                                                  const pickedUp = isPickedUp(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const delivered = isDelivered(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const completion = getCompletion(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  
                                                  // 誰が回収したか
                                                  const pickedUpByName = completion?.picked_up_by_staff?.name
                                                  
                                                  return (
                                                    <div key={index} className={`flex items-center gap-2 py-1 ${pickedUp ? 'bg-blue-50 dark:bg-blue-900/10 rounded' : ''} ${delivered ? 'opacity-40' : ''}`}>
                                                      {/* 回収チェックボックス */}
                                                      <div 
                                                        className={`w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 cursor-pointer active:scale-95 hover:border-blue-400 ${pickedUp ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}
                                                        onClick={() => handleTogglePickup(suggestion.scenario_id, suggestion.kit_number, suggestion.performance_date, suggestion.from_store_id, suggestion.to_store_id)}
                                                        title="回収"
                                                      >
                                                        {pickedUp && <Check className="h-3 w-3 text-white" />}
                                                      </div>
                                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                                        {allDatesStr}
                                                      </Badge>
                                                      <span className={`text-xs truncate ${delivered ? 'line-through' : ''}`}>{suggestion.scenario_title}</span>
                                                      <span className="text-muted-foreground text-[10px]">#{suggestion.kit_number}</span>
                                                      {pickedUp && pickedUpByName && (
                                                        <span className="text-[10px] text-blue-600 font-medium">
                                                          {pickedUpByName}回収 {formatCompletionDate(completion?.picked_up_at || null)}
                                                        </span>
                                                      )}
                                                      {delivered && (
                                                        <span className="text-[10px] text-green-500">完了</span>
                                                      )}
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )})}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                        </>
                      )
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
      
      {/* 設置確認ダイアログ */}
      <Dialog open={!!deliveryConfirm} onOpenChange={(open) => !open && setDeliveryConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              設置完了の確認
            </DialogTitle>
          </DialogHeader>
          
          {deliveryConfirm && (
            <div className="space-y-4">
              <p className="text-sm">
                「<span className="font-bold">{deliveryConfirm.scenarioTitle}</span>」を
                <span className="font-bold text-green-600">{deliveryConfirm.toStoreName}</span>
                に設置完了としてマークしますか？
              </p>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  ⚠️ キットの登録場所も「{deliveryConfirm.toStoreName}」に更新されます
                </p>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeliveryConfirm(null)}>
                  キャンセル
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleConfirmDelivery}
                >
                  設置完了
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* ヘルプダイアログ */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              キット配置管理の使い方
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 text-sm">
            {/* 概要 */}
            <section>
              <h3 className="font-bold text-base mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                この機能について
              </h3>
              <p className="text-muted-foreground">
                公演に必要なシナリオキットを管理し、週間スケジュールに合わせて
                どのキットをどこに運ぶべきかを確認・追跡する機能です。
              </p>
            </section>

            {/* タブの説明 */}
            <section>
              <h3 className="font-bold text-base mb-3">タブの説明</h3>
              
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border-l-4 border-blue-500">
                  <h4 className="font-semibold mb-1">📦 移動計画（メイン）</h4>
                  <p className="text-muted-foreground">
                    今週必要なキット移動の一覧。店舗ごとに何を持ち出すか・届けるかを確認できます。
                  </p>
                  <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside text-xs">
                    <li><span className="text-red-600 font-medium">持ち出す（回収）</span>：この拠点から持っていくキット</li>
                    <li><span className="text-blue-600 font-medium">届ける（設置）</span>：この拠点に届けるキット</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    ※ 同じ住所の店舗（森① / 森②など）は1つにまとめて表示されます
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold mb-1">📅 週間需要</h4>
                  <p className="text-muted-foreground">
                    各日付・各店舗で必要なシナリオを一覧表示。
                    オレンジ色の背景は、その拠点にキットがない状態を示します。
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold mb-1">🎭 シナリオ別</h4>
                  <p className="text-muted-foreground">
                    シナリオごとにキットが今どの店舗にあるか確認・登録できます。
                    キット数の増減もここで行います。
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold mb-1">🏪 店舗別在庫</h4>
                  <p className="text-muted-foreground">
                    各店舗にあるキットを一覧表示。
                    ドラッグ&ドロップや右クリックでキットの移動・状態変更ができます。
                  </p>
                </div>
              </div>
            </section>

            {/* チェックボックスの使い方 */}
            <section>
              <h3 className="font-bold text-base mb-3">回収・設置チェックの使い方</h3>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2">
                <p className="text-muted-foreground">
                  移動作業を2段階でチェックして進捗を共有：
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>
                    <span className="text-blue-600 font-medium">回収チェック</span>
                    <span className="text-xs">（キットを持ち出したらチェック）</span>
                  </li>
                  <li>
                    <span className="text-green-600 font-medium">設置チェック</span>
                    <span className="text-xs">（届けたらチェック → 確認ダイアログが出ます）</span>
                  </li>
                </ol>
                <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded p-2 mt-2">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    ⚠️ 設置完了をチェックすると、キットの登録場所が自動的に移動先に更新されます
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ✓ チェック状態は保存され、他のスタッフとリアルタイム共有されます
                </p>
              </div>
            </section>

            {/* 移動日の設定 */}
            <section>
              <h3 className="font-bold text-base mb-3">移動日について</h3>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                <p className="text-muted-foreground">
                  「移動日」で選択した日付に移動作業を行う前提で計画が作成されます。
                  その週の中で実際に移動できる日を選択してください。
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside text-xs">
                  <li>例: 2/3(月)と2/7(金)を選択 → 月曜は火〜金公演分、金曜は土〜月公演分</li>
                  <li>当日公演のキットは前日までに運ぶ計算です</li>
                  <li>選択した移動日より前の公演がある場合は警告が表示されます</li>
                </ul>
              </div>
            </section>

            {/* よくあるケースと対処法 */}
            <section>
              <h3 className="font-bold text-base mb-3">💡 よくあるケースと対処法</h3>
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">今週は水曜しか移動できない</h4>
                  <p className="text-xs text-muted-foreground">
                    移動日の選択で水曜だけを選択 → 火曜公演分は前週に運ぶ必要があるため警告が表示されます
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">キットの登録場所が間違っている</h4>
                  <p className="text-xs text-muted-foreground">
                    「店舗別在庫」タブ → キットカードを右クリック → 「○○に移動」を選択
                    <br />
                    または、キットカードをドラッグして正しい店舗にドロップ
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">キットが破損・欠品している</h4>
                  <p className="text-xs text-muted-foreground">
                    「店舗別在庫」タブ → キットカードを右クリック → 「欠けあり」「要確認」などを選択
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">誰がキットを運んだか確認したい</h4>
                  <p className="text-xs text-muted-foreground">
                    「移動計画」タブでチェック済みのキットに「○○回収 2/2(月)」と表示されます
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">キット数を増やしたい・減らしたい</h4>
                  <p className="text-xs text-muted-foreground">
                    「シナリオ別」タブ → シナリオを探す → +/- ボタンでキット数を変更
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-1">新しいシナリオのキットを登録したい</h4>
                  <p className="text-xs text-muted-foreground">
                    「シナリオ別」タブで下にスクロール → 「キット未設定のシナリオ」から +ボタンで追加
                  </p>
                </div>
              </div>
            </section>

            {/* 注意事項 */}
            <section>
              <h3 className="font-bold text-base mb-3 text-orange-600">⚠️ 注意事項</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <span>移動計画は目安です。実際の状況に応じて調整してください。</span>
                </li>
                <li className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <span>設置チェックを入れるとキットの登録場所が自動更新されます。間違えた場合は「店舗別在庫」で修正してください。</span>
                </li>
              </ul>
            </section>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowHelp(false)}>
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
