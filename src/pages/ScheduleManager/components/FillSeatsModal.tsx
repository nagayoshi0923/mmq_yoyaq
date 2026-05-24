import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

export type FillSeatsCategory = 'open' | 'private' | 'gmtest' | 'trip' | 'package'

const CATEGORY_OPTIONS: { value: FillSeatsCategory; label: string }[] = [
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
  isProcessing: boolean
  defaultYear: number
  defaultMonth: number
}

export function FillSeatsModal({
  open,
  onClose,
  onConfirm,
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

  useEffect(() => {
    if (open) {
      setStartDate(monthStart)
      setEndDate(defaultEnd)
      setCategories(['open', 'private', 'gmtest', 'trip', 'package'])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultYear, defaultMonth])

  const isValid = startDate <= endDate && categories.length > 0

  const toggleCategory = (cat: FillSeatsCategory) => {
    setCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isProcessing) onClose() }}>
      <DialogContent className="max-w-sm">
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
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>キャンセル</Button>
          <Button
            onClick={() => onConfirm({ startDate, endDate, categories })}
            disabled={!isValid || isProcessing}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                処理中…
              </span>
            ) : '満席にする'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
