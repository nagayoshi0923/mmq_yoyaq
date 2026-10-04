/**
 * 作品編集画面の「保存オプション」（公開／非公開と、MMQ への掲載申請）。ScenarioEditDialogV2.tsx から見た目を変えずに切り出したもの。
 * 保存の処理そのものは画面から onConfirmSave で受け取る。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Save } from 'lucide-react'

export function SaveOptionsDialog({ open, onOpenChange, savePublishChoice, setSavePublishChoice, isDraftMaster, submitToMMQ, setSubmitToMMQ, isSaving, onConfirmSave }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  savePublishChoice: 'available' | 'unavailable'
  setSavePublishChoice: (v: 'available' | 'unavailable') => void
  isDraftMaster: boolean
  submitToMMQ: boolean
  setSubmitToMMQ: (v: boolean) => void
  isSaving: boolean
  onConfirmSave: () => void | Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">保存オプション</DialogTitle>
          <DialogDescription className="text-xs">
            自組織の予約サイトへの表示設定を選択してください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 公開 / 非公開 */}
          <RadioGroup
            value={savePublishChoice}
            onValueChange={(v) => setSavePublishChoice(v as 'available' | 'unavailable')}
            className="space-y-2"
          >
            <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
              onClick={() => setSavePublishChoice('available')}>
              <RadioGroupItem value="available" id="opt-available" className="mt-0.5" />
              <div>
                <Label htmlFor="opt-available" className="font-medium text-sm cursor-pointer">公開して保存</Label>
                <p className="text-xs text-muted-foreground">予約サイトのシナリオ一覧に表示されます</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
              onClick={() => setSavePublishChoice('unavailable')}>
              <RadioGroupItem value="unavailable" id="opt-unavailable" className="mt-0.5" />
              <div>
                <Label htmlFor="opt-unavailable" className="font-medium text-sm cursor-pointer">非公開で保存</Label>
                <p className="text-xs text-muted-foreground">管理者のみ確認できます（予約サイトには表示されません）</p>
              </div>
            </div>
          </RadioGroup>

          {/* MMQ申請（公開選択 + draft マスタのときのみ） */}
          {savePublishChoice === 'available' && isDraftMaster && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="submit-to-mmq"
                  checked={submitToMMQ}
                  onCheckedChange={(checked) => setSubmitToMMQ(!!checked)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="submit-to-mmq" className="font-medium text-sm cursor-pointer text-blue-800">
                    MMQプラットフォームへの掲載を申請する
                  </Label>
                  <p className="text-xs text-blue-600 mt-0.5">
                    MMQ運営が審査します。承認後、MMQ全体の検索に表示されます。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            size="sm"
            disabled={isSaving}
            onClick={onConfirmSave}
          >
            <Save className="h-3 w-3 mr-1" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
