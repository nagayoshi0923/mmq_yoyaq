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
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw, Plus, Minus, Search } from 'lucide-react'

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
  const [transferDays, setTransferDays] = useState<number[]>([1, 4])
  
  // シナリオ検索
  const [scenarioSearch, setScenarioSearch] = useState('')

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
        
        // その店舗にあるキット数をカウント
        const kitCount = scenario.kit_count || 1
        let available = 0
        for (let i = 1; i <= kitCount; i++) {
          if (currentState.get(`${scenarioId}-${i}`) === storeId) {
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
  }, [weekDates, scheduleEvents, kitLocations, scenarioMap])
  
  // 移動提案をルート（店舗→店舗）でグループ化
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, {
      from_store_id: string
      from_store_name: string
      to_store_id: string
      to_store_name: string
      items: KitTransferSuggestion[]
    }>()
    
    for (const s of suggestions) {
      const key = `${s.from_store_id}->${s.to_store_id}`
      if (!groups.has(key)) {
        groups.set(key, {
          from_store_id: s.from_store_id,
          from_store_name: s.from_store_name,
          to_store_id: s.to_store_id,
          to_store_name: s.to_store_name,
          items: []
        })
      }
      groups.get(key)!.items.push(s)
    }
    
    // 配列に変換してアイテム数でソート
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length)
  }, [suggestions])
  
  // 確定済み移動イベントをルートでグループ化
  const groupedTransferEvents = useMemo(() => {
    const activeEvents = transferEvents.filter(e => e.status !== 'cancelled')
    const groups = new Map<string, {
      from_store_id: string
      from_store_name: string
      to_store_id: string
      to_store_name: string
      items: KitTransferEvent[]
    }>()
    
    for (const e of activeEvents) {
      const fromStore = storeMap.get(e.from_store_id)
      const toStore = storeMap.get(e.to_store_id)
      const key = `${e.from_store_id}->${e.to_store_id}`
      
      if (!groups.has(key)) {
        groups.set(key, {
          from_store_id: e.from_store_id,
          from_store_name: fromStore?.short_name || fromStore?.name || '?',
          to_store_id: e.to_store_id,
          to_store_name: toStore?.short_name || toStore?.name || '?',
          items: []
        })
      }
      groups.get(key)!.items.push(e)
    }
    
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length)
  }, [transferEvents, storeMap])

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

      // 週間需要を構築
      const demands: Array<{ date: string; store_id: string; scenario_id: string }> = []
      for (const event of scheduleEvents) {
        if (weekDates.includes(event.date)) {
          demands.push({
            date: event.date,
            store_id: event.store_id,
            scenario_id: event.scenario_id
          })
        }
      }

      // 移動計画を計算
      const result = calculateKitTransfers(
        kitState,
        demands,
        scenariosWithKits,
        stores,
        transferDays
      )

      setSuggestions(result)
      
      if (result.length === 0) {
        showToast.success('移動は不要です')
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
            <div className="flex gap-3 h-full overflow-x-auto pb-2">
              {stores.filter(s => s.status === 'active').map(store => {
                const inventory = storeInventory.get(store.id) || []
                const totalKits = inventory.reduce((sum, item) => sum + item.kits.length, 0)
                
                return (
                  <div
                    key={store.id}
                    className="flex-shrink-0 w-56 bg-muted/30 rounded-lg flex flex-col"
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
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                      {inventory.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          キットなし
                        </p>
                      ) : (
                        inventory.flatMap(item =>
                          item.kits.map(kit => {
                            const hasIssue = kit.condition !== 'good'
                            return (
                              <div
                                key={`${item.scenario.id}-${kit.kitNumber}`}
                                className={`
                                  p-2 rounded border bg-background text-xs
                                  ${hasIssue ? 'border-orange-300 dark:border-orange-700' : 'border-border'}
                                `}
                              >
                                {/* 状態バッジ */}
                                <div className="flex items-start gap-1 mb-1">
                                  <span
                                    className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${KIT_CONDITION_COLORS[kit.condition]}`}
                                  >
                                    {kit.condition === 'good' ? '✓' : KIT_CONDITION_LABELS[kit.condition]}
                                  </span>
                                  {kit.conditionNotes && (
                                    <span className="text-[10px] text-orange-600 dark:text-orange-400 truncate">
                                      {kit.conditionNotes}
                                    </span>
                                  )}
                                </div>
                                
                                {/* シナリオ名 */}
                                <div className="font-medium leading-tight">
                                  {item.scenario.title}
                                </div>
                                
                                {/* キット番号（複数キットある場合） */}
                                {(item.scenario.kit_count || 1) > 1 && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    #{kit.kitNumber}
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
                                      
                                      // キット不足チェック
                                      const shortage = kitShortages.find(
                                        s => s.date === date && s.store_id === store.id && s.scenario_id === sid
                                      )
                                      const hasShortage = !!shortage
                                      
                                      return (
                                        <Badge
                                          key={sid}
                                          variant={hasShortage ? 'destructive' : 'secondary'}
                                          className={`text-[10px] truncate max-w-[80px] ${hasShortage ? 'animate-pulse' : ''}`}
                                          title={hasShortage 
                                            ? `${scenario.title} × ${count} ⚠️ キット不足 (在庫: ${shortage.available})`
                                            : `${scenario.title} × ${count}`
                                          }
                                        >
                                          {hasShortage && <AlertTriangle className="h-2.5 w-2.5 mr-0.5 inline" />}
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

              {/* 移動提案（ルートでグループ化） */}
              {suggestions.length > 0 && (
                <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      移動提案 ({suggestions.length}件 / {groupedSuggestions.length}ルート)
                    </div>
                    <Button size="sm" onClick={handleConfirmSuggestions}>
                      <Check className="h-4 w-4 mr-1" />
                      すべて確定
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {groupedSuggestions.map((group, groupIndex) => (
                      <div
                        key={groupIndex}
                        className="bg-white dark:bg-gray-800 rounded-lg p-3"
                      >
                        {/* ルートヘッダー */}
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{group.from_store_name}</span>
                          <ArrowRight className="h-4 w-4" />
                          <span className="font-bold text-primary">{group.to_store_name}</span>
                          <Badge variant="secondary" className="ml-auto">
                            {group.items.length}キット
                          </Badge>
                        </div>
                        
                        {/* キット一覧 */}
                        <div className="space-y-1">
                          {group.items.map((suggestion, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 text-sm py-1"
                            >
                              <Badge variant="outline" className="text-xs">
                                {formatDate(suggestion.transfer_date)}
                              </Badge>
                              <span className="truncate max-w-[180px]">
                                {suggestion.scenario_title}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                #{suggestion.kit_number}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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
    </Dialog>
  )
}
