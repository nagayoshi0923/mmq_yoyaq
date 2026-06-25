/**
 * レポート送信プレビューダイアログ（SendReports から子コンポーネント抽出・挙動不変）。
 * JSX は元 SendReports の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 * 状態・ハンドラ・派生関数（getPreviewItem / generateEmailBody）は全て親から注入する。
 */
import { Home, Building, Loader2, Send } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportItem, ReportGroup } from '../types'

interface SendPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ReportGroup | null
  year: number
  month: number
  selectedScenarioIds: Set<string>
  toggleScenarioSelection: (item: ReportItem) => void
  getPreviewItem: (item: ReportItem) => ReportItem
  generateEmailBody: (group: ReportGroup, selectedIds: Set<string>) => string
  tab: 'scenarios' | 'body'
  setTab: (tab: 'scenarios' | 'body') => void
  isBodyManuallyEdited: boolean
  setIsBodyManuallyEdited: (value: boolean) => void
  emailBodyText: string
  setEmailBodyText: (value: string) => void
  internalInputs: Record<string, number | undefined>
  externalInputs: Record<string, number | undefined>
  handleInternalInputChange: (scenarioKey: string, value: number | undefined) => void
  handleExternalInputChange: (scenarioKey: string, value: number) => void
  isSending: boolean
  onConfirmSend: () => void
}

export function SendPreviewDialog({
  open,
  onOpenChange,
  target,
  year,
  month,
  selectedScenarioIds,
  toggleScenarioSelection,
  getPreviewItem,
  generateEmailBody,
  tab,
  setTab,
  isBodyManuallyEdited,
  setIsBodyManuallyEdited,
  emailBodyText,
  setEmailBodyText,
  internalInputs,
  externalInputs,
  handleInternalInputChange,
  handleExternalInputChange,
  isSending,
  onConfirmSend,
}: SendPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>レポート送信プレビュー</DialogTitle>
          <DialogDescription>
            {target?.authorName} ({target?.authorEmail}) へ
            {year}年{month}月のレポートを送信
          </DialogDescription>
        </DialogHeader>

        {/* 送信内容サマリー */}
        <div className="flex gap-6 px-1 py-2 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold">
              {target?.items
                .filter(item => selectedScenarioIds.has(item.scenarioKey))
                .map(getPreviewItem)
                .reduce((sum, item) => sum + item.events, 0) || 0}
            </div>
            <div className="text-xs text-muted-foreground">公演数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              ¥{(target?.items
                .filter(item => selectedScenarioIds.has(item.scenarioKey))
                .map(getPreviewItem)
                .reduce((sum, item) => sum + item.licenseCost, 0) || 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">ライセンス料</div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => {
          const next = v as 'scenarios' | 'body'
          setTab(next)
          // メール本文タブに切り替えるとき、手動編集していなければ現在の選択から再生成
          if (next === 'body' && !isBodyManuallyEdited && target) {
            setEmailBodyText(generateEmailBody(target, selectedScenarioIds))
          }
        }}>
          <TabsList className="w-full">
            <TabsTrigger value="scenarios" className="flex-1">シナリオ選択</TabsTrigger>
            <TabsTrigger value="body" className="flex-1">メール本文</TabsTrigger>
          </TabsList>

          {/* シナリオ選択タブ */}
          <TabsContent value="scenarios" className="space-y-3 mt-3">
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {target?.items.map((item, idx) => {
                const key = item.scenarioKey
                const isSelected = selectedScenarioIds.has(key)
                const previewItem = getPreviewItem(item)
                const isZeroCost = previewItem.licenseCost === 0

                return (
                  <div
                    key={idx}
                    className={`p-3 ${isZeroCost ? 'bg-muted/30' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleScenarioSelection(item)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm truncate cursor-pointer hover:underline ${isZeroCost ? 'text-muted-foreground' : ''}`}
                            onClick={() => toggleScenarioSelection(item)}
                          >
                            {item.scenarioTitle}
                          </span>
                          {item.isGMTest && (
                            <Badge variant="outline" className="text-xs shrink-0">GMテスト</Badge>
                          )}
                          {isZeroCost && (
                            <Badge variant="secondary" className="text-xs shrink-0">0円</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 ml-7 flex items-center gap-4 text-xs">
                      {/* 自社公演数（手動上書き可能） */}
                      <div className="flex items-center gap-1">
                        <Home className="w-3 h-3 text-blue-500" />
                        <Input
                          type="number"
                          min={0}
                          className={`w-14 h-6 text-xs px-1 ${internalInputs[key] !== undefined ? 'text-orange-500 font-medium' : ''}`}
                          placeholder={item.internalEvents.toString()}
                          value={internalInputs[key] !== undefined ? internalInputs[key] : ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const raw = e.target.value
                            const val = raw === '' ? undefined : (parseInt(raw) || 0)
                            handleInternalInputChange(key, val)
                          }}
                        />
                        <span className="text-muted-foreground">@¥{item.internalLicenseAmount.toLocaleString()}</span>
                      </div>
                      {item.scenarioType === 'managed' && (
                        <div className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-green-500" />
                          <Input
                            type="number"
                            min={0}
                            className={`w-14 h-6 text-xs px-1 ${externalInputs[item.scenarioKey] !== undefined ? 'text-orange-500 font-medium' : ''}`}
                            placeholder={item.externalEvents.toString()}
                            value={externalInputs[item.scenarioKey] !== undefined ? externalInputs[item.scenarioKey] : ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const raw = e.target.value
                              const val = raw === '' ? 0 : (parseInt(raw) || 0)
                              handleExternalInputChange(item.scenarioKey, val)
                            }}
                          />
                          <span className="text-muted-foreground">@¥{item.externalLicenseAmount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="ml-auto font-medium">
                        = ¥{previewItem.licenseCost.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">※ 0円のシナリオはデフォルトで除外されています</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  if (target) {
                    const body = generateEmailBody(target, selectedScenarioIds)
                    setEmailBodyText(body)
                    setTab('body')
                  }
                }}
              >
                本文を確認 →
              </Button>
            </div>
          </TabsContent>

          {/* メール本文タブ */}
          <TabsContent value="body" className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">メール本文（編集可能）</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  if (target) {
                    setEmailBodyText(generateEmailBody(target, selectedScenarioIds))
                    setIsBodyManuallyEdited(false)
                  }
                }}
              >
                選択内容から再生成
              </Button>
            </div>
            <Textarea
              value={emailBodyText}
              onChange={(e) => {
                setEmailBodyText(e.target.value)
                setIsBodyManuallyEdited(true)
              }}
              className="font-mono text-xs h-80 resize-none"
              placeholder="メール本文"
            />
            <p className="text-xs text-muted-foreground">
              ※ プレーンテキストメールとして送信されます。
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            キャンセル
          </Button>
          <Button
            onClick={onConfirmSend}
            disabled={isSending || selectedScenarioIds.size === 0}
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                送信中...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                送信する ({selectedScenarioIds.size}件)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
