/**
 * キット移動最適化アルゴリズム
 * 
 * 週間の公演スケジュールに基づいて、最小限の移動でキットを配置する計画を生成
 */

import type { Scenario, Store, KitTransferSuggestion } from '@/types'

// キット状態: scenario_id -> { kit_number -> store_id }
export type KitState = Record<string, Record<number, string>>

// 需要: 日×店舗×シナリオの公演予定
interface Demand {
  date: string
  store_id: string
  scenario_id: string
}

/**
 * キット移動計画を計算
 * 
 * アルゴリズム:
 * 1. 日付順に需要をソート
 * 2. 各日の各店舗で必要なキットを確認
 * 3. 現在の配置で足りない場合、他店舗から移動を計画
 * 4. 移動は指定された曜日のみ（allowedTransferDays）
 * 5. 同じキットは1日に1箇所でしか使えない
 * 
 * @param allowedTransferDays - 移動可能な曜日（0=日曜, 1=月曜, ..., 6=土曜）
 */
export function calculateKitTransfers(
  initialState: KitState,
  demands: Demand[],
  scenarios: Scenario[],
  stores: Store[],
  allowedTransferDays: number[] = [1, 4] // デフォルト: 月・木
): KitTransferSuggestion[] {
  const suggestions: KitTransferSuggestion[] = []
  
  // シナリオとストアのマップ
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))
  const storeMap = new Map(stores.map(s => [s.id, s]))
  
  // 現在のキット状態をコピー（シミュレーション用）
  const state: KitState = JSON.parse(JSON.stringify(initialState))
  
  // 日付順にソート
  const sortedDemands = [...demands].sort((a, b) => a.date.localeCompare(b.date))
  
  // 日付ごとにグループ化
  const demandsByDate = new Map<string, Demand[]>()
  for (const demand of sortedDemands) {
    if (!demandsByDate.has(demand.date)) {
      demandsByDate.set(demand.date, [])
    }
    demandsByDate.get(demand.date)!.push(demand)
  }
  
  // 日付ごとに処理
  const sortedDates = [...demandsByDate.keys()].sort()
  
  for (const date of sortedDates) {
    const dayDemands = demandsByDate.get(date)!
    
    // その日の店舗ごとの需要を集計
    // store_id -> scenario_id -> count
    const storeNeeds = new Map<string, Map<string, number>>()
    
    for (const demand of dayDemands) {
      if (!storeNeeds.has(demand.store_id)) {
        storeNeeds.set(demand.store_id, new Map())
      }
      const scenarioNeeds = storeNeeds.get(demand.store_id)!
      scenarioNeeds.set(demand.scenario_id, (scenarioNeeds.get(demand.scenario_id) || 0) + 1)
    }
    
    // 各店舗の需要を満たすようにキットを配置
    for (const [storeId, scenarioNeeds] of storeNeeds) {
      for (const [scenarioId, needCount] of scenarioNeeds) {
        const scenario = scenarioMap.get(scenarioId)
        const store = storeMap.get(storeId)
        if (!scenario || !store) continue
        
        const kitCount = scenario.kit_count || 1
        const scenarioState = state[scenarioId] || {}
        
        // この店舗に既にあるキット数をカウント
        const kitsAtStore = Object.entries(scenarioState)
          .filter(([_, sid]) => sid === storeId)
          .map(([kn]) => parseInt(kn))
        
        const available = kitsAtStore.length
        const shortage = Math.max(0, needCount - available)
        
        if (shortage > 0) {
          // 他の店舗からキットを移動
          // どのキットを移動するか決定（その日に使われていないキット優先）
          const otherKits: Array<{ kitNumber: number; fromStoreId: string }> = []
          
          for (let kitNum = 1; kitNum <= kitCount; kitNum++) {
            const currentLocation = scenarioState[kitNum]
            if (currentLocation && currentLocation !== storeId) {
              // このキットがその日、移動元店舗で使われるか確認
              const fromStoreNeeds = storeNeeds.get(currentLocation)
              const fromStoreNeedCount = fromStoreNeeds?.get(scenarioId) || 0
              const kitsAlreadyAtFromStore = Object.entries(scenarioState)
                .filter(([_, sid]) => sid === currentLocation)
                .length
              
              // 移動元に余裕がある場合のみ移動可能
              if (kitsAlreadyAtFromStore > fromStoreNeedCount) {
                otherKits.push({ kitNumber: kitNum, fromStoreId: currentLocation })
              }
            }
          }
          
          // 未配置のキットも候補に（kit_countより少ない場合）
          for (let kitNum = 1; kitNum <= kitCount; kitNum++) {
            if (!scenarioState[kitNum]) {
              // 未配置キットは任意の店舗から移動可能（初期配置として）
              // ここでは最初のアクティブ店舗を仮の出発点とする
              const firstStore = stores.find(s => s.status === 'active')
              if (firstStore) {
                otherKits.push({ kitNumber: kitNum, fromStoreId: firstStore.id })
              }
            }
          }
          
          // 必要数だけ移動を計画
          for (let i = 0; i < shortage && i < otherKits.length; i++) {
            const { kitNumber, fromStoreId } = otherKits[i]
            const fromStore = storeMap.get(fromStoreId)
            
            // 移動日は公演日の直前の許可された曜日
            const transferDate = findNearestTransferDay(date, allowedTransferDays)
            
            suggestions.push({
              scenario_id: scenarioId,
              scenario_title: scenario.title,
              kit_number: kitNumber,
              from_store_id: fromStoreId,
              from_store_name: fromStore?.short_name || fromStore?.name || '不明',
              to_store_id: storeId,
              to_store_name: store.short_name || store.name,
              transfer_date: transferDate,
              reason: `${formatDateShort(date)}に${store.short_name || store.name}で公演予定`
            })
            
            // 状態を更新
            if (!state[scenarioId]) {
              state[scenarioId] = {}
            }
            state[scenarioId][kitNumber] = storeId
          }
        }
      }
    }
  }
  
  // 重複を除去（同じキットが複数回移動する場合は最終移動のみ）
  const uniqueSuggestions = deduplicateTransfers(suggestions)
  
  return uniqueSuggestions
}

