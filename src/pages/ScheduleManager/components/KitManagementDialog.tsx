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
import type { KitLocation, KitTransferEvent, KitTransferSuggestion, Store, Scenario } from '@/types'
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw } from 'lucide-react'

interface KitManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}

// 曜日の選択肢
const WEEKDAYS = [
  { value: 0, label: '日曜日' },
  { value: 1, label: '月曜日' },
  { value: 2, label: '火曜日' },
  { value: 3, label: '水曜日' },
  { value: 4, label: '木曜日' },
  { value: 5, label: '金曜日' },
  { value: 6, label: '土曜日' },
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

  // キット数があるシナリオのみフィルタ
  const scenariosWithKits = useMemo(() => {
    return scenarios.filter(s => s.kit_count && s.kit_count > 0)
  }, [scenarios])

  // シナリオIDからシナリオ情報を取得
  const scenarioMap = useMemo(() => {
    return new Map(scenarios.map(s => [s.id, s]))
  }, [scenarios])

  // 店舗IDから店舗情報を取得
  const storeMap = useMemo(() => {
    return new Map(stores.map(s => [s.id, s]))
  }, [stores])

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
        stores
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
  }, [kitLocations, scheduleEvents, weekDates, scenariosWithKits, stores])

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="current">現在の配置</TabsTrigger>
            <TabsTrigger value="demand">週間需要</TabsTrigger>
            <TabsTrigger value="transfers">移動計画</TabsTrigger>
          </TabsList>

          {/* 現在の配置 */}
          <TabsContent value="current" className="flex-1 overflow-auto">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                各シナリオのキットが現在どの店舗にあるかを表示・編集します
              </p>
              
              {scenariosWithKits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  キット数が設定されているシナリオがありません。
                  <br />
                  シナリオ管理画面でkit_countを設定してください。
                </div>
              ) : (
                <div className="grid gap-3">
                  {scenariosWithKits.map(scenario => {
                    const kitCount = scenario.kit_count || 1
                    const locations = kitLocations.filter(l => l.scenario_id === scenario.id)
                    
                    return (
                      <div key={scenario.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{scenario.title}</div>
                          <Badge variant="outline">
                            {kitCount}キット
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {Array.from({ length: kitCount }, (_, i) => {
                            const kitNum = i + 1
                            const location = locations.find(l => l.kit_number === kitNum)
                            const currentStore = location ? storeMap.get(location.store_id) : null
                            
                            return (
                              <div key={kitNum} className="flex items-center gap-2 bg-muted/50 rounded p-2">
                                <span className="text-sm font-medium w-16">
                                  キット{kitNum}:
                                </span>
                                <Select
                                  value={location?.store_id || ''}
                                  onValueChange={(value) => handleSetKitLocation(scenario.id, kitNum, value)}
                                >
                                  <SelectTrigger className="flex-1 h-8">
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
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* 週間需要 */}
          <TabsContent value="demand" className="flex-1 overflow-auto">
            <div className="space-y-4">
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
                                      return (
                                        <Badge
                                          key={sid}
                                          variant="secondary"
                                          className="text-[10px] truncate max-w-[70px]"
                                          title={`${scenario.title} × ${count}`}
                                        >
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  週間スケジュールに基づいて最適な移動計画を提案します
                </p>
                <Button
                  onClick={handleCalculateTransfers}
                  disabled={isCalculating}
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
                  
                  <div className="space-y-2">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded p-2 text-sm"
                      >
                        <Badge variant="outline">{formatDate(suggestion.transfer_date)}</Badge>
                        <span className="font-medium truncate max-w-[150px]">
                          {suggestion.scenario_title}
                        </span>
                        <span className="text-muted-foreground">キット{suggestion.kit_number}</span>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{suggestion.from_store_name}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="font-medium">{suggestion.to_store_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {suggestion.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 確定済み移動イベント */}
              <div>
                <h3 className="font-medium mb-2">確定済み移動</h3>
                {transferEvents.filter(e => e.status !== 'cancelled').length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    この週に予定されている移動はありません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {transferEvents
                      .filter(e => e.status !== 'cancelled')
                      .map(event => {
                        const scenario = scenarioMap.get(event.scenario_id)
                        const fromStore = storeMap.get(event.from_store_id)
                        const toStore = storeMap.get(event.to_store_id)
                        
                        return (
                          <div
                            key={event.id}
                            className={`flex items-center gap-2 border rounded p-2 text-sm ${
                              event.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20' : ''
                            }`}
                          >
                            <Badge variant={event.status === 'completed' ? 'default' : 'outline'}>
                              {formatDate(event.transfer_date)}
                            </Badge>
                            <span className="font-medium truncate max-w-[150px]">
                              {scenario?.title || '不明なシナリオ'}
                            </span>
                            <span className="text-muted-foreground">キット{event.kit_number}</span>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{fromStore?.short_name || fromStore?.name || '?'}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span className="font-medium">
                                {toStore?.short_name || toStore?.name || '?'}
                              </span>
                            </div>
                            
                            {event.status === 'pending' && (
                              <div className="flex gap-1 ml-auto">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => handleUpdateStatus(event.id, 'completed')}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-destructive"
                                  onClick={() => handleUpdateStatus(event.id, 'cancelled')}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                            
                            {event.status === 'completed' && (
                              <Badge variant="default" className="ml-auto">
                                完了
                              </Badge>
                            )}
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
