/**
 * キット管理ダイアログのイベントハンドラ群
 *
 * データ層（useKitManagementData）・selectors・UI 状態を入力に、ユーザー操作の
 * ハンドラ（回収/設置トグル・週移動・移動計算・キット数/状態/固定・D&D・右クリック）を提供する。
 * KitManagementDialog 本体から逐語抽出（Phase 5-1 第6c歩・挙動不変）。
 * 自動計算 effect は handleCalculateTransfers と一体のため本フックに同梱。
 */
import { useEffect, useCallback } from 'react'
import { kitApi } from '@/lib/api/kitApi'
import { scenarioApi } from '@/lib/api'
import { showToast } from '@/utils/toast'
import { calculateKitTransfers, type KitState } from '@/utils/kitOptimizer'
import type { KitLocation, Store, Scenario, KitCondition, KitTransferCompletion, KitTransferSuggestion } from '@/types'
import { getCurrentOrganizationId } from '@/lib/organization'
import { supabase } from '@/lib/supabase'
import type { DraggedKit, ContextMenuState, DeliveryConfirmState } from './types'
import type { KitScheduleEvent } from './useKitManagementData'

interface UseKitManagementHandlersParams {
  isOpen: boolean
  loading: boolean
  kitLocations: KitLocation[]
  setKitLocations: React.Dispatch<React.SetStateAction<KitLocation[]>>
  scenarios: Scenario[]
  setScenarios: React.Dispatch<React.SetStateAction<Scenario[]>>
  setCompletions: React.Dispatch<React.SetStateAction<KitTransferCompletion[]>>
  currentStaffId: string | null
  scheduleEvents: KitScheduleEvent[]
  stores: Store[]
  fetchData: () => Promise<void>
  isPickedUp: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
  isDelivered: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
  storeMap: Map<string, Store>
  demandDates: string[]
  scenariosWithKits: Scenario[]
  selectedWeekStart: Date
  setSelectedWeekStart: React.Dispatch<React.SetStateAction<Date>>
  setStartDayOfWeek: React.Dispatch<React.SetStateAction<number>>
  weekDates: string[]
  transferDates: string[]
  setSuggestions: React.Dispatch<React.SetStateAction<KitTransferSuggestion[]>>
  setIsCalculating: React.Dispatch<React.SetStateAction<boolean>>
  deliveryConfirm: DeliveryConfirmState | null
  setDeliveryConfirm: React.Dispatch<React.SetStateAction<DeliveryConfirmState | null>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  draggedKit: DraggedKit | null
  setDraggedKit: React.Dispatch<React.SetStateAction<DraggedKit | null>>
  setDragOverStoreId: React.Dispatch<React.SetStateAction<string | null>>
}

export function useKitManagementHandlers({
  isOpen,
  loading,
  kitLocations,
  setKitLocations,
  scenarios,
  setScenarios,
  setCompletions,
  currentStaffId,
  scheduleEvents,
  stores,
  fetchData,
  isPickedUp,
  isDelivered,
  storeMap,
  demandDates,
  scenariosWithKits,
  selectedWeekStart,
  setSelectedWeekStart,
  setStartDayOfWeek,
  weekDates,
  transferDates,
  setSuggestions,
  setIsCalculating,
  deliveryConfirm,
  setDeliveryConfirm,
  setContextMenu,
  draggedKit,
  setDraggedKit,
  setDragOverStoreId,
}: UseKitManagementHandlersParams) {
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
    // setIsCalculating / setSuggestions は注入された安定 setter（挙動不変・exhaustive-deps 充足のため明記）
  }, [kitLocations, scheduleEvents, demandDates, scenarios, scenariosWithKits, stores, transferDates, setIsCalculating, setSuggestions])

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

  return {
    handleTogglePickup,
    handleToggleDelivery,
    handleConfirmDelivery,
    handleWeekChange,
    handleStartDayChange,
    handleUpdateStatus,
    handleSetKitLocation,
    handleChangeKitCount,
    handleToggleKitFixed,
    handleUpdateCondition,
    handleMoveKit,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
  }
}
