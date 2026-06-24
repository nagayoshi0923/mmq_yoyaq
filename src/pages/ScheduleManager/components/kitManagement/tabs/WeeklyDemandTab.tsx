import { TabsContent } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

const hasCommittedParticipants = (events: DemandEvent[]) => {
  if (events.some(e => e.category === 'private' || e.is_private_request || e.is_private_booking)) return true
  if (events.some(e => e.category === 'gmtest')) return true
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
              <p className="text-sm text-muted-foreground">
                選択した週の各日・各店舗で必要なキットを表示します
              </p>

              {/* 日別×店舗別の需要表示 */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="w-[72px] min-w-[72px] p-1.5 text-left font-medium">日付</th>
                      {stores.filter(s => s.status === 'active').map(store => (
                        <th key={store.id} className="min-w-[96px] max-w-[112px] p-1.5 text-center font-medium leading-tight">
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
                          <td className="w-[72px] min-w-[72px] p-1.5 text-xs font-medium whitespace-nowrap">{formatDate(date)}</td>
                          {stores.filter(s => s.status === 'active').map(store => {
                            const storeEvents = dayEvents.filter(e => e.store_id === store.id)
                            const scenarioIds = [...new Set(storeEvents.map(e => e.scenario_master_id))]
                            
                            return (
                              <td key={store.id} className="p-1.5 text-center align-top">
                                {scenarioIds.length > 0 ? (
                                  <div className="flex flex-col gap-0.5">
                                    {scenarioIds.map(sid => {
                                      const scenario = scenarioMap.get(sid)
                                      if (!scenario) return null
                                      const matchingEvents = storeEvents.filter(e => e.scenario_master_id === sid && !e.is_cancelled)
                                      const count = matchingEvents.length
                                      const totalParticipants = matchingEvents.reduce((sum, e) => sum + (e.current_participants || 0), 0)
                                      
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
                                              label: '要移動',
                                              icon: AlertTriangle,
                                              itemClassName: 'border-red-200 bg-white text-slate-900',
                                              markerClassName: 'bg-red-500',
                                              iconClassName: 'text-red-600',
                                              metaClassName: 'text-red-700',
                                              title: `キット不足 (在庫: ${shortage.available})`,
                                            }
                                          : {
                                              label: '低',
                                              icon: CircleDashed,
                                              itemClassName: 'border-amber-200 bg-white text-slate-900',
                                              markerClassName: 'bg-amber-400',
                                              iconClassName: 'text-amber-600',
                                              metaClassName: 'text-amber-700',
                                              title: `予約人数が少ないため低優先 (在庫: ${shortage.available})`,
                                            }
                                        : kitsAtExactStore > 0
                                          ? {
                                              label: '済',
                                              icon: CheckCircle2,
                                              itemClassName: 'border-slate-200 bg-slate-50 text-slate-900',
                                              markerClassName: 'bg-emerald-400',
                                              iconClassName: 'text-emerald-600',
                                              metaClassName: 'text-slate-500',
                                              title: `この店舗に在庫あり (${kitsAtExactStore})`,
                                            }
                                          : {
                                              label: '同',
                                              icon: CheckCircle2,
                                              itemClassName: 'border-slate-200 bg-white text-slate-900',
                                              markerClassName: 'bg-slate-300',
                                              iconClassName: 'text-slate-500',
                                              metaClassName: 'text-slate-500',
                                              title: `同じ拠点内に在庫あり (${kitsInSameGroup})`,
                                            }
                                      const StatusIcon = status.icon
                                      
                                      return (
                                        <Popover key={sid}>
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              className={`flex h-6 min-w-[92px] max-w-[112px] items-center gap-1 rounded-sm border px-1 text-left ${status.itemClassName}`}
                                              title={`${scenario.title} × ${count} / ${status.title}`}
                                            >
                                              <span className={`h-4 w-0.5 shrink-0 rounded-full ${status.markerClassName}`} />
                                              <StatusIcon className={`h-2.5 w-2.5 shrink-0 ${status.iconClassName}`} />
                                              <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-none">
                                                {scenario.title}
                                              </span>
                                              {count > 1 && (
                                                <span className="shrink-0 text-[9px] font-semibold leading-none text-slate-500">×{count}</span>
                                              )}
                                              <span className={`shrink-0 text-[9px] font-medium leading-none ${status.metaClassName}`}>
                                                {status.label}
                                              </span>
                                              {totalParticipants > 0 && (
                                                <span className="shrink-0 text-[9px] leading-none text-slate-500">
                                                  {totalParticipants}/{matchingEvents[0]?.capacity || '-'}
                                                </span>
                                              )}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-64 p-3 text-left" align="start">
                                            <div className="space-y-2">
                                              <div className="text-sm font-semibold leading-snug">{scenario.title}</div>
                                              <div className="space-y-1 text-xs text-muted-foreground">
                                                <div>{formatDate(date)} / {store.short_name || store.name}</div>
                                                <div>{status.title}</div>
                                                <div>公演数: {count}</div>
                                                {totalParticipants > 0 && (
                                                  <div>予約: {totalParticipants}/{matchingEvents[0]?.capacity || '-'}</div>
                                                )}
                                              </div>
                                            </div>
                                          </PopoverContent>
                                        </Popover>
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
