/**
 * 作者メールアドレス一括登録ダイアログ（SendReports から子コンポーネント抽出・挙動不変）。
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
import type { ReportGroup } from '../types'

interface BulkEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ReportGroup | null
  email: string
  setEmail: (value: string) => void
  isSaving: boolean
  onSave: () => void
}

export function BulkEmailDialog({
  open,
  onOpenChange,
  target,
  email,
  setEmail,
  isSaving,
  onSave,
}: BulkEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>作者メールアドレス一括登録</DialogTitle>
          <DialogDescription>
            {target?.authorName} のシナリオにメールアドレスを一括登録します
            {target?.authorEmail && (
              <span className="block mt-1 text-green-600">
                現在の登録: {target.authorEmail}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-email">メールアドレス</Label>
            <Input
              id="bulk-email"
              type="email"
              placeholder="author@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>対象シナリオ ({target?.items.length || 0}件)</Label>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {target?.items.map((item, idx) => (
                <div key={idx} className="text-sm flex items-center gap-2">
                  <span className={item.authorEmail ? 'text-muted-foreground' : 'text-orange-600 font-medium'}>
                    • {item.scenarioTitle}
                  </span>
                  {!item.authorEmail && (
                    <span className="text-xs text-orange-500">未登録</span>
                  )}
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
            disabled={isSaving || !email.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                登録中...
              </>
            ) : (
              '一括登録'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
