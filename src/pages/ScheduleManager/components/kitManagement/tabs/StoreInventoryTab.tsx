import type React from 'react'
import { Badge } from '@/components/ui/badge'
import { TabsContent } from '@/components/ui/tabs'
import { GripVertical, Lock } from 'lucide-react'
import { KIT_CONDITION_LABELS, KIT_CONDITION_COLORS } from '@/types'
import type { KitCondition, Store, Scenario } from '@/types'
import type { DraggedKit } from '../types'

/**
 * キット管理ダイアログ「店舗別在庫」タブ。
 * KitManagementDialog から JSX を抽出（挙動不変）。state/派生/ハンドラは props 注入。
 * Tabs コンテキストは親の <Tabs> から伝播するため挙動は不変。
 */
type StoreInventory = Map<string, Array<{
  scenario: Scenario
  kits: Array<{ kitNumber: number; condition: KitCondition; conditionNotes?: string | null; isFixed?: boolean }>
}>>

interface StoreInventoryTabProps {
  stores: Store[]
  storeInventory: StoreInventory
  dragOverStoreId: string | null
  draggedKit: DraggedKit | null
  handleDragOver: (e: React.DragEvent, storeId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, toStoreId: string) => Promise<void>
  handleDragStart: (e: React.DragEvent, scenarioId: string, kitNumber: number, fromStoreId: string) => void
  handleDragEnd: () => void
  handleContextMenu: (e: React.MouseEvent, scenarioId: string, kitNumber: number, storeId: string, condition: KitCondition) => void
}

export function StoreInventoryTab({
  stores,
  storeInventory,
  dragOverStoreId,
  draggedKit,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragStart,
  handleDragEnd,
  handleContextMenu,
}: StoreInventoryTabProps) {
  return (
          <TabsContent value="store" className="flex-1 overflow-auto">
            <p className="text-xs text-muted-foreground mb-2">
              ドラッグ&ドロップまたは右クリックで店舗間移動・状態変更ができます
            </p>
            <div className="flex gap-3 h-full overflow-x-auto pb-2">
              {stores.filter(s => s.status === 'active').map(store => {
                const inventory = storeInventory.get(store.id) || []
                const totalKits = inventory.reduce((sum, item) => sum + item.kits.length, 0)
                const isDragOver = dragOverStoreId === store.id
                
                return (
                  <div
                    key={store.id}
                    className={`
                      flex-shrink-0 w-48 bg-muted/30 rounded-lg flex flex-col transition-colors
                      ${isDragOver ? 'ring-2 ring-primary bg-primary/10' : ''}
                    `}
                    onDragOver={(e) => handleDragOver(e, store.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, store.id)}
                  >
                    {/* カラムヘッダー（固定は「現在の配置」タブでキットごとに設定） */}
                    <div className="p-2 border-b rounded-t-lg bg-muted/50">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-sm truncate">
                          {store.short_name || store.name}
                        </span>
                        <Badge variant="secondary" className="text-xs h-5 shrink-0">
                          {totalKits}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* キットカード一覧 */}
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-[100px]">
                      {inventory.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          {isDragOver ? 'ここにドロップ' : 'キットなし'}
                        </p>
                      ) : (
                        inventory.flatMap(item =>
                          item.kits.map(kit => {
                            const hasIssue = kit.condition !== 'good'
                            const isDragging = draggedKit?.scenarioId === item.scenario.id && 
                                              draggedKit?.kitNumber === kit.kitNumber
                            return (
                              <div
                                key={`${item.scenario.id}-${kit.kitNumber}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item.scenario.id, kit.kitNumber, store.id)}
                                onDragEnd={handleDragEnd}
                                onContextMenu={(e) => handleContextMenu(e, item.scenario.id, kit.kitNumber, store.id, kit.condition)}
                                className={`
                                  px-2 py-1 rounded border bg-background text-xs cursor-grab active:cursor-grabbing
                                  ${kit.isFixed ? 'ring-1 ring-orange-400 border-orange-400 bg-orange-50 dark:bg-orange-900/20' : hasIssue ? 'border-orange-300 dark:border-orange-700' : 'border-border'}
                                  ${isDragging ? 'opacity-50' : ''}
                                  hover:border-primary/50 hover:shadow-sm transition-all
                                `}
                                title={kit.isFixed ? '固定中（移動計画で動かさない）。右クリックで解除' : (kit.conditionNotes || 'ドラッグで移動 / 右クリックでメニュー')}
                              >
                                {/* 状態 + シナリオ名 */}
                                <div className="flex items-center gap-1.5">
                                  <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                                  {kit.isFixed && (
                                    <Lock className="h-3 w-3 text-orange-500 shrink-0" />
                                  )}
                                  <span
                                    className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] ${KIT_CONDITION_COLORS[kit.condition]}`}
                                  >
                                    {kit.condition === 'good' ? '✓' : '!'}
                                  </span>
                                  <span className="font-medium leading-tight truncate flex-1">
                                    {(item.scenario.kit_count || 1) > 1 && (
                                      <span className="text-muted-foreground mr-1">#{kit.kitNumber}</span>
                                    )}
                                    {item.scenario.title}
                                  </span>
                                </div>
                                {/* 問題がある場合のみメモを表示 */}
                                {hasIssue && (
                                  <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5 truncate pl-7">
                                    {KIT_CONDITION_LABELS[kit.condition]}
                                    {kit.conditionNotes && `: ${kit.conditionNotes}`}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </TabsContent>
  )
}