/**
 * 前日の日付を取得
 */
function getPreviousDay(dateStr: string): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
}

/**
 * 指定日の直前の許可された移動曜日を取得
 * 
 * @param targetDateStr - 公演日（この日までにキットが必要）
 * @param allowedDays - 移動可能な曜日（0=日曜, 1=月曜, ..., 6=土曜）
 * @returns 最も近い許可された曜日の日付
 */
function findNearestTransferDay(targetDateStr: string, allowedDays: number[]): string {
  if (allowedDays.length === 0) {
    // 許可された曜日がない場合は前日を返す
    return getPreviousDay(targetDateStr)
  }
  
  const targetDate = new Date(targetDateStr)
  
  // 公演日の前日から遡って、許可された曜日を探す
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const checkDate = new Date(targetDate)
    checkDate.setDate(targetDate.getDate() - daysBack)
    const dayOfWeek = checkDate.getDay()
    
    if (allowedDays.includes(dayOfWeek)) {
      return checkDate.toISOString().split('T')[0]
    }
  }
  
  // 7日以内に見つからない場合（通常ありえない）、前日を返す
  return getPreviousDay(targetDateStr)
}

/**
 * 日付を短い形式でフォーマット
 */
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}/${day}`
}

/**
 * 重複する移動を除去（同じ日の同じキットは1回のみ）
 */
function deduplicateTransfers(suggestions: KitTransferSuggestion[]): KitTransferSuggestion[] {
  const seen = new Map<string, KitTransferSuggestion>()
  
  for (const suggestion of suggestions) {
    // 同じキットの同じ日の移動は後勝ち
    const key = `${suggestion.scenario_id}-${suggestion.kit_number}-${suggestion.transfer_date}`
    seen.set(key, suggestion)
  }
  
  return [...seen.values()]
}

/**
 * 週間の移動回数を最小化するための最適化
 * 
 * グリーディ法：各日の需要を順に満たしながら、
 * できるだけ移動を発生させないように配置を決定
 */
export function optimizeWeeklyTransfers(
  initialState: KitState,
  weeklyDemands: Demand[],
  scenarios: Scenario[],
  stores: Store[]
): { transfers: KitTransferSuggestion[]; finalState: KitState } {
  // 基本的な移動計画を生成
  const transfers = calculateKitTransfers(initialState, weeklyDemands, scenarios, stores)
  
  // 移動後の最終状態を計算
  const finalState: KitState = JSON.parse(JSON.stringify(initialState))
  
  for (const transfer of transfers) {
    if (!finalState[transfer.scenario_id]) {
      finalState[transfer.scenario_id] = {}
    }
    finalState[transfer.scenario_id][transfer.kit_number] = transfer.to_store_id
  }
  
  return { transfers, finalState }
}

/**
 * 移動計画の妥当性を検証
 * 
 * - 同じキットが同時に2箇所で使われていないか
 * - 需要をすべて満たせているか
 */
export function validateTransferPlan(
  initialState: KitState,
  transfers: KitTransferSuggestion[],
  demands: Demand[],
  scenarios: Scenario[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))
  
  // 日付順にソート
  const sortedDemands = [...demands].sort((a, b) => a.date.localeCompare(b.date))
  const transfersByDate = new Map<string, KitTransferSuggestion[]>()
  
  for (const transfer of transfers) {
    if (!transfersByDate.has(transfer.transfer_date)) {
      transfersByDate.set(transfer.transfer_date, [])
    }
    transfersByDate.get(transfer.transfer_date)!.push(transfer)
  }
  
  // 状態をシミュレート
  const state: KitState = JSON.parse(JSON.stringify(initialState))
  
  // 日付ごとに処理
  const allDates = new Set([
    ...sortedDemands.map(d => d.date),
    ...transfers.map(t => t.transfer_date)
  ])
  const sortedDates = [...allDates].sort()
  
  for (const date of sortedDates) {
    // この日の移動を適用
    const dayTransfers = transfersByDate.get(date) || []
    for (const transfer of dayTransfers) {
      if (!state[transfer.scenario_id]) {
        state[transfer.scenario_id] = {}
      }
      state[transfer.scenario_id][transfer.kit_number] = transfer.to_store_id
    }
    
    // この日の需要を検証
    const dayDemands = sortedDemands.filter(d => d.date === date)
    const storeNeeds = new Map<string, Map<string, number>>()
    
    for (const demand of dayDemands) {
      if (!storeNeeds.has(demand.store_id)) {
        storeNeeds.set(demand.store_id, new Map())
      }
      const scenarioNeeds = storeNeeds.get(demand.store_id)!
      scenarioNeeds.set(demand.scenario_id, (scenarioNeeds.get(demand.scenario_id) || 0) + 1)
    }
    
    for (const [storeId, scenarioNeeds] of storeNeeds) {
      for (const [scenarioId, needCount] of scenarioNeeds) {
        const scenarioState = state[scenarioId] || {}
        const available = Object.values(scenarioState).filter(sid => sid === storeId).length
        
        if (available < needCount) {
          const scenario = scenarioMap.get(scenarioId)
          errors.push(
            `${date}: ${scenario?.title || scenarioId} が店舗 ${storeId} で ${needCount - available} 個不足`
          )
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
