import { Badge } from '@/components/ui/badge'
import { TabsContent } from '@/components/ui/tabs'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { KitLocation, Store, Scenario } from '@/types'

/**
 * キット管理ダイアログ「週間需要」タブ。
 * KitManagementDialog から JSX を抽出（挙動不変）。派生値/state/フォーマッタは props 注入。
 * Tabs コンテキストは親の <Tabs> から伝播するため挙動は不変。
 */
type KitShortage = { date: string; store_id: string; scenario_master_id: string; needed: number; available: number }
type DemandEvent = { date: string; store_id: string; scenario_master_id: string; is_cancelled?: boolean; current_participants?: number; capacity?: number }

interface WeeklyDemandTabProps {
  kitShortages: KitShortage[]
  storeMap: Map<string, Store>
  scenarioMap: Map<string, Scenario>
  demandDates: string[]
  scheduleEvents: DemandEvent[]
  kitLocations: KitLocation[]
  stores: Store[]
  isSameStoreGroup: (storeId1: string, storeId2: string) => boolean
  formatDate: (dateStr: string) => string
}

export function WeeklyDemandTab({
  kitShortages,
  storeMap,
  scenarioMap,
  demandDates,
  scheduleEvents,
  kitLocations,
  stores,
  isSameStoreGroup,
  formatDate,
}: WeeklyDemandTabProps) {
  return (
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
                      const scenario = scenarioMap.get(shortage.scenario_master_id)
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
                            const scenarioIds = [...new Set(storeEvents.map(e => e.scenario_master_id))]
                            
                            return (
                              <td key={store.id} className="p-2 text-center">
                                {scenarioIds.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {scenarioIds.map(sid => {
                                      const scenario = scenarioMap.get(sid)
                                      if (!scenario) return null
                                      const count = storeEvents.filter(e => e.scenario_master_id === sid).length
                                      
                                      // この店舗（または同じグループの店舗）にあるキット数をチェック
                                      const kitsAtStore = kitLocations.filter(loc => 
                                        loc.scenario?.id === sid && isSameStoreGroup(loc.store_id, store.id)
                                      ).length
                                      
                                      // キット不足チェック
                                      const shortage = kitShortages.find(
                                        s => s.date === date && s.store_id === store.id && s.scenario_master_id === sid
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
  )
}
