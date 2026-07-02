import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { showToast } from '@/utils/toast'

export type FillSeatsCategory = 'open' | 'private' | 'gmtest' | 'trip' | 'package'

export const CATEGORY_OPTIONS: { value: FillSeatsCategory; label: string }[] = [
  { value: 'open', label: 'オープン公演' },
  { value: 'private', label: '貸切公演' },
  { value: 'gmtest', label: 'GMテスト' },
  { value: 'trip', label: '出張公演' },
  { value: 'package', label: 'パッケージ' },
]

interface FillSeatsModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }) => void
  /** D-5d: 対象公演数の取得（「対象を確認」押下時に実行）。カテゴリ別内訳付き */
  fetchTargetCount: (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }) => Promise<{ total: number; byCategory: { category: FillSeatsCategory; count: number }[] }>
  isProcessing: boolean
  defaultYear: number
  defaultMonth: number
}

export function FillSeatsModal({
  open,
  onClose,
  onConfirm,
  fetchTargetCount,
  isProcessing,
  defaultYear,
  defaultMonth,
}: FillSeatsModalProps) {
  const monthStart = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  // デフォルト終了日: 表示月の月末 or 今日（早い方）。未来は満席にしたくないという意図。
  const lastDayOfMonth = new Date(defaultYear, defaultMonth, 0).getDate()
  const monthEnd = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
  const defaultEnd = monthEnd < todayStr ? monthEnd : todayStr

  const [startDate, setStartDate] = useState(monthStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [categories, setCategories] = useState<FillSeatsCategory[]>(['open', 'private', 'gmtest', 'trip', 'package'])

  // D-5d: 2ステップ化（input=条件入力 / preview=対象件数の確認）
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [isCounting, setIsCounting] = useState(false)
  const [targetCount, setTargetCount] = useState<number | null>(null)
  const [targetByCategory, setTargetByCategory] = useState<{ category: FillSeatsCategory; count: number }[]>([])

  useEffect(() => {
    if (open) {
      setStartDate(monthStart)
      setEndDate(defaultEnd)
      setCategories(['open', 'private', 'gmtest', 'trip', 'package'])
      setStep('input')
      setTargetCount(null)
      setTargetByCategory([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultYear, defaultMonth])

  const isValid = startDate <= endDate && categories.length > 0

  const toggleCategory = (cat: FillSeatsCategory) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const handleCheckTarget = async () => {
    setIsCounting(true)
    try {
      const { total, byCategory } = await fetchTargetCount({ startDate, endDate, categories })
      setTargetCount(total)
      setTargetByCategory(byCategory)
      setStep('preview')
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : '対象件数の取得に失敗しました')
    } finally {
      setIsCounting(false)
    }
  }

  const handleClose = () => {
    if (isProcessing || isCounting) return
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        {step === 'input' ? (
          <>
            <DialogHeader>
              <DialogTitle>満席にする</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="fill-start">開始日</Label>
                <Input
                  id="fill-start"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fill-end">終了日</Label>
                <Input
                  id="fill-end"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">未来の日付を含めないようにする場合は今日以前を指定</p>
              </div>

              <div className="space-y-2">
                <Label>対象カテゴリ</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_OPTIONS.map(opt => {
                    const checked = categories.includes(opt.value)
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 cursor-pointer border border-input rounded-md px-2 py-1.5 hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleCategory(opt.value)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {!isValid && (
                <p className="text-sm text-destructive">
                  {startDate > endDate ? '終了日は開始日以降を選択してください' : 'カテゴリを1つ以上選択してください'}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isCounting}>キャンセル</Button>
              <Button
                onClick={handleCheckTarget}
                disabled={!isValid || isCounting}
              >
                {isCounting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    確認中…
                  </span>
                ) : '対象を確認'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>満席にする（確認）</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <p className="text-sm">
                {startDate} 〜 {endDate} の中止以外の公演を満席（参加者数＝定員）にします。
              </p>

              {targetCount === 0 ? (
                <p className="text-sm text-muted-foreground">対象の公演がありません。</p>
              ) : (
                <div className="space-y-1 border border-input rounded-md px-3 py-2">
                  {targetByCategory.map(({ category, count }) => (
                    <div
                      key={category}
                      className={`flex items-center justify-between text-sm ${count === 0 ? 'text-muted-foreground' : ''}`}
                    >
                      <span>{CATEGORY_OPTIONS.find(opt => opt.value === category)?.label ?? category}</span>
                      <span>{count} 件</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-bold border-t border-input pt-1 mt-1">
                    <span>合計</span>
                    <span>{targetCount ?? 0} 件</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                ※ まだ実行されません。
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('input')} disabled={isProcessing}>戻る</Button>
              <Button
                variant="destructive"
                onClick={() => onConfirm({ startDate, endDate, categories })}
                disabled={isProcessing || !targetCount}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    処理中…
                  </span>
                ) : '満席にする'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
