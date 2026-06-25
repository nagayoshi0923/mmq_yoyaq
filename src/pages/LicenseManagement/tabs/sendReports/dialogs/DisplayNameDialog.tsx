/**
 * 報告用表示名・メモ編集ダイアログ（SendReports から子コンポーネント抽出・挙動不変）。
 * JSX は元 SendReports の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 */
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ReportGroup } from '../types'

interface DisplayNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ReportGroup | null
  displayName: string
  setDisplayName: (value: string) => void
  authorNotes: string
  setAuthorNotes: (value: string) => void
  isSaving: boolean
  onSave: () => void
}

export function DisplayNameDialog({
  open,
  onOpenChange,
  target,
  displayName,
  setDisplayName,
  authorNotes,
  setAuthorNotes,
  isSaving,
  onSave,
}: DisplayNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>作者設定</DialogTitle>
          <DialogDescription>
            報告用の表示名とメモを設定できます
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>元の作者名</Label>
            <div className="p-2 bg-muted rounded text-sm">
              {target?.originalAuthorName}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">報告用表示名</Label>
            <Input
              id="displayName"
              placeholder="報告用の表示名を入力"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              元の作者名と同じ場合はリセットされます
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorNotes">メモ（振込先等）</Label>
            <Textarea
              id="authorNotes"
              placeholder="振込先情報、連絡事項など"
              value={authorNotes}
              onChange={(e) => setAuthorNotes(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>対象シナリオ ({target?.items.length || 0}件)</Label>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
              {target?.items.map((item, idx) => (
                <div key={idx} className="text-sm">
                  • {item.scenarioTitle}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            キャンセル
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving || !displayName.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                更新中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
