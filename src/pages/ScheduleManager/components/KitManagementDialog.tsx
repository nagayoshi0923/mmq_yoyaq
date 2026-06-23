/**
 * キット管理ダイアログ
 * 
 * シナリオキットの現在位置確認、週間需要の可視化、移動計画の作成を行う
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { planKitTransfers, findOverdueTransfers, type PlannerDemand, type OverdueTransfer } from '@/utils/kitTransferPlanner'
import type { KitLocation, KitTransferEvent, KitTransferSuggestion, Store, StoreTravelTime, Scenario, KitCondition, KitTransferCompletion } from '@/types'
import { getCurrentStaff, getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu'
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw, Plus, Minus, Search, GripVertical, HelpCircle, Lock, LockOpen } from 'lucide-react'
import { formatJstMonthDay, toJstYmd } from '@/utils/jstDate'
import type { DraggedKit, ContextMenuState, KitManagementDialogProps } from './kitManagement/types'
import { WEEKDAYS, formatCompletionDate } from './kitManagement/helpers'
import { CurrentPlacementTab } from './kitManagement/tabs/CurrentPlacementTab'
import { StoreInventoryTab } from './kitManagement/tabs/StoreInventoryTab'
import { WeeklyDemandTab } from './kitManagement/tabs/WeeklyDemandTab'
import { TransferPlanTab } from './kitManagement/tabs/TransferPlanTab'

export function KitManagementDialog({ isOpen, onClose }: KitManagementDialogProps) {
  // データ
  const [kitLocations, setKitLocations] = useState<KitLocation[]>([])
  const [transferEvents, setTransferEvents] = useState<KitTransferEvent[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [storeTravelTimes, setStoreTravelTimes] = useState<StoreTravelTime[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<Array<{
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
  // 週先頭からのオフセットで曜日パターンを記憶（週が変わっても維持・組織全員で共有）
  const [selectedOffsets, setSelectedOffsets] = useState<number[]>([0, 4]) // デフォルト: 月曜・金曜
  const selectedOffsetsRef = useRef<number[]>([0, 4])
  selectedOffsetsRef.current = selectedOffsets
  const [transferStartStoreIds, setTransferStartStoreIds] = useState<Record<string, string>>({})

  // オフセット変更時に global_settings へ保存
  const saveOffsets = useCallback(async (offsets: number[]) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      await supabase
        .from('global_settings')
        .update({ kit_transfer_offsets: offsets })
        .eq('organization_id', orgId)
    } catch (e) {
      console.warn('kit_transfer_offsets の保存に失敗:', e)
    }
  }, [])

  const saveTransferStartStoreIds = useCallback(async (startStoreIds: Record<string, string>) => {
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) return
      await supabase
        .from('global_settings')
        .update({ kit_transfer_start_store_ids: startStoreIds })
        .eq('organization_id', orgId)
    } catch (e) {
      console.warn('kit_transfer_start_store_ids の保存に失敗:', e)
    }
  }, [])
  
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
    orgScenarioId?: string
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
  
  // 週が変わったら記憶した曜日オフセットから移動日を再構成
  useEffect(() => {
    if (weekDates.length > 0) {
      const dates = selectedOffsetsRef.current
        .filter(i => i >= 0 && i < weekDates.length)
        .map(i => weekDates[i])
        .filter((d): d is string => Boolean(d))
      setTransferDates(dates)
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
      kits: Array<{ kitNumber: number; condition: KitCondition; conditionNotes?: string | null; isFixed?: boolean }>
    }>>()
    
    // アクティブな店舗で初期化
    stores.filter(s => s.status === 'active').forEach(store => {
      inventory.set(store.id, [])
    })
    
    // キット位置情報を集約
    for (const loc of kitLocations) {
      // scenario.id (= scenario_master_id) を使用
      const scenarioId = loc.scenario?.id
      if (!scenarioId) continue
      
      const scenario = scenarioMap.get(scenarioId)
      if (!scenario) continue
      
      const storeKits = inventory.get(loc.store_id)
      if (!storeKits) continue
      
      const existing = storeKits.find(s => s.scenario.id === scenarioId)
      const kitInfo = {
        kitNumber: loc.kit_number,
        condition: (loc.condition || 'good') as KitCondition,
        conditionNotes: loc.condition_notes,
        isFixed: loc.is_fixed ?? false
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
      scenario_master_id: string
      needed: number
      available: number
    }> = []
    
    // 現在のキット状態をシミュレート
    const currentState = new Map<string, string>() // `${scenario_id}-${kit_number}` -> store_id
    for (const loc of kitLocations) {
      const scenarioId = loc.scenario?.id
      if (scenarioId) {
        currentState.set(`${scenarioId}-${loc.kit_number}`, loc.store_id)
      }
    }
    
    // 日付順に需要をチェック（公演期間 = demandDates）
    for (const date of demandDates) {
      const dayEvents = scheduleEvents.filter(e => e.date === date)
      
      // 店舗×シナリオで集計（同じ日・店舗・シナリオは1キットで済む）
      // UUID にはハイフンが含まれるため :: をセパレータとして使用
      const needs = new Map<string, { storeId: string; scenarioId: string }>()
      for (const event of dayEvents) {
        if (event.scenario_master_id) {
          const key = `${event.store_id}::${event.scenario_master_id}`
          needs.set(key, { storeId: event.store_id, scenarioId: event.scenario_master_id })
        }
      }

      // 各需要に対して在庫をチェック（needed は常に1）
      for (const { storeId, scenarioId } of needs.values()) {
        const needed = 1 // 同日なら1キットで足りる
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
            scenario_master_id: scenarioId,
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

  // 完了状態のキー生成（performance_dateを含むフルキー、kit_numberは数値に統一）
  const getCompletionKeyFull = useCallback((
    scenarioId: string,
    kitNumber: number | string,
    performanceDate: string,
    toStoreId: string
  ) => {
    // kit_numberを数値に統一してから文字列化
    const normalizedKitNumber = typeof kitNumber === 'string' ? parseInt(kitNumber, 10) : kitNumber
    return `${scenarioId}-${normalizedKitNumber}-${performanceDate}-${toStoreId}`
  }, [])
  
  // 完了状態のキー生成（シナリオとキット番号のみ - 同じキットなら一致とみなす）
  const getCompletionKeyLoose = useCallback((
    scenarioId: string,
    kitNumber: number,
  ) => {
    return `${scenarioId}-${kitNumber}`
  }, [])
  
  // 完了状態のマップ（高速ルックアップ用）- フルキーとルーズキーの両方で登録
  // org_scenario_id を優先、なければ scenario_master_id を使用
  const completionMapFull = useMemo(() => {
    const map = new Map<string, KitTransferCompletion>()
    for (const c of completions) {
      const scenarioId = c.org_scenario_id || c.scenario_master_id
      const key = getCompletionKeyFull(scenarioId, c.kit_number, c.performance_date, c.to_store_id)
      map.set(key, c)
    }
    return map
  }, [completions, getCompletionKeyFull])
  
  // ルーズキーのマップ（同じシナリオ・キットの完了状態、to_store_idや日付は問わない）
  const completionMapLoose = useMemo(() => {
    const map = new Map<string, KitTransferCompletion>()
    // 日付順にソートして最新を保持
    const sorted = [...completions].sort((a, b) => 
      (a.performance_date || '').localeCompare(b.performance_date || '')
    )
    for (const c of sorted) {
      const scenarioId = c.org_scenario_id || c.scenario_master_id
      const key = getCompletionKeyLoose(scenarioId, c.kit_number)
      map.set(key, c)
    }
    return map
  }, [completions, getCompletionKeyLoose])
  
  // 回収済みかどうか（フルキーのみで完全一致マッチ）
  // 別の移動の完了記録が誤表示されるのを防ぐため、ルーズキーは使わない
  const isPickedUp = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ) => {
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    const completion = completionMapFull.get(fullKey)
    return completion?.picked_up_at != null
  }, [completionMapFull, getCompletionKeyFull])
  
  // 設置済みかどうか（フルキーのみで完全一致マッチ）
  const isDelivered = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ) => {
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    const completion = completionMapFull.get(fullKey)
    return completion?.delivered_at != null
  }, [completionMapFull, getCompletionKeyFull])
  
  // 完了情報を取得（フルキーのみで完全一致マッチ）
  const getCompletion = useCallback((
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ): KitTransferCompletion | undefined => {
    const fullKey = getCompletionKeyFull(scenarioId, kitNumber, performanceDate, toStoreId)
    return completionMapFull.get(fullKey)
  }, [completionMapFull, getCompletionKeyFull])
  
  // 公演がキャンセルされたかチェック
  const isPerformanceCancelled = useCallback((scenarioId: string, performanceDate: string, storeId: string): boolean => {
    const toGroupId = getStoreGroupId(storeId)
    const matchingEvents = scheduleEvents.filter(event => 
      event.scenario_master_id === scenarioId &&
      event.date === performanceDate &&
      getStoreGroupId(event.store_id) === toGroupId
    )
    // 該当イベントがすべてキャンセル、または該当イベントがない場合はキャンセル扱い
    if (matchingEvents.length === 0) return false // イベント自体がなければ不明なのでfalse
    const allCancelled = matchingEvents.every(event => event.is_cancelled)
    if (allCancelled) {
      console.log('⚠️ 公演キャンセル判定:', { scenarioId, performanceDate, storeId, matchingEvents: matchingEvents.length, allCancelled })
    }
    return allCancelled
  }, [scheduleEvents, getStoreGroupId])
  
  // 提案と完了記録をマージ（アルゴリズムが生成しなかった完了済み移動も表示）
  const mergedSuggestions = useMemo(() => {
    const filteredSuggestions = [...suggestions]
    
    // org_scenario_id → scenario情報 のマッピング（複数ソースから構築）
    const orgScenarioInfoMap = new Map<string, { scenarioMasterId: string; title: string }>()
    
    // 1. kitLocations から構築
    for (const loc of kitLocations) {
      if (loc.org_scenario_id && loc.scenario) {
        orgScenarioInfoMap.set(loc.org_scenario_id, {
          scenarioMasterId: loc.scenario.id,
          title: loc.scenario.title
        })
      }
    }
    
    // 2. suggestions からも構築（キット移動後でも情報を保持）
    for (const s of suggestions) {
      if (s.org_scenario_id && s.scenario_title && !orgScenarioInfoMap.has(s.org_scenario_id)) {
        orgScenarioInfoMap.set(s.org_scenario_id, {
          scenarioMasterId: s.scenario_master_id,
          title: s.scenario_title
        })
      }
    }
    
    // 既存提案のフルキーを収集（org_scenario_id と scenario_master_id の両方で登録）
    const suggestionFullKeys = new Set<string>()
    for (const s of filteredSuggestions) {
      const orgId = s.org_scenario_id || s.scenario_master_id
      suggestionFullKeys.add(`${orgId}-${s.kit_number}-${s.performance_date}-${s.to_store_id}`)
      if (s.org_scenario_id && s.org_scenario_id !== s.scenario_master_id) {
        suggestionFullKeys.add(`${s.scenario_master_id}-${s.kit_number}-${s.performance_date}-${s.to_store_id}`)
      }
    }
    
    // 完了記録から追加の「提案」を生成（今週の demandDates に含まれるもの）
    const additionalFromCompletions: typeof suggestions = []
    
    for (const c of completions) {
      if (!c.picked_up_at) continue
      
      // 今週の公演期間に含まれない完了記録はスキップ
      if (!demandDates.includes(c.performance_date)) continue
      
      // フルキーで重複チェック（org_scenario_id を優先）
      const cScenarioId = c.org_scenario_id || c.scenario_master_id
      const fullKey = `${cScenarioId}-${c.kit_number}-${c.performance_date}-${c.to_store_id}`
      if (suggestionFullKeys.has(fullKey)) continue
      
      // シナリオ情報を取得（org_scenario_id からの解決を優先）
      const orgInfo = c.org_scenario_id ? orgScenarioInfoMap.get(c.org_scenario_id) : undefined
      const scenarioFromList = !orgInfo ? scenarios.find(s => s.id === c.scenario_master_id) : undefined
      const scenarioTitle = orgInfo?.title || scenarioFromList?.title
      const scenarioMasterId = orgInfo?.scenarioMasterId || c.scenario_master_id
      
      // シナリオ情報が取得できない場合はログを出力してスキップ
      if (!scenarioTitle) {
        console.warn('⚠️ 完了記録のシナリオ情報が見つかりません:', {
          completion_id: c.id,
          org_scenario_id: c.org_scenario_id,
          scenario_master_id: c.scenario_master_id,
          orgInfoFound: !!orgInfo,
          scenarioFromListFound: !!scenarioFromList,
          orgScenarioInfoMapSize: orgScenarioInfoMap.size
        })
        continue
      }
      
      // 店舗情報を取得
      const fromStore = stores.find(s => s.id === c.from_store_id)
      const toStore = stores.find(s => s.id === c.to_store_id)
      if (!toStore) continue
      
      // 移動日を計算（picked_up_at の日付）
      const pickedUpDate = new Date(c.picked_up_at)
      const actualTransferDate = `${pickedUpDate.getFullYear()}-${String(pickedUpDate.getMonth() + 1).padStart(2, '0')}-${String(pickedUpDate.getDate()).padStart(2, '0')}`
      
      additionalFromCompletions.push({
        scenario_master_id: scenarioMasterId,
        scenario_title: scenarioTitle,
        kit_number: c.kit_number,
        from_store_id: c.from_store_id || '',
        from_store_name: fromStore?.short_name || fromStore?.name || '',
        to_store_id: c.to_store_id,
        to_store_name: toStore.short_name || toStore.name,
        transfer_date: actualTransferDate,
        performance_date: c.performance_date,
        reason: '完了記録',
        org_scenario_id: c.org_scenario_id
      })
      
      suggestionFullKeys.add(fullKey)
    }
    
    return [...filteredSuggestions, ...additionalFromCompletions]
  }, [suggestions, completions, scenarios, stores, kitLocations, demandDates])

  // ── 新・移動計画ロジック（再設計版 / planKitTransfers）──────────
  // 仕様: docs/design/kit-transfer-planning.md
  // 今日起点・前日必着・同住所×時間重複は最大同時数・解消不能は shortages。
  // ※現状は緊急ボード（手遅れ＝shortages / 持ち越し＝overdue）に使用。一覧の置換は後続。
  const planToday = toJstYmd(new Date())
  // 分析期間の上限（今日 +14日）
  const planHorizonEnd = useMemo(() => {
    const [y, m, d] = planToday.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + 14)
    return toJstYmd(dt)
  }, [planToday])

  // kitLocations から現在のキット配置（scenario.id ベース）
  const kitStateForPlan = useMemo<KitState>(() => {
    const state: KitState = {}
    for (const loc of kitLocations) {
      const scenarioId = loc.scenario?.id
      if (!scenarioId) continue
      if (!state[scenarioId]) state[scenarioId] = {}
      state[scenarioId][loc.kit_number] = loc.store_id
    }
    return state
  }, [kitLocations])

  // 時刻つき需要（今日以降・キャンセル除外）。時刻欠落は終日扱い（重複＝多めに必要＝安全側）
  const plannerDemands = useMemo<PlannerDemand[]>(() => {
    return scheduleEvents
      .filter(e => {
        if (!e.scenario_master_id || e.is_cancelled) return false
        if (!(e.date >= planToday && e.date <= planHorizonEnd)) return false
        // キット管理対象（kit_count>0）のシナリオのみ。非対象は不足に数えない
        const sc = scenarioMap.get(e.scenario_master_id)
        return !!sc && (sc.kit_count || 0) > 0
      })
      .map(e => ({
        date: e.date,
        store_id: e.store_id,
        scenario_master_id: e.scenario_master_id,
        start_time: e.start_time || '00:00',
        end_time: e.end_time || '23:59',
      }))
  }, [scheduleEvents, planToday, planHorizonEnd, scenarioMap])

  // 固定キット（キット番号ごと）。kitLocations.is_fixed から集合を作る。
  // ※固定は「キット番号ごと」。店舗固定(stores.kit_fixed)は使わない。
  const fixedKitKeys = useMemo(() => {
    const set = new Set<string>()
    for (const loc of kitLocations) {
      const scenarioId = loc.scenario?.id
      if (scenarioId && loc.is_fixed) set.add(`${scenarioId}-${loc.kit_number}`)
    }
    return set
  }, [kitLocations])

  // 新ロジックの計算結果（移動提案＋解消できない不足）
  const newPlan = useMemo(
    () => planKitTransfers(kitStateForPlan, plannerDemands, scenarios, stores, planToday, fixedKitKeys, storeTravelTimes),
    [kitStateForPlan, plannerDemands, scenarios, stores, planToday, fixedKitKeys, storeTravelTimes],
  )

  // 持ち越し（未実行の確定移動・責任追及）
  const overdueTransfers = useMemo<OverdueTransfer[]>(
    () => findOverdueTransfers(transferEvents, completions, planToday),
    [transferEvents, completions, planToday],
  )

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
  // orgScenarioId: organization_scenarios.id（API用）、scenarioId: scenario_master_id（表示・マッチング用）
  const handleTogglePickup = async (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    fromStoreId: string,
    toStoreId: string,
    orgScenarioId?: string
  ) => {
    console.log('📌 handleTogglePickup called:', {
      scenarioId,
      orgScenarioId,
      kitNumber,
      performanceDate,
      fromStoreId,
      toStoreId,
      currentStaffId
    })
    
    if (!currentStaffId) {
      showToast.error('スタッフ情報が取得できません')
      return
    }
    
    // API呼び出しとルックアップには org_scenario_id を使用（なければ scenarioId をフォールバック）
    const apiScenarioId = orgScenarioId || scenarioId
    console.log('📌 Using apiScenarioId:', apiScenarioId)
    
    // ルックアップにも apiScenarioId を使用（DBに保存されているID）
    const currentlyPickedUp = isPickedUp(apiScenarioId, kitNumber, performanceDate, toStoreId)
    console.log('📌 currentlyPickedUp:', currentlyPickedUp)
    
    try {
      if (currentlyPickedUp) {
        // 回収解除（設置も解除される）
        console.log('📌 Calling unmarkPickedUp...')
        await kitApi.unmarkPickedUp(apiScenarioId, kitNumber, performanceDate, toStoreId)
        console.log('📌 unmarkPickedUp completed')
      } else {
        // 回収完了
        console.log('📌 Calling markPickedUp...')
        const result = await kitApi.markPickedUp(apiScenarioId, kitNumber, performanceDate, fromStoreId, toStoreId, currentStaffId)
        console.log('📌 markPickedUp completed:', result)
      }
      // 完了状態を手動で再取得（リアルタイム購読のバックアップ）
      const startDate = weekDates[0]
      const endDateObj = new Date(weekDates[6])
      endDateObj.setDate(endDateObj.getDate() + 3)
      const endDate = endDateObj.toISOString().split('T')[0]
      console.log('📌 Fetching completions:', startDate, endDate)
      const completionsData = await kitApi.getTransferCompletions(startDate, endDate)
      console.log('📌 Completions fetched:', completionsData.length)
      setCompletions(completionsData)
    } catch (error) {
      console.error('❌ Failed to toggle pickup:', error)
      showToast.error('操作に失敗しました')
    }
  }
  
  // 設置完了をトグル（確認ダイアログを表示）
  // orgScenarioId: organization_scenarios.id（API用）
  const handleToggleDelivery = (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string,
    scenarioTitle?: string,
    orgScenarioId?: string
  ) => {
    if (!currentStaffId) {
      showToast.error('スタッフ情報が取得できません')
      return
    }
    
    // ルックアップには org_scenario_id を優先して使用（DBに保存されているID）
    const lookupScenarioId = orgScenarioId || scenarioId
    
    // 回収されていない場合は設置できない
    if (!isPickedUp(lookupScenarioId, kitNumber, performanceDate, toStoreId)) {
      return
    }
    
    const currentlyDelivered = isDelivered(lookupScenarioId, kitNumber, performanceDate, toStoreId)
    
    if (currentlyDelivered) {
      // 設置解除は確認なしで実行
      executeDeliveryToggle(scenarioId, kitNumber, performanceDate, toStoreId, true, orgScenarioId)
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
        toStoreName,
        orgScenarioId
      })
    }
  }
  
  // 設置完了/解除を実行
  // orgScenarioId: organization_scenarios.id（API用）
  const executeDeliveryToggle = async (
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string,
    isUnmark: boolean,
    orgScenarioId?: string
  ) => {
    if (!currentStaffId) return
    
    // API呼び出しには org_scenario_id を使用（なければ scenarioId をフォールバック）
    const apiScenarioId = orgScenarioId || scenarioId
    
    try {
      if (isUnmark) {
        // 設置解除（キット位置は戻さない - 手動で戻す必要あり）
        await kitApi.unmarkDelivered(apiScenarioId, kitNumber, performanceDate, toStoreId)
      } else {
        // 設置完了
        await kitApi.markDelivered(apiScenarioId, kitNumber, performanceDate, toStoreId, currentStaffId)
        // キットの登録場所も移動先に更新
        await kitApi.setKitLocation(apiScenarioId, kitNumber, toStoreId)
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
        false,
        deliveryConfirm.orgScenarioId
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
        const scenarioId = loc.scenario?.id
        if (!scenarioId) continue
        if (!kitState[scenarioId]) {
          kitState[scenarioId] = {}
        }
        kitState[scenarioId][loc.kit_number] = loc.store_id
      }

      // 週間需要を構築（scenario_master_id があるイベントのみ）
      // 同じ日・同じ店舗・同じシナリオは1キットで済む（朝使ったキットを夜も使える）
      // demandDatesを使用して、移動日がカバーする期間全体の公演を含める
      const demandSet = new Set<string>()
      const demands: Array<{ date: string; store_id: string; scenario_master_id: string }> = []
      for (const event of scheduleEvents) {
        if (demandDates.includes(event.date) && event.scenario_master_id && !event.is_cancelled) {
          const key = `${event.date}::${event.store_id}::${event.scenario_master_id}`
          if (!demandSet.has(key)) {
            demandSet.add(key)
            demands.push({
              date: event.date,
              store_id: event.store_id,
              scenario_master_id: event.scenario_master_id
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
        allScenarios: scenarios.length,
        scenariosWithKits: scenariosWithKits.length,
        transferDates,
        transferDaysOfWeek
      })
      
      if (demands.length === 0) {
        console.warn('⚠️ 週間需要が0件です。スケジュールにシナリオが設定されていない可能性があります。')
      }

      // 探偵撲滅デバッグ: '撲滅' を含む全シナリオを出力
      const baba = stores.find(s => s.name?.includes('馬場') || s.short_name?.includes('馬場'))
      const okubo = stores.find(s => s.name?.includes('大久保') || s.short_name?.includes('大久保'))
      const bokumetsusScenarios = scenarios.filter(s => s.title?.includes('撲滅'))
      console.log('🔍 撲滅シナリオ一覧:', bokumetsusScenarios.map(s => ({
        title: s.title,
        id: s.id,
        kit_count: s.kit_count,
        demands: demands.filter(d => d.scenario_master_id === s.id),
        kitState: kitState[s.id],
      })))
      // 馬場の全需要を確認
      if (baba) {
        console.log('🔍 馬場の需要一覧:', demands
          .filter(d => d.store_id === baba.id)
          .map(d => ({ date: d.date, scenario: scenarios.find(s => s.id === d.scenario_master_id)?.title || d.scenario_master_id }))
        )
      }
      console.log('🔍 大久保のkitState:', okubo ? Object.entries(kitState)
        .filter(([, kits]) => Object.values(kits).includes(okubo.id))
        .map(([scenarioId, kits]) => ({
          scenario: scenarios.find(s => s.id === scenarioId)?.title || scenarioId,
          kits
        })) : 'store not found'
      )

      // scenario_master_id → org_scenario_id のマッピングを作成
      // kitLocations から、scenario.id（= scenario_master_id）と org_scenario_id の対応を取得
      const scenarioIdToOrgScenarioId = new Map<string, string>()
      for (const loc of kitLocations) {
        if (loc.scenario?.id && loc.org_scenario_id) {
          scenarioIdToOrgScenarioId.set(loc.scenario.id, loc.org_scenario_id)
        }
      }

      // 移動計画を計算
      // scenariosWithKits（kit_count > 0 かつ検索フィルタ適用）ではなく、
      // 全シナリオを渡す。kit_count が null でも kitLocations にキットがあれば計算対象にするため。
      const result = calculateKitTransfers(
        kitState,
        demands,
        scenarios,
        stores,
        transferDaysOfWeek
      )

      // 結果に org_scenario_id を付加（API呼び出し用）
      const resultWithOrgScenarioId = result.map(suggestion => ({
        ...suggestion,
        org_scenario_id: scenarioIdToOrgScenarioId.get(suggestion.scenario_master_id) || suggestion.scenario_master_id
      }))

      console.log('📦 移動計算結果:', resultWithOrgScenarioId)
      setSuggestions(resultWithOrgScenarioId)
      
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
  }, [kitLocations, scheduleEvents, demandDates, scenarios, scenariosWithKits, stores, transferDates])

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
  
  // 店舗固定ステータスをトグル
  // キット（キット番号ごと）の固定トグル。固定キットは移動計画で動かさない。
  // scenarioId は orgScenarioId || scenario.id（API はどちらでも解決）。
  const handleToggleKitFixed = async (scenarioId: string, kitNumber: number, isFixed: boolean) => {
    const matches = (l: KitLocation) =>
      (l.org_scenario_id === scenarioId || l.scenario?.id === scenarioId) && l.kit_number === kitNumber
    // 楽観更新：即座に🔒を反映（API完了を待たずに見た目を変える）
    setKitLocations(prev => prev.map(l => matches(l) ? { ...l, is_fixed: isFixed } : l))
    try {
      await kitApi.updateKitFixed(scenarioId, kitNumber, isFixed)
      showToast.success(isFixed ? 'このキットを固定しました（移動計画で動かしません）' : 'キットの固定を解除しました')
    } catch (e) {
      // 失敗したら元に戻す＋明示
      console.error('Failed to toggle kit is_fixed:', e)
      setKitLocations(prev => prev.map(l => matches(l) ? { ...l, is_fixed: !isFixed } : l))
      showToast.error('固定設定の更新に失敗しました（APIデプロイ待ち/権限の可能性）')
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
    // このキットが固定中か（キット番号ごと）を kitLocations から判定
    const isFixed = kitLocations.some(l =>
      (l.org_scenario_id === scenarioId || l.scenario?.id === scenarioId) &&
      l.kit_number === kitNumber && !!l.is_fixed
    )
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      scenarioId,
      kitNumber,
      storeId,
      condition,
      isFixed
    })
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => formatJstMonthDay(dateStr, true)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        size="xl"
        className="max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-[85vh] overflow-hidden flex flex-col w-full sm:w-[900px]"
        // 右クリックメニュー（body へ portal）操作時はダイアログを閉じない
        onInteractOutside={(e) => {
          const target = (e.detail as { originalEvent?: Event } | undefined)?.originalEvent?.target as HTMLElement | undefined
          if (target?.closest('[data-context-menu]')) e.preventDefault()
        }}
      >
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
          {/* 現在の配置（kitManagement/tabs/CurrentPlacementTab.tsx へ切り出し） */}
          <CurrentPlacementTab
            scenarioSearch={scenarioSearch}
            setScenarioSearch={setScenarioSearch}
            scenariosWithKits={scenariosWithKits}
            scenariosWithoutKits={scenariosWithoutKits}
            kitLocations={kitLocations}
            setKitLocations={setKitLocations}
            stores={stores}
            storeMap={storeMap}
            handleChangeKitCount={handleChangeKitCount}
            handleSetKitLocation={handleSetKitLocation}
            handleUpdateCondition={handleUpdateCondition}
            handleContextMenu={handleContextMenu}
            handleToggleKitFixed={handleToggleKitFixed}
          />

          {/* 店舗別在庫（カラム式） */}
          {/* 店舗別在庫（kitManagement/tabs/StoreInventoryTab.tsx へ切り出し） */}
          <StoreInventoryTab
            stores={stores}
            storeInventory={storeInventory}
            dragOverStoreId={dragOverStoreId}
            draggedKit={draggedKit}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDrop={handleDrop}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleContextMenu={handleContextMenu}
          />

          {/* 週間需要 */}
          {/* 週間需要（kitManagement/tabs/WeeklyDemandTab.tsx へ切り出し） */}
          <WeeklyDemandTab
            kitShortages={kitShortages}
            storeMap={storeMap}
            scenarioMap={scenarioMap}
            demandDates={demandDates}
            scheduleEvents={scheduleEvents}
            kitLocations={kitLocations}
            stores={stores}
            isSameStoreGroup={isSameStoreGroup}
            formatDate={formatDate}
          />

          {/* 移動計画 */}
          {/* 移動計画(transfers)（kitManagement/tabs/TransferPlanTab.tsx へ切り出し） */}
          <TransferPlanTab
            plannedTransfers={newPlan.transfers}
            newShortages={newPlan.shortages}
            overdueTransfers={overdueTransfers}
            planStartDate={planToday}
            planEndDate={planHorizonEnd}
            transferDates={transferDates}
            setTransferDates={setTransferDates}
            setSelectedOffsets={setSelectedOffsets}
            saveOffsets={saveOffsets}
            transferStartStoreIds={transferStartStoreIds}
            setTransferStartStoreIds={setTransferStartStoreIds}
            saveTransferStartStoreIds={saveTransferStartStoreIds}
            weekDates={weekDates}
            demandDates={demandDates}
            isCalculating={isCalculating}
            suggestions={suggestions}
            mergedSuggestions={mergedSuggestions}
            groupedSuggestions={groupedSuggestions}
            groupedTransferEvents={groupedTransferEvents}
            scheduleEvents={scheduleEvents}
            kitLocations={kitLocations}
            storeTravelTimes={storeTravelTimes}
            scenarioMap={scenarioMap}
            storeMap={storeMap}
            getStoreGroupId={getStoreGroupId}
            getCompletion={getCompletion}
            isPickedUp={isPickedUp}
            isDelivered={isDelivered}
            isPerformanceCancelled={isPerformanceCancelled}
            formatDate={formatDate}
            handleTogglePickup={handleTogglePickup}
            handleToggleDelivery={handleToggleDelivery}
            handleUpdateStatus={handleUpdateStatus}
          />
        </Tabs>
      </DialogContent>
      
      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenuContent
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          <ContextMenuItem
            onClick={() => {
              handleToggleKitFixed(contextMenu.scenarioId, contextMenu.kitNumber, !contextMenu.isFixed)
              setContextMenu(null)
            }}
          >
            {contextMenu.isFixed
              ? <><LockOpen className="h-3 w-3 mr-2" />固定を解除</>
              : <><Lock className="h-3 w-3 mr-2" />このキットを固定（動かさない）</>}
          </ContextMenuItem>

          <ContextMenuSeparator />

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
