import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRight, Calendar, MapPin, Check, X, AlertTriangle, RefreshCw } from 'lucide-react'
import type { KitLocation, Store, StoreTravelTime, Scenario, KitTransferSuggestion, KitTransferEvent, KitTransferCompletion } from '@/types'
import { WEEKDAYS, formatCompletionDate } from '../helpers'
import { buildTransferPlanViewModel, formatDateStr, parseLocalDate } from '../transferPlanViewModel'
import type { KitShortageItem, OverdueTransfer } from '@/utils/kitTransferPlanner'

/**
 * キット管理ダイアログ「移動計画(transfers)」タブ。最大のタブのため、まずは JSX を
 * そのまま（byte 一致で）子へ移動し、state/派生/ハンドラは props 注入する（挙動不変）。
 * 内部の小コンポーネント/純関数分割は後続コミットで行う。
 * Tabs コンテキストは親の <Tabs> から伝播するため挙動は不変。
 */
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
type TransferEventGroup = { from_store_id: string; from_store_name: string; to_store_id: string; to_store_name: string; isGrouped: boolean; items: KitTransferEvent[] }

const CATEGORY_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: 'オープン', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  private: { label: '貸切', className: 'border-purple-200 bg-purple-50 text-purple-700' },
  gmtest: { label: 'GMテスト', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  testplay: { label: 'テスト', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  offsite: { label: '出張', className: 'border-green-200 bg-green-50 text-green-700' },
  venue_rental: { label: '場所貸し', className: 'border-pink-200 bg-pink-50 text-pink-700' },
  venue_rental_free: { label: '場所貸し', className: 'border-pink-200 bg-pink-50 text-pink-700' },
  package: { label: 'パッケージ', className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  mtg: { label: 'MTG', className: 'border-gray-200 bg-gray-50 text-gray-700' },
}

function getCategoryBadge(event?: DemandEvent): { label: string; className: string } {
  if (!event) return CATEGORY_BADGES.open
  if (event.category === 'private' || event.is_private_request || event.is_private_booking) {
    return CATEGORY_BADGES.private
  }
  return CATEGORY_BADGES[event.category || 'open'] || {
    label: event.category || 'オープン',
    className: 'border-gray-200 bg-gray-50 text-gray-700',
  }
}

interface TransferPlanTabProps {
  // 新ロジック（再設計版）: 緊急ボード用
  plannedTransfers: KitTransferSuggestion[]
  newShortages: KitShortageItem[]      // 手遅れ等・解消できない不足
  overdueTransfers: OverdueTransfer[]  // 持ち越し（未実行の確定移動）
  planStartDate: string
  planEndDate: string
  // 移動日設定
  transferDates: string[]
  setTransferDates: Dispatch<SetStateAction<string[]>>
  setSelectedOffsets: Dispatch<SetStateAction<number[]>>
  saveOffsets: (offsets: number[]) => Promise<void>
  transferStartStoreIds: Record<string, string>
  setTransferStartStoreIds: Dispatch<SetStateAction<Record<string, string>>>
  saveTransferStartStoreIds: (startStoreIds: Record<string, string>) => Promise<void>
  weekDates: string[]
  demandDates: string[]
  // 計算・提案データ
  isCalculating: boolean
  mergedSuggestions: KitTransferSuggestion[]
  groupedTransferEvents: TransferEventGroup[]
  scheduleEvents: DemandEvent[]
  kitLocations: KitLocation[]
  storeTravelTimes: StoreTravelTime[]
  scenarioMap: Map<string, Scenario>
  storeMap: Map<string, Store>
  // ヘルパー / セレクタ
  getStoreGroupId: (storeId: string) => string
  getCompletion: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => KitTransferCompletion | undefined
  isPickedUp: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
  isDelivered: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string) => boolean
  isPerformanceCancelled: (scenarioId: string, performanceDate: string, storeId: string) => boolean
  formatDate: (dateStr: string) => string
  // ハンドラ
  handleTogglePickup: (scenarioId: string, kitNumber: number, performanceDate: string, fromStoreId: string, toStoreId: string, orgScenarioId?: string) => Promise<void>
  handleToggleDelivery: (scenarioId: string, kitNumber: number, performanceDate: string, toStoreId: string, scenarioTitle?: string, orgScenarioId?: string) => void
  handleUpdateStatus: (eventId: string, status: 'completed' | 'cancelled') => Promise<void>
}

export function TransferPlanTab({
  plannedTransfers,
  newShortages,
  overdueTransfers,
  planStartDate,
  planEndDate,
  transferDates,
  setTransferDates,
  setSelectedOffsets,
  saveOffsets,
  transferStartStoreIds,
  setTransferStartStoreIds,
  saveTransferStartStoreIds,
  weekDates,
  demandDates,
  isCalculating,
  mergedSuggestions,
  groupedTransferEvents,
  scheduleEvents,
  kitLocations,
  storeTravelTimes,
  scenarioMap,
  storeMap,
  getStoreGroupId,
  getCompletion,
  isPickedUp,
  isDelivered,
  isPerformanceCancelled,
  formatDate,
  handleTogglePickup,
  handleToggleDelivery,
  handleUpdateStatus,
}: TransferPlanTabProps) {
  const transferPlanView = buildTransferPlanViewModel({
    plannedTransfers,
    mergedSuggestions,
    transferDates,
    kitLocations,
    scheduleEvents,
    demandDates,
    storeTravelTimes,
    storeMap,
    transferStartStoreIds,
    getStoreGroupId,
    isPickedUp,
    isDelivered,
  })
  const displaySuggestions = transferPlanView.displaySuggestions

  return (
          <TabsContent value="transfers" className="flex-1 overflow-auto">
            <div className="flex flex-col gap-4">
              {/* 🔴 緊急ボード（再設計版・今日起点）: 手遅れ＋持ち越し */}
              {(newShortages.length > 0 || overdueTransfers.length > 0) && (
                <div className="order-2 border-2 border-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 space-y-3">
                  <div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 font-bold text-red-800 dark:text-red-200">
                        <AlertTriangle className="h-4 w-4" />
                        🔴 緊急ボード（今すぐ判断が必要）
                      </div>
                      <Badge variant="outline" className="w-fit border-red-300 bg-white/70 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                        対象: {formatDate(planStartDate)}〜{formatDate(planEndDate)}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-red-600/80 dark:text-red-300/80 mt-0.5">
                      システムが自動で最適な移動を組んでも解決できない分です（移動計画では消えません）
                    </div>
                  </div>

                  {/* ① 間に合わない（時間切れ） */}
                  {newShortages.some(s => s.reason === 'too_late') && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                        🔴 間に合わない（公演が近すぎて前日までに運べない）: {newShortages.filter(s => s.reason === 'too_late').length}件
                      </div>
                      {newShortages.filter(s => s.reason === 'too_late').map((s, i) => {
                        const sc = scenarioMap.get(s.scenario_master_id)
                        const st = storeMap.get(s.store_id)
                        return (
                          <div key={`late-${i}`} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 flex-wrap">
                            <span className="font-medium">{formatDate(s.date)}</span>
                            <span>{st?.short_name || st?.name || s.store_id}</span>
                            <span>-</span>
                            <span>{sc?.title || s.scenario_master_id}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ② 固定店にあり移動不可（固定解除で使える） */}
                  {newShortages.some(s => s.reason === 'locked_fixed') && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                        🟠 固定店にあり・移動不可（その店の「固定」を解除すれば使えます）: {newShortages.filter(s => s.reason === 'locked_fixed').length}件
                      </div>
                      {newShortages.filter(s => s.reason === 'locked_fixed').map((s, i) => {
                        const sc = scenarioMap.get(s.scenario_master_id)
                        const st = storeMap.get(s.store_id)
                        const lockedNames = (s.lockedStoreIds || [])
                          .map(id => storeMap.get(id)?.short_name || storeMap.get(id)?.name || id)
                          .join('・')
                        return (
                          <div key={`lock-${i}`} className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 flex-wrap">
                            <span className="font-medium">{formatDate(s.date)}</span>
                            <span>{st?.short_name || st?.name || s.store_id}</span>
                            <span>-</span>
                            <span>{sc?.title || s.scenario_master_id}</span>
                            {lockedNames && <span className="text-orange-500">（{lockedNames} に在庫あり・固定中）</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ③ キット不足（移動しても足りない/出せない） */}
                  {newShortages.some(s => s.reason === 'no_capacity') && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                        🟠 キット不足（移動しても台数が足りない・出せるキットが無い）: {newShortages.filter(s => s.reason === 'no_capacity').length}件
                      </div>
                      {newShortages.filter(s => s.reason === 'no_capacity').map((s, i) => {
                        const sc = scenarioMap.get(s.scenario_master_id)
                        const st = storeMap.get(s.store_id)
                        return (
                          <div key={`cap-${i}`} className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 flex-wrap">
                            <span className="font-medium">{formatDate(s.date)}</span>
                            <span>{st?.short_name || st?.name || s.store_id}</span>
                            <span>-</span>
                            <span>{sc?.title || s.scenario_master_id}</span>
                            <span className="text-orange-500">（不足 {s.needed - s.available}／必要 {s.needed}・在庫 {s.available}）</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {overdueTransfers.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-300">
                        未実行の確定移動（持ち越し・要追跡）: {overdueTransfers.length}件
                      </div>
                      {overdueTransfers.map((o, i) => {
                        const ev = o.event
                        const sc = scenarioMap.get(ev.scenario_master_id)
                        const from = storeMap.get(ev.from_store_id)
                        const to = storeMap.get(ev.to_store_id)
                        return (
                          <div key={`ovd-${i}`} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 flex-wrap">
                            <span className="font-medium">{formatDate(ev.transfer_date)} 予定</span>
                            <span className="text-red-600 font-semibold">{o.daysOverdue}日超過</span>
                            <span>{sc?.title || ev.scenario_master_id} #{ev.kit_number}</span>
                            <span>{from?.short_name || from?.name || ev.from_store_id}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span>{to?.short_name || to?.name || ev.to_store_id}</span>
                            <span className="text-[10px] px-1 rounded bg-red-100 dark:bg-red-800">
                              {o.state === 'picked_up_only' ? '回収済み・未設置' : '未着手'}
                            </span>
                            {ev.created_by && (
                              <span className="text-[10px] text-muted-foreground">確定者ID: {ev.created_by.slice(0, 8)}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 移動日設定 */}
              <div className="order-1 flex items-center gap-4 p-3 bg-muted/50 rounded-lg flex-wrap">
                <span className="text-sm font-medium whitespace-nowrap">移動日:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {weekDates.map(dateStr => {
                    const [year, month, day] = dateStr.split('-').map(Number)
                    const date = new Date(year, month - 1, day)
                    const dayOfWeek = date.getDay()
                    const dayLabel = WEEKDAYS.find(d => d.value === dayOfWeek)?.short || ''
                    const isSelected = transferDates.includes(dateStr)
                    
                    return (
                      <button
                        key={dateStr}
                        onClick={() => {
                          const offset = weekDates.indexOf(dateStr)
                          if (isSelected) {
                            setTransferDates(prev => prev.filter(d => d !== dateStr))
                            setSelectedOffsets(prev => {
                              const next = prev.filter(i => i !== offset)
                              saveOffsets(next)
                              return next
                            })
                          } else {
                            setTransferDates(prev => [...prev, dateStr].sort())
                            setSelectedOffsets(prev => {
                              const next = [...new Set([...prev, offset])].sort((a, b) => a - b)
                              saveOffsets(next)
                              return next
                            })
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          isSelected 
                            ? 'bg-primary text-primary-foreground border-primary' 
                            : 'bg-background border-muted-foreground/30 hover:border-primary/50'
                        }`}
                      >
                        {month}/{day}({dayLabel})
                      </button>
                    )
                  })}
                </div>
                <span className="text-xs text-muted-foreground ml-auto">
                  {transferDates.length === 0 
                    ? '移動日を選択してください' 
                    : `${transferDates.length}日の移動`}
                </span>
              </div>

              {isCalculating && (
                <p className="order-3 text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  計算中...
                </p>
              )}

              {/* 移動提案 */}
              {displaySuggestions.length > 0 && (
                <div className="order-4 border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 font-medium text-yellow-800 dark:text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm sm:text-base">移動提案 ({transferPlanView.visibleSuggestions.length}件)</span>
                      {(() => {
                        const deliveredCount = transferPlanView.statusCounts.delivered
                        const pickedUpCount = transferPlanView.statusCounts.pickedUp
                        const remainingCount = transferPlanView.statusCounts.remaining
                        return (
                          <>
                            {deliveredCount > 0 && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                                {deliveredCount}件完了
                              </Badge>
                            )}
                            {pickedUpCount > 0 && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                {pickedUpCount}件移動中
                              </Badge>
                            )}
                            {remainingCount > 0 && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                残り{remainingCount}件
                              </Badge>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  
                  {/* 移動日別 → 出発店舗別にまとめて表示 */}
                  <div className="space-y-4">
                    {(() => {
                      const {
                        sortedTransferDateStrs,
                        sortedDays,
                        missedPerformances,
                      } = transferPlanView
                      const todayStr = formatDateStr(new Date())
                      const isTransferDatePast = (transferDateStr: string): boolean => {
                        return transferDateStr < todayStr
                      }
                      
                      // 間に合わない公演の警告表示
                      const missedWarning = missedPerformances.length > 0 ? (
                        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-orange-800 dark:text-orange-200 text-sm">
                                以下の公演は選択した移動日では間に合いません
                              </p>
                              <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                                前週の移動で対応するか、移動日を追加してください
                              </p>
                              <ul className="mt-2 space-y-1">
                                {missedPerformances.slice(0, 5).map((item, idx) => {
                                  const perfDate = parseLocalDate(item.performance_date)
                                  const dayShort = WEEKDAYS.find(w => w.value === perfDate.getDay())?.short || '?'
                                  return (
                                    <li key={idx} className="text-xs text-orange-700 dark:text-orange-300">
                                      {perfDate.getMonth() + 1}/{perfDate.getDate()}({dayShort}) - {item.to_store_name}: {item.scenario_title}
                                    </li>
                                  )
                                })}
                                {missedPerformances.length > 5 && (
                                  <li className="text-xs text-orange-600">...他{missedPerformances.length - 5}件</li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : null
                      
                      if (sortedDays.length === 0) {
                        return (
                          <>
                            {missedWarning}
                            <div className="text-center py-4 text-muted-foreground">
                              選択した移動日に該当する提案はありません
                            </div>
                          </>
                        )
                      }
                      
                      return (
                        <>
                          {missedWarning}
                          {sortedDays.map(({ dateStr, groups, routeStops, startStoreOptions, selectedStartValue }) => {
                        const transferDate = parseLocalDate(dateStr)
                        const transferDayOfWeek = transferDate.getDay()
                        const dayShort = WEEKDAYS.find(w => w.value === transferDayOfWeek)?.short || '?'
                        const dayKitCount = groups.reduce((sum, g) => sum + g.items.length, 0)
                        const transferDateLabel = `${transferDate.getMonth() + 1}/${transferDate.getDate()}(${dayShort})`
                        
                        // この移動日がカバーする公演期間を計算
                        // 移動日の翌日 ～ 次の移動日まで（最後の移動日は需要期間の終わりまで）
                        const currentIdx = sortedTransferDateStrs.indexOf(dateStr)
                        const isLastTransferDate = currentIdx === sortedTransferDateStrs.length - 1
                        
                        // 公演開始日 = 移動日の翌日
                        const perfStartDate = new Date(transferDate)
                        perfStartDate.setDate(perfStartDate.getDate() + 1)
                        
                        // 公演終了日 = 次の移動日、または最後なら需要期間の終わり
                        let perfEndDate: Date
                        if (isLastTransferDate) {
                          // 需要期間の最後の日（demandDatesの最大値）
                          const lastDemandDate = demandDates.length > 0 
                            ? demandDates.reduce((max, d) => d > max ? d : max, demandDates[0])
                            : dateStr
                          perfEndDate = parseLocalDate(lastDemandDate)
                        } else {
                          const nextTransferDateStr = sortedTransferDateStrs[currentIdx + 1]
                          perfEndDate = parseLocalDate(nextTransferDateStr)
                        }
                        
                        const perfStartLabel = `${perfStartDate.getMonth() + 1}/${perfStartDate.getDate()}`
                        const perfEndLabel = `${perfEndDate.getMonth() + 1}/${perfEndDate.getDate()}`
                        const perfPeriodLabel = `${perfStartLabel}~${perfEndLabel}公演分`
                        
                        // この移動日が過去かどうか（表示のみに使用、チェックは可能）
                        const isPastTransferDate = isTransferDatePast(dateStr)
                        
                        const handleStartStoreChange = (value: string) => {
                          setTransferStartStoreIds(prev => {
                            const next = { ...prev }
                            if (value === '__auto__') {
                              delete next[dateStr]
                            } else {
                              next[dateStr] = value
                            }
                            saveTransferStartStoreIds(next)
                            return next
                          })
                        }
                        
                        return (
                          <div key={dateStr}>
                            <div className={`flex items-center gap-2 mb-2 px-2 py-1 rounded-lg ${isPastTransferDate ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'}`}>
                              <Calendar className={`h-4 w-4 ${isPastTransferDate ? 'text-amber-600' : 'text-primary'}`} />
                              <span className="font-bold">{transferDateLabel} 移動</span>
                              <span className="text-sm text-muted-foreground">→ {perfPeriodLabel}</span>
                              {isPastTransferDate && (
                                <Badge variant="secondary" className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                                  過去
                                </Badge>
                              )}
                              <Badge variant="secondary" className="ml-auto">
                                {dayKitCount}キット
                              </Badge>
                            </div>

                            {startStoreOptions.length > 0 && (
                              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {transferDateLabel}の起点店舗
                                </span>
                                <Select value={selectedStartValue} onValueChange={handleStartStoreChange}>
                                  <SelectTrigger className="h-8 w-[180px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__auto__">自動おすすめ</SelectItem>
                                    {startStoreOptions.map(option => (
                                      <SelectItem key={`${dateStr}-${option.groupId}`} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            
                            {/* 店舗グループ別（同じkit_groupは1つのカードに） */}
                            <div className="space-y-3">
                              {routeStops.map(({
                                groupId,
                                storeIdsInGroup,
                                groupStoreName,
                                minutesFromPrevious,
                                outgoingRoutes,
                                incomingRoutes,
                                outgoingCount,
                                incomingCount,
                                outgoingItemCount,
                                incomingItemCount,
                                incompleteCount,
                              }, stopIndex) => {
                                return (
                                  <div
                                    key={groupId}
                                    className="bg-white dark:bg-gray-800 rounded-lg p-3"
                                  >
                                    {/* 店舗グループヘッダー */}
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b flex-wrap">
                                      <Badge variant="secondary" className="h-6 w-6 justify-center rounded-full px-0">
                                        {stopIndex + 1}
                                      </Badge>
                                      <MapPin className="h-4 w-4 text-primary" />
                                      <span className="font-bold text-lg">{groupStoreName}</span>
                                      {minutesFromPrevious === null ? (
                                        <Badge variant="outline" className="text-[10px]">
                                          起点
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                          前店舗から約{minutesFromPrevious}分
                                        </Badge>
                                      )}
                                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                                        {outgoingCount > 0 && (
                                          <Badge variant="outline" className="bg-red-50 text-red-700">
                                            積む{outgoingCount}
                                          </Badge>
                                        )}
                                        {incomingCount > 0 && (
                                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                            降ろす{incomingCount}
                                          </Badge>
                                        )}
                                        {incompleteCount > 0 && (
                                          <Badge variant="destructive" className="text-xs">
                                            未完了{incompleteCount}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* 到着（このグループが必要としているキット）- 設置チェック */}
                                    {incomingRoutes.length > 0 && (
                                      <div className="mb-3">
                                        <div className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-2">
                                          降ろす（設置）
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                                            {incomingItemCount}件
                                          </Badge>
                                        </div>
                                        <div className="space-y-2 pl-2 border-l-2 border-blue-200">
                                          {incomingRoutes.map((route, routeIdx) => {
                                            const toStore = storeMap.get(route.to_store_id)
                                            const toStoreName = toStore?.short_name || toStore?.name || ''
                                            return (
                                            <div key={`in-${routeIdx}`}>
                                              <div className="mb-1 flex items-center gap-1.5 text-xs text-blue-700">
                                                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">受け取り元</span>
                                                <span className="font-medium">{route.from_store_name}</span>
                                                {storeIdsInGroup.length > 1 && (
                                                  <>
                                                    <ArrowRight className="h-3 w-3 text-blue-400" />
                                                    <span className="text-muted-foreground">{toStoreName}へ設置</span>
                                                  </>
                                                )}
                                              </div>
                                              <div className="space-y-1">
                                                {route.items.map((suggestion, index) => {
                                                  // 移動先店舗（グループ含む）でこのシナリオが使われる全ての日付とイベント情報を取得
                                                  const toGroupId = getStoreGroupId(suggestion.to_store_id)
                                                  const matchingEvents = scheduleEvents
                                                    .filter(event => 
                                                      event.scenario_master_id === suggestion.scenario_master_id &&
                                                      getStoreGroupId(event.store_id) === toGroupId &&
                                                      demandDates.includes(event.date) &&
                                                      !event.is_cancelled
                                                    )
                                                  const allDatesForScenario = matchingEvents
                                                    .map(event => event.date)
                                                    .filter((date, idx, arr) => arr.indexOf(date) === idx) // 重複排除
                                                    .sort()
                                                  const allDatesStr = allDatesForScenario.length > 0 
                                                    ? allDatesForScenario.map(d => {
                                                        const date = parseLocalDate(d)
                                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                                      }).join(', ')
                                                    : `${parseLocalDate(suggestion.performance_date).getMonth() + 1}/${parseLocalDate(suggestion.performance_date).getDate()}`
                                                  
                                                  // 空席情報を計算（全イベントの合計）
                                                  const totalCapacity = matchingEvents.reduce((sum, e) => sum + (e.capacity || 0), 0)
                                                  const totalParticipants = matchingEvents.reduce((sum, e) => sum + (e.current_participants || 0), 0)
                                                  const remainingSeats = totalCapacity - totalParticipants
                                                  const hasPrivatePerformance = matchingEvents.some(e =>
                                                    e.category === 'private' || e.is_private_request || e.is_private_booking
                                                  )
                                                  const isLowPriority = totalParticipants === 0 && !hasPrivatePerformance
                                                  const categoryBadge = getCategoryBadge(
                                                    matchingEvents.find(e => e.date === suggestion.performance_date) || matchingEvents[0]
                                                  )
                                                  
                                                  // ルックアップには org_scenario_id を優先して使用（DBに保存されるID）
                                                  const lookupScenarioId = suggestion.org_scenario_id || suggestion.scenario_master_id
                                                  const pickedUp = isPickedUp(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const delivered = isDelivered(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const completion = getCompletion(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  
                                                  // 公演がキャンセルされたかチェック（scheduleEventsはscenario_master_idを使用）
                                                  const isCancelled = isPerformanceCancelled(suggestion.scenario_master_id, suggestion.performance_date, suggestion.to_store_id)
                                                  // 移動日が過去かつ公演キャンセル → 移動中止
                                                  const isTransferCancelled = isPastTransferDate && isCancelled && !pickedUp && !delivered
                                                  
                                                  // 誰が設置したか
                                                  const deliveredByName = completion?.delivered_by_staff?.name
                                                  
                                                  return (
                                                    <div key={index} className={`flex items-center gap-2 py-1 ${isTransferCancelled ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50 rounded' : ''} ${delivered ? 'opacity-40 bg-green-50 dark:bg-green-900/10 rounded' : ''}`}>
                                                      {/* 設置チェックボックス - キャンセル時は×アイコン */}
                                                      {isTransferCancelled ? (
                                                        <div className="w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 bg-gray-300 border-gray-400 dark:bg-gray-600 dark:border-gray-500" title="公演中止のため移動不要">
                                                          <X className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 ${pickedUp ? 'cursor-pointer active:scale-95 hover:border-green-400' : 'cursor-not-allowed opacity-30'} ${delivered ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}
                                                          onClick={() => handleToggleDelivery(suggestion.scenario_master_id, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id, suggestion.scenario_title, suggestion.org_scenario_id)}
                                                          title={pickedUp ? '設置完了' : '回収してから設置できます'}
                                                        >
                                                          {delivered && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                      )}
                                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isCancelled ? 'line-through text-gray-400' : ''}`}>
                                                        {allDatesStr}
                                                      </Badge>
                                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${categoryBadge.className}`}>
                                                        {categoryBadge.label}
                                                      </Badge>
                                                      <span className={`text-xs truncate ${delivered || isTransferCancelled ? 'line-through' : ''} ${isTransferCancelled ? 'text-gray-400' : ''}`}>{suggestion.scenario_title}</span>
                                                      <span className="text-muted-foreground text-[10px]">#{suggestion.kit_number}</span>
                                                      {/* 予約状況表示（未完了のみ） */}
                                                      {!isTransferCancelled && !isCancelled && !delivered && (
                                                        <>
                                                          {totalCapacity > 0 && (
                                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                              {totalParticipants}/{totalCapacity}
                                                            </span>
                                                          )}
                                                          <Badge
                                                            variant={isLowPriority ? 'secondary' : 'destructive'}
                                                            className="text-[9px] px-1 py-0"
                                                          >
                                                            {isLowPriority ? '優先度低' : '移動必要'}
                                                          </Badge>
                                                        </>
                                                      )}
                                                      {isTransferCancelled && (
                                                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                          公演中止・移動不要
                                                        </Badge>
                                                      )}
                                                      {delivered && deliveredByName && (
                                                        <span className="text-[10px] text-green-600 font-medium">
                                                          {deliveredByName}設置 {formatCompletionDate(completion?.delivered_at || null)}
                                                        </span>
                                                      )}
                                                      {!pickedUp && !isTransferCancelled && (
                                                        <span className="text-[10px] text-orange-500">未回収</span>
                                                      )}
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )})}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* 出発（このグループから持ち出すキット）- 回収チェック */}
                                    {outgoingRoutes.length > 0 && (
                                      <div>
                                        <div className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-2">
                                          積む（回収）
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200">
                                            {outgoingItemCount}件
                                          </Badge>
                                        </div>
                                        <div className="space-y-2 pl-2 border-l-2 border-red-200">
                                          {outgoingRoutes.map((route, routeIdx) => {
                                            const fromStore = storeMap.get(route.from_store_id)
                                            const fromStoreName = fromStore?.short_name || fromStore?.name || ''
                                            return (
                                            <div key={`out-${routeIdx}`}>
                                              {/* 配達先ヘッダー */}
                                              <div className="mb-1 flex items-center gap-1.5 text-xs text-red-700">
                                                <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">行き先</span>
                                                <span className="font-medium">{route.to_store_name}</span>
                                                {storeIdsInGroup.length > 1 && (
                                                  <span className="text-muted-foreground">({fromStoreName}から回収)</span>
                                                )}
                                              </div>
                                              
                                              {/* キット一覧 */}
                                              <div className="space-y-1">
                                                {route.items.map((suggestion, index) => {
                                                  // 移動先店舗（グループ含む）でこのシナリオが使われる全ての日付とイベント情報を取得
                                                  const toGroupId = getStoreGroupId(suggestion.to_store_id)
                                                  const matchingEvents = scheduleEvents
                                                    .filter(event => 
                                                      event.scenario_master_id === suggestion.scenario_master_id &&
                                                      getStoreGroupId(event.store_id) === toGroupId &&
                                                      demandDates.includes(event.date) &&
                                                      !event.is_cancelled
                                                    )
                                                  const allDatesForScenario = matchingEvents
                                                    .map(event => event.date)
                                                    .filter((date, idx, arr) => arr.indexOf(date) === idx) // 重複排除
                                                    .sort()
                                                  const allDatesStr = allDatesForScenario.length > 0 
                                                    ? allDatesForScenario.map(d => {
                                                        const date = parseLocalDate(d)
                                                        return `${date.getMonth() + 1}/${date.getDate()}`
                                                      }).join(', ')
                                                    : `${parseLocalDate(suggestion.performance_date).getMonth() + 1}/${parseLocalDate(suggestion.performance_date).getDate()}`
                                                  
                                                  // 空席情報を計算（全イベントの合計）
                                                  const totalCapacity = matchingEvents.reduce((sum, e) => sum + (e.capacity || 0), 0)
                                                  const totalParticipants = matchingEvents.reduce((sum, e) => sum + (e.current_participants || 0), 0)
                                                  const remainingSeats = totalCapacity - totalParticipants
                                                  const hasPrivatePerformance = matchingEvents.some(e =>
                                                    e.category === 'private' || e.is_private_request || e.is_private_booking
                                                  )
                                                  const isLowPriority = totalParticipants === 0 && !hasPrivatePerformance
                                                  const categoryBadge = getCategoryBadge(
                                                    matchingEvents.find(e => e.date === suggestion.performance_date) || matchingEvents[0]
                                                  )
                                                  
                                                  // ルックアップには org_scenario_id を優先して使用（DBに保存されるID）
                                                  const lookupScenarioId = suggestion.org_scenario_id || suggestion.scenario_master_id
                                                  const pickedUp = isPickedUp(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const delivered = isDelivered(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  const completion = getCompletion(lookupScenarioId, suggestion.kit_number, suggestion.performance_date, suggestion.to_store_id)
                                                  
                                                  // 公演がキャンセルされたかチェック（scheduleEventsはscenario_master_idを使用）
                                                  const isCancelled = isPerformanceCancelled(suggestion.scenario_master_id, suggestion.performance_date, suggestion.to_store_id)
                                                  // 移動日が過去かつ公演キャンセル → 移動中止
                                                  const isTransferCancelled = isPastTransferDate && isCancelled && !pickedUp && !delivered
                                                  
                                                  // 誰が回収したか
                                                  const pickedUpByName = completion?.picked_up_by_staff?.name
                                                  
                                                  return (
                                                    <div key={index} className={`flex items-center gap-2 py-1 ${isTransferCancelled ? 'opacity-50 bg-gray-100 dark:bg-gray-800/50 rounded' : ''} ${pickedUp ? 'bg-blue-50 dark:bg-blue-900/10 rounded' : ''} ${delivered ? 'opacity-40' : ''}`}>
                                                      {/* 回収チェックボックス - キャンセル時は×アイコン */}
                                                      {isTransferCancelled ? (
                                                        <div className="w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 bg-gray-300 border-gray-400 dark:bg-gray-600 dark:border-gray-500" title="公演中止のため移動不要">
                                                          <X className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`w-6 h-6 sm:w-5 sm:h-5 rounded border-2 sm:border flex items-center justify-center shrink-0 cursor-pointer active:scale-95 hover:border-blue-400 ${pickedUp ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}
                                                          onClick={() => handleTogglePickup(suggestion.scenario_master_id, suggestion.kit_number, suggestion.performance_date, suggestion.from_store_id, suggestion.to_store_id, suggestion.org_scenario_id)}
                                                          title="回収"
                                                        >
                                                          {pickedUp && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                      )}
                                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${isCancelled ? 'line-through text-gray-400' : ''}`}>
                                                        {allDatesStr}
                                                      </Badge>
                                                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${categoryBadge.className}`}>
                                                        {categoryBadge.label}
                                                      </Badge>
                                                      <span className={`text-xs truncate ${delivered || isTransferCancelled ? 'line-through' : ''} ${isTransferCancelled ? 'text-gray-400' : ''}`}>{suggestion.scenario_title}</span>
                                                      <span className="text-muted-foreground text-[10px]">#{suggestion.kit_number}</span>
                                                      {/* 予約状況表示（未回収のみ） */}
                                                      {!isTransferCancelled && !isCancelled && !pickedUp && (
                                                        <>
                                                          {totalCapacity > 0 && (
                                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                              {totalParticipants}/{totalCapacity}
                                                            </span>
                                                          )}
                                                          <Badge
                                                            variant={isLowPriority ? 'secondary' : 'destructive'}
                                                            className="text-[9px] px-1 py-0"
                                                          >
                                                            {isLowPriority ? '優先度低' : '移動必要'}
                                                          </Badge>
                                                        </>
                                                      )}
                                                      {isTransferCancelled && (
                                                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                          公演中止・移動不要
                                                        </Badge>
                                                      )}
                                                      {pickedUp && pickedUpByName && (
                                                        <span className="text-[10px] text-blue-600 font-medium">
                                                          {pickedUpByName}回収 {formatCompletionDate(completion?.picked_up_at || null)}
                                                        </span>
                                                      )}
                                                      {delivered && (
                                                        <span className="text-[10px] text-green-500">完了</span>
                                                      )}
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )})}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* 確定済み移動イベント（ルートでグループ化） */}
              <div className="order-5">
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
                              const scenario = scenarioMap.get(event.scenario_master_id)
                              // 実際の行き先店舗名を取得
                              const actualToStore = storeMap.get(event.to_store_id)
                              const showActualStore = group.isGrouped && event.to_store_id !== group.to_store_id
                              
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
                                  {showActualStore && (
                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                      → {actualToStore?.short_name || actualToStore?.name}
                                    </Badge>
                                  )}
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
  )
}
