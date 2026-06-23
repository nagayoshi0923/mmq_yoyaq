import { Badge } from '@/components/ui/badge'
import { TabsContent } from '@/components/ui/tabs'
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react'
import type { KitLocation, Store, Scenario } from '@/types'

/**
 * キット管理ダイアログ「週間需要」タブ。
 * Tabs コンテキストは親の <Tabs> から伝播するため挙動は不変。
 */
type KitShortage = { date: string; store_id: string; scenario_master_id: string; needed: number; available: number }
type DemandEvent = {
  date: string
  store_id: string
  scenario_master_id: string
  category?: string
  is_cancelled?: boolean
  is_private_request?: boolean
  is_private_booking?: boolean
  current_participants?: number
  capacity?: number
}

const CATEGORY_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: 'オープン', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  private: { label: '貸切', className: 'border-purple-200 bg-purple-50 text-purple-700' },
  gmtest: { label: 'GMテスト', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  testplay: { label: 'テスト', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  offsite: { label: '出張', className: 'border-green-200 bg-green-50 text-green-700' },
  venue_rental: { label: '貸切', className: 'border-purple-200 bg-purple-50 text-purple-700' },
  venue_rental_free: { label: '貸切', className: 'border-purple-200 bg-purple-50 text-purple-700' },
  package: { label: 'パック', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  mtg: { label: 'MTG', className: 'border-slate-200 bg-slate-50 text-slate-700' },
}

const getCategoryBadge = (events: DemandEvent[]) => {
  const privateEvent = events.find(e => e.category === 'private' || e.is_private_request || e.is_private_booking)
  const category = privateEvent ? 'private' : events[0]?.category || 'open'
  return CATEGORY_BADGES[category] || { label: category, className: 'border-slate-200 bg-slate-50 text-slate-700' }
}

const hasCommittedParticipants = (events: DemandEvent[]) => {
  if (events.some(e => e.category === 'private' || e.is_private_request || e.is_private_booking)) return true
  return events.reduce((sum, e) => sum + (e.current_participants || 0), 0) > 0
}

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
  const shortageSummaries = kitShortages.map(shortage => {
    const matchingEvents = scheduleEvents.filter(e =>
      e.date === shortage.date &&
      e.store_id === shortage.store_id &&
      e.scenario_master_id === shortage.scenario_master_id &&
      !e.is_cancelled
    )

    return {
      shortage,
      isHighPriority: hasCommittedParticipants(matchingEvents),
    }
  })
  const highPriorityShortages = shortageSummaries.filter(s => s.isHighPriority)
  const lowPriorityShortages = shortageSummaries.filter(s => !s.isHighPriority)

  return (
          <TabsContent value="demand" className="flex-1 overflow-auto">
            <div className="space-y-4">
              {/* 手配チェック */}
              {kitShortages.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-amber-900 dark:text-amber-100 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    キット手配チェック
                    {highPriorityShortages.length > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                        移動必要 {highPriorityShortages.length}
                      </Badge>
                    )}
                    {lowPriorityShortages.length > 0 && (
                      <Badge variant="outline" className="h-5 px-1.5 text-xs border-amber-300 bg-white text-amber-700">
                        低優先 {lowPriorityShortages.length}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-sm">
                    {shortageSummaries.slice(0, 5).map(({ shortage, isHighPriority }, index) => {
                      const store = storeMap.get(shortage.store_id)
                      const scenario = scenarioMap.get(shortage.scenario_master_id)
                      return (
                        <div key={index} className="flex flex-wrap items-center gap-2 text-amber-800 dark:text-amber-200">
                          <span className="font-medium">{formatDate(shortage.date)}</span>
                          <span>{store?.short_name || store?.name}</span>
                          <span>-</span>
                          <span>{scenario?.title.slice(0, 15)}{(scenario?.title.length || 0) > 15 ? '...' : ''}</span>
                          <Badge
                            variant={isHighPriority ? 'destructive' : 'outline'}
                            className={isHighPriority ? 'h-5 px-1.5 text-xs' : 'h-5 px-1.5 text-xs border-amber-300 bg-white text-amber-700'}
                          >
                            {isHighPriority ? '移動必要' : '低優先'}
                          </Badge>
                          <span className="text-amber-700 dark:text-amber-200">
                            (必要: {shortage.needed}, 在庫: {shortage.available})
                          </span>
                        </div>
                      )
                    })}
                    {shortageSummaries.length > 5 && (
                      <p className="text-muted-foreground">他 {shortageSummaries.length - 5} 件</p>
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
                      const dayEvents = scheduleEvents.filter(e => e.date === date && !e.is_cancelled)
                      
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
                                      const matchingEvents = storeEvents.filter(e => e.scenario_master_id === sid && !e.is_cancelled)
                                      const count = matchingEvents.length
                                      const totalParticipants = matchingEvents.reduce((sum, e) => sum + (e.current_participants || 0), 0)
                                      const categoryBadge = getCategoryBadge(matchingEvents)
                                      
                                      // この店舗、または同じグループの店舗にあるキット数をチェック
                                      const kitsInSameGroup = kitLocations.filter(loc =>
                                        loc.scenario?.id === sid && isSameStoreGroup(loc.store_id, store.id)
                                      ).length
                                      const kitsAtExactStore = kitLocations.filter(loc =>
                                        loc.scenario?.id === sid && loc.store_id === store.id
                                      ).length
                                      
                                      // キット不足チェック
                                      const shortage = kitShortages.find(
                                        s => s.date === date && s.store_id === store.id && s.scenario_master_id === sid
                                      )
                                      const hasShortage = !!shortage
                                      const highPriority = hasCommittedParticipants(matchingEvents)
                                      const status = hasShortage
                                        ? highPriority
                                          ? {
                                              label: '移動必要',
                                              icon: AlertTriangle,
                                              className: 'border-red-200 bg-red-50 text-red-700',
                                              title: `キット不足 (在庫: ${shortage.available})`,
                                            }
                                          : {
                                              label: '低優先',
                                              icon: CircleDashed,
                                              className: 'border-amber-200 bg-amber-50 text-amber-700',
                                              title: `予約人数が少ないため低優先 (在庫: ${shortage.available})`,
                                            }
                                        : kitsAtExactStore > 0
                                          ? {
                                              label: '配置済み',
                                              icon: CheckCircle2,
                                              className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                              title: `この店舗に在庫あり (${kitsAtExactStore})`,
                                            }
                                          : {
                                              label: '同拠点OK',
                                              icon: CheckCircle2,
                                              className: 'border-slate-200 bg-slate-50 text-slate-600',
                                              title: `同じ拠点内に在庫あり (${kitsInSameGroup})`,
                                            }
                                      const StatusIcon = status.icon
                                      
                                      return (
                                        <div
                                          key={sid}
                                          className="min-w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm"
                                          title={`${scenario.title} × ${count} / ${status.title}`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <span className="line-clamp-2 font-medium text-slate-900">
                                              {scenario.title}
                                            </span>
                                            {count > 1 && (
                                              <span className="shrink-0 text-xs font-semibold text-slate-500">×{count}</span>
                                            )}
                                          </div>
                                          <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${categoryBadge.className}`}>
                                              {categoryBadge.label}
                                            </Badge>
                                            <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${status.className}`}>
                                              <StatusIcon className="mr-0.5 h-2.5 w-2.5" />
                                              {status.label}
                                            </Badge>
                                            {totalParticipants > 0 && (
                                              <span className="text-[10px] text-slate-500">
                                                {totalParticipants}/{matchingEvents[0]?.capacity || '-'}
                                              </span>
                                            )}
                                          </div>
                                        </div>
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
