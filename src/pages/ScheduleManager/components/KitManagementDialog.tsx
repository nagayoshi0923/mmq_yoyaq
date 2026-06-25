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
import { scenarioApi } from '@/lib/api'
import { showToast } from '@/utils/toast'
import { calculateKitTransfers, type KitState } from '@/utils/kitOptimizer'
import type { KitLocation, KitTransferSuggestion, KitCondition } from '@/types'
import { getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuLabel } from '@/components/ui/context-menu'
import { Package, ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw, Plus, Minus, Search, GripVertical, HelpCircle, Lock, LockOpen } from 'lucide-react'
import { formatJstMonthDay } from '@/utils/jstDate'
import type { DraggedKit, ContextMenuState, KitManagementDialogProps } from './kitManagement/types'
import { WEEKDAYS, formatCompletionDate } from './kitManagement/helpers'
import { useKitManagementData } from './kitManagement/useKitManagementData'
import { useKitManagementSelectors } from './kitManagement/useKitManagementSelectors'
import { CurrentPlacementTab } from './kitManagement/tabs/CurrentPlacementTab'
import { StoreInventoryTab } from './kitManagement/tabs/StoreInventoryTab'
import { WeeklyDemandTab } from './kitManagement/tabs/WeeklyDemandTab'
import { TransferPlanTab } from './kitManagement/tabs/TransferPlanTab'

export function KitManagementDialog({ isOpen, onClose }: KitManagementDialogProps) {
  // UI状態
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

  // データ層（取得・保持・リアルタイム同期）。設定 state は当ファイル所有のため setter/ref を注入
  const {
    kitLocations,
    setKitLocations,
    transferEvents,
    stores,
    storeTravelTimes,
    scenarios,
    setScenarios,
    scheduleEvents,
    completions,
    setCompletions,
    currentStaffId,
    currentStaffName,
    loading,
    fetchData,
  } = useKitManagementData({
    isOpen,
    weekDates,
    selectedOffsetsRef,
    setSelectedOffsets,
    setTransferStartStoreIds,
  })

  // 過去の週かどうかを判定（今日より前の週末なら過去）
  const isPastWeek = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(selectedWeekStart)
    weekEnd.setDate(selectedWeekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    return weekEnd < today
  }, [selectedWeekStart])
  
  // 週または記憶した曜日オフセットが変わったら移動日を再構成
  useEffect(() => {
    if (weekDates.length > 0) {
      const dates = selectedOffsets
        .filter(i => i >= 0 && i < weekDates.length)
        .map(i => weekDates[i])
        .filter((d): d is string => Boolean(d))
      setTransferDates(dates)
    }
  }, [weekDates, selectedOffsets])
  
  // 派生 selectors（データ＋UI状態から導出）。Phase 5-1 第6b歩で useKitManagementSelectors へ分離
  const {
    demandDates,
    scenariosWithKits,
    scenariosWithoutKits,
    scenarioMap,
    storeMap,
    getStoreGroupId,
    isSameStoreGroup,
    storeInventory,
    kitShortages,
    groupedTransferEvents,
    isPickedUp,
    isDelivered,
    getCompletion,
    isPerformanceCancelled,
    mergedSuggestions,
    planToday,
    planHorizonEnd,
    newPlan,
    overdueTransfers,
  } = useKitManagementSelectors({
    scenarios,
    stores,
    kitLocations,
    scheduleEvents,
    transferEvents,
    completions,
    storeTravelTimes,
    suggestions,
    transferDates,
    weekDates,
    scenarioSearch,
  })

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
            mergedSuggestions={mergedSuggestions}
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
