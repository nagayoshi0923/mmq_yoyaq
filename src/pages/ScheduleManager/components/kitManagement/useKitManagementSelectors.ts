/**
 * キット管理ダイアログの派生 selectors（useMemo / useCallback）
 *
 * データ層（useKitManagementData）と UI 状態を入力に、表示・計算用の派生値を導出する。
 * KitManagementDialog 本体から逐語抽出（Phase 5-1 第6b歩・挙動不変）。
 * 返却は全派生値（一部は内部依存のみで親は未使用だが、移管時点の構成を保つため全て返す）。
 */
import { useMemo, useCallback } from 'react'
import type { KitLocation, KitTransferEvent, KitTransferSuggestion, Store, StoreTravelTime, Scenario, KitCondition, KitTransferCompletion } from '@/types'
import { type KitState } from '@/utils/kitOptimizer'
import { planKitTransfers, findOverdueTransfers, type PlannerDemand, type OverdueTransfer } from '@/utils/kitTransferPlanner'
import { toJstYmd } from '@/utils/jstDate'
import type { KitScheduleEvent } from './useKitManagementData'

interface UseKitManagementSelectorsParams {
  scenarios: Scenario[]
  stores: Store[]
  kitLocations: KitLocation[]
  scheduleEvents: KitScheduleEvent[]
  transferEvents: KitTransferEvent[]
  completions: KitTransferCompletion[]
  storeTravelTimes: StoreTravelTime[]
  suggestions: KitTransferSuggestion[]
  transferDates: string[]
  weekDates: string[]
  scenarioSearch: string
}

export function useKitManagementSelectors({
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
}: UseKitManagementSelectorsParams) {
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
    const hasCommittedParticipants = (event: (typeof scheduleEvents)[number]) => {
      if (event.category === 'private' || event.is_private_request || event.is_private_booking) return true
      if (event.category === 'gmtest') return true
      return (event.current_participants || 0) > 0
    }

    return scheduleEvents
      .filter(e => {
        if (!e.scenario_master_id || e.is_cancelled) return false
        if (!(e.date >= planToday && e.date <= planHorizonEnd)) return false
        // キット管理対象は通常通り計算。キット未登録でも予約/貸切がある公演は手配対象として不足に出す。
        const sc = scenarioMap.get(e.scenario_master_id)
        return !!sc && ((sc.kit_count || 0) > 0 || hasCommittedParticipants(e))
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
    () => planKitTransfers(kitStateForPlan, plannerDemands, scenarios, stores, planToday, fixedKitKeys, storeTravelTimes, transferDates),
    [kitStateForPlan, plannerDemands, scenarios, stores, planToday, fixedKitKeys, storeTravelTimes, transferDates],
  )

  // 持ち越し（未実行の確定移動・責任追及）
  const overdueTransfers = useMemo<OverdueTransfer[]>(
    () => findOverdueTransfers(transferEvents, completions, planToday),
    [transferEvents, completions, planToday],
  )

  return {
    demandDates,
    matchesSearch,
    scenariosWithKits,
    scenariosWithoutKits,
    scenarioMap,
    storeMap,
    getStoreGroupId,
    isSameStoreGroup,
    getGroupDisplayName,
    storeInventory,
    kitShortages,
    groupedTransferEvents,
    getCompletionKeyFull,
    getCompletionKeyLoose,
    completionMapFull,
    completionMapLoose,
    isPickedUp,
    isDelivered,
    getCompletion,
    isPerformanceCancelled,
    mergedSuggestions,
    planToday,
    planHorizonEnd,
    kitStateForPlan,
    plannerDemands,
    fixedKitKeys,
    newPlan,
    overdueTransfers,
  }
}
