import type React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X, Minus, Plus, Lock, LockOpen } from 'lucide-react'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import { logger } from '@/utils/logger'
import type { KitCondition, KitLocation, Store, Scenario } from '@/types'

/**
 * キット管理ダイアログ「現在の配置」タブ。
 * KitManagementDialog から JSX を抽出（挙動不変）。state/派生/ハンドラは props 注入。
 * Tabs コンテキストは親の <Tabs> から React context 経由で伝播するため挙動は不変。
 */
interface CurrentPlacementTabProps {
  scenarioSearch: string
  setScenarioSearch: Dispatch<SetStateAction<string>>
  scenariosWithKits: Scenario[]
  scenariosWithoutKits: Scenario[]
  kitLocations: KitLocation[]
  setKitLocations: Dispatch<SetStateAction<KitLocation[]>>
  stores: Store[]
  storeMap: Map<string, Store>
  handleChangeKitCount: (scenarioId: string, newCount: number) => Promise<void>
  handleSetKitLocation: (scenarioId: string, kitNumber: number, storeId: string) => Promise<void>
  handleUpdateCondition: (scenarioId: string, kitNumber: number, condition: KitCondition, conditionNotes?: string | null) => Promise<void>
  handleContextMenu: (e: React.MouseEvent, scenarioId: string, kitNumber: number, storeId: string, condition: KitCondition) => void
  handleToggleKitFixed: (scenarioId: string, kitNumber: number, isFixed: boolean) => Promise<void>
}

export function CurrentPlacementTab({
  scenarioSearch,
  setScenarioSearch,
  scenariosWithKits,
  scenariosWithoutKits,
  kitLocations,
  setKitLocations,
  stores,
  storeMap,
  handleChangeKitCount,
  handleSetKitLocation,
  handleUpdateCondition,
  handleContextMenu,
  handleToggleKitFixed,
}: CurrentPlacementTabProps) {
  return (
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
                      logger.log(`🔍 シナリオ[${scenario.title}]`, {
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
                                onContextMenu={(e) => { if (location) handleContextMenu(e, orgScenarioId || scenario.id, kitNum, location.store_id, condition as KitCondition) }}
                                title="右クリックで固定/解除・状態変更・移動"
                                className={`rounded p-2 border ${
                                  location?.is_fixed
                                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                                    : condition !== 'good'
                                      ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/10'
                                      : 'border-transparent bg-muted/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-sm font-medium">
                                    #{kitNum}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => location && handleToggleKitFixed(orgScenarioId || scenario.id, kitNum, !location.is_fixed)}
                                    disabled={!location}
                                    title={location?.is_fixed ? '固定中（移動計画で動かさない）。クリックで解除' : '固定する（移動計画で動かさない）'}
                                    className={`h-5 w-5 flex items-center justify-center rounded shrink-0 transition-colors disabled:opacity-30 ${location?.is_fixed ? 'text-orange-500 hover:text-orange-700' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                                  >
                                    {location?.is_fixed
                                      ? <Lock className="h-3.5 w-3.5" />
                                      : <LockOpen className="h-3.5 w-3.5" />}
                                  </button>
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
  )
}
