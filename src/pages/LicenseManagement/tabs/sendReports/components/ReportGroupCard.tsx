/**
 * 報告先（作者グループ）1件のカード（SendReports から子コンポーネント抽出・挙動不変）。
 * JSX は元 SendReports の filteredGroups.map コールバックを逐語移植し、クロージャ参照を props 化。
 * 派生関数（getPreviewItem / getDisplay* / getReportDrift / isGroupZeroCostOnly）は状態依存のため親から注入。
 * 送信済メールを開く2バッチのロジックは親の onOpenSentEmail に集約。sentHistory マップは渡さず sentAt のみ。
 */
import { Mail, Building2, Building, Home, Send, Check, Copy, ChevronUp, ChevronDown, JapaneseYen, StickyNote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatJstMonthDay } from '@/utils/jstDate'
import type { ReportItem, ReportGroup } from '../types'

export interface ReportDrift {
  events: number
  cost: number
  sentEvents: number
  sentCost: number
}

interface ReportGroupCardProps {
  group: ReportGroup
  groupKey: string
  isExpanded: boolean
  isSelected: boolean
  sentAt: string | null
  copiedAuthor: string | null
  isSending: boolean
  internalInputs: Record<string, number | undefined>
  externalInputs: Record<string, number | undefined>
  viewMode: 'all' | 'internal' | 'external'
  isLicenseManager: boolean
  getPreviewItem: (item: ReportItem) => ReportItem
  getReportDrift: (group: ReportGroup) => ReportDrift | null
  getDisplayEvents: (group: ReportGroup) => number
  getDisplayInternalEvents: (group: ReportGroup) => number
  getDisplayExternalEvents: (group: ReportGroup) => number
  getDisplayLicenseCost: (group: ReportGroup) => number
  isGroupZeroCostOnly: (group: ReportGroup) => boolean
  onToggleSelect: (authorName: string) => void
  onToggleExpand: (key: string) => void
  onOpenDisplayNameDialog: (group: ReportGroup) => void
  onOpenBulkEmailDialog: (group: ReportGroup) => void
  onOpenSendPreview: (group: ReportGroup) => void
  onCopyEmail: (group: ReportGroup) => void
  onOpenSentEmail: (group: ReportGroup) => void
  onEditScenario: (scenarioId: string) => void
  onInternalInputChange: (scenarioKey: string, value: number | undefined) => void
  onExternalInputChange: (scenarioKey: string, value: number) => void
}

export function ReportGroupCard({
  group,
  groupKey,
  isExpanded,
  isSelected,
  sentAt,
  copiedAuthor,
  isSending,
  internalInputs,
  externalInputs,
  viewMode,
  isLicenseManager,
  getPreviewItem,
  getReportDrift,
  getDisplayEvents,
  getDisplayInternalEvents,
  getDisplayExternalEvents,
  getDisplayLicenseCost,
  isGroupZeroCostOnly,
  onToggleSelect,
  onToggleExpand,
  onOpenDisplayNameDialog,
  onOpenBulkEmailDialog,
  onOpenSendPreview,
  onCopyEmail,
  onOpenSentEmail,
  onEditScenario,
  onInternalInputChange,
  onExternalInputChange,
}: ReportGroupCardProps) {
  const editedTotalEvents = group.items.reduce((sum, item) => sum + getPreviewItem(item).events, 0)
  const hasNoEvents = editedTotalEvents === 0

  return (
    <Card className={`${isSelected ? 'ring-2 ring-primary' : ''} ${hasNoEvents ? 'opacity-50' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* チェックボックス（メールありのみ） */}
          {group.authorEmail && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(group.authorName)}
            />
          )}

          {/* メイン情報 */}
          <div
            className="flex-1 flex items-center justify-between cursor-pointer"
            onClick={() => onToggleExpand(groupKey)}
          >
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="font-semibold hover:text-primary hover:underline transition-colors text-left"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenDisplayNameDialog(group)
                  }}
                  title="クリックして表示名を編集"
                >
                  {group.authorName}
                </button>
                {group.authorName !== group.originalAuthorName && (
                  <Badge variant="secondary" className="text-xs">
                    編集済
                  </Badge>
                )}
                {sentAt !== null && (
                  <Badge
                    className="text-xs bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenSentEmail(group)
                    }}
                    title="クリックしてメール内容を確認・編集"
                  >
                    ✓ 送信済 {formatJstMonthDay(sentAt)}
                  </Badge>
                )}
                {/* 送信後に公演数・金額が変動した場合の差分警告 */}
                {(() => {
                  const drift = getReportDrift(group)
                  if (!drift) return null
                  const eventsChanged = drift.events !== drift.sentEvents
                  const costChanged = drift.cost !== drift.sentCost
                  const parts = [
                    eventsChanged ? `公演${drift.sentEvents}→${drift.events}` : null,
                    costChanged ? `¥${drift.sentCost.toLocaleString()}→¥${drift.cost.toLocaleString()}` : null,
                  ].filter(Boolean).join(' / ')
                  return (
                    <Badge
                      variant="destructive"
                      className="text-xs cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenSentEmail(group)
                      }}
                      title="送信後に公演数・金額が変動しています。クリックで送信済み内容を確認"
                    >
                      ⚠️ 送信時から変動 ({parts})
                    </Badge>
                  )
                })()}
                {group.authorEmail ? (
                  <Badge
                    variant="outline"
                    className="text-xs text-green-600 cursor-pointer hover:bg-green-50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenBulkEmailDialog(group)
                    }}
                  >
                    <Mail className="w-3 h-3 mr-1" />
                    {group.authorEmail}
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-xs text-orange-600 cursor-pointer hover:bg-orange-100 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenBulkEmailDialog(group)
                    }}
                  >
                    <Building2 className="w-3 h-3 mr-1" />
                    メアド未登録
                  </Badge>
                )}
                {/* 一部未登録の警告 */}
                {group.hasPartialEmail && (
                  <Badge
                    variant="destructive"
                    className="text-xs cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenBulkEmailDialog(group)
                    }}
                  >
                    ⚠️ {group.itemsWithoutEmail}件未登録
                  </Badge>
                )}
                {/* 作者メモ */}
                {group.authorNotes ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center text-xs text-amber-600 cursor-pointer hover:bg-amber-100 transition-colors border border-amber-200 rounded px-1.5 py-0.5"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDisplayNameDialog(group)
                          }}
                        >
                          <StickyNote className="w-3 h-3 mr-1" />
                          メモ
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap bg-white border shadow-lg rounded-md p-2">
                        <p className="text-sm text-foreground">{group.authorNotes}</p>
                        <p className="text-xs text-muted-foreground mt-1">クリックで編集</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span
                    className="inline-flex items-center text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors border border-dashed border-muted-foreground/30 rounded px-1.5 py-0.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenDisplayNameDialog(group)
                    }}
                  >
                    <StickyNote className="w-3 h-3 mr-1" />
                    メモ追加
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span>
                  {getDisplayEvents(group)}公演
                  {isLicenseManager && viewMode === 'all' && (
                    <span className="text-xs ml-1">
                      (自社{getDisplayInternalEvents(group)}/他社{getDisplayExternalEvents(group)})
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <JapaneseYen className="w-3 h-3" />
                  {getDisplayLicenseCost(group).toLocaleString()}
                </span>
                <span>{group.items.length}シナリオ</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isGroupZeroCostOnly(group) && (
                <Badge variant="secondary" className="text-xs">
                  報告不要
                </Badge>
              )}
              {!isGroupZeroCostOnly(group) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyEmail(group)
                  }}
                  title="メール本文をコピー"
                >
                  {copiedAuthor === group.authorName ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              )}
              {group.authorEmail && !isGroupZeroCostOnly(group) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSending}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenSendPreview(group)
                  }}
                >
                  <Send className="w-4 h-4 mr-1" />
                  送信
                </Button>
              )}
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        {/* 詳細 */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {/* ヘッダー行（ライセンス管理者のみ） */}
            {isLicenseManager && (
              <div className="flex items-center justify-between py-1 px-3 text-xs text-muted-foreground border-b">
                <span>シナリオ名</span>
                <div className="flex items-center gap-2 text-right">
                  <span className="w-24">自社</span>
                  <span className="w-24">他社</span>
                  <span className="w-24">合計</span>
                </div>
              </div>
            )}

            {group.items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between py-2 px-3 rounded ${
                  item.licenseCost === 0
                    ? 'bg-muted/20 opacity-60'
                    : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm text-left hover:underline hover:text-primary transition-colors"
                    onClick={() => onEditScenario(item.scenarioId)}
                  >
                    {item.scenarioTitle}
                  </button>
                  {item.isGMTest && (
                    <Badge variant="outline" className="text-xs">GMテスト</Badge>
                  )}
                  {item.licenseCost === 0 && (
                    <Badge variant="secondary" className="text-xs text-muted-foreground">
                      報告不要
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {isLicenseManager ? (
                    <>
                      {/* 自社（手動上書き可能） */}
                      {(() => {
                        const internalKey = item.scenarioKey
                        const isOverridden = internalInputs[internalKey] !== undefined
                        const effectiveInternal = internalInputs[internalKey] ?? item.internalEvents
                        const effectiveInternalCost = effectiveInternal * item.internalLicenseAmount
                        return (
                          <div className="w-24 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Home className="w-3 h-3 text-blue-500" />
                              <Input
                                type="number"
                                min={0}
                                className={`w-14 h-6 text-xs text-right px-1 ${isOverridden ? 'text-orange-500 font-medium' : ''}`}
                                placeholder={item.internalEvents.toString()}
                                value={isOverridden ? effectiveInternal : ''}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const val = raw === '' ? undefined : (parseInt(raw) || 0)
                                  onInternalInputChange(internalKey, val)
                                }}
                              />
                              <span className="text-xs">回</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              @¥{item.internalLicenseAmount.toLocaleString()}
                            </div>
                            <div className={`font-medium ${isOverridden ? 'text-orange-500' : 'text-blue-600'}`}>
                              ¥{effectiveInternalCost.toLocaleString()}
                            </div>
                          </div>
                        )
                      })()}
                      {/* 他社（回数 × 単価 = 金額）- 管理作品のみ表示・編集可能（GMテスト含む） */}
                      {item.scenarioType === 'managed' ? (
                        <div className="w-28 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Building className="w-3 h-3 text-green-500" />
                            <Input
                              type="number"
                              min={0}
                              className={`w-14 h-6 text-xs text-right px-1 ${externalInputs[item.scenarioKey] !== undefined ? 'text-orange-500 font-medium' : ''}`}
                              placeholder={item.externalEvents.toString()}
                              value={externalInputs[item.scenarioKey] !== undefined ? externalInputs[item.scenarioKey] : ''}
                              onChange={(e) => {
                                const raw = e.target.value
                                const val = raw === '' ? 0 : (parseInt(raw) || 0)
                                onExternalInputChange(item.scenarioKey, val)
                              }}
                            />
                            <span className="text-xs">回</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @¥{item.externalLicenseAmount.toLocaleString()}
                          </div>
                          <div className={`font-medium ${externalInputs[item.scenarioKey] !== undefined ? 'text-orange-500' : 'text-green-600'}`}>
                            ¥{((externalInputs[item.scenarioKey] ?? item.externalEvents) * item.externalLicenseAmount).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div className="w-28 text-right text-muted-foreground text-xs">
                          -
                        </div>
                      )}
                      {/* 合計 */}
                      <div className="w-24 text-right">
                        {(() => {
                          const pi = getPreviewItem(item)
                          return (
                            <>
                              <div className="font-medium">{pi.events}回</div>
                              <div className="text-xs text-muted-foreground">&nbsp;</div>
                              <div className="font-bold">
                                ¥{pi.licenseCost.toLocaleString()}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </>
                  ) : (
                    <>
                      <span>{item.internalEvents}回</span>
                      <span className="text-muted-foreground">
                        @¥{item.internalLicenseAmount.toLocaleString()}
                      </span>
                      <span className="font-medium">
                        ¥{item.internalLicenseCost.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
