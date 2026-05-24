import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ExportRangeModalProps {
  open: boolean
  onClose: () => void
  onExport: (startYearMonth: string, endYearMonth: string) => void
  isExporting: boolean
  defaultYear: number
  defaultMonth: number
}

function buildYearMonthOptions() {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let offset = -24; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const val = `${y}-${String(m).padStart(2, '0')}`
    options.push({ value: val, label: `${y}年${m}月` })
  }
  return options
}

const YEAR_MONTH_OPTIONS = buildYearMonthOptions()

export function ExportRangeModal({
  open,
  onClose,
  onExport,
  isExporting,
  defaultYear,
  defaultMonth,
}: ExportRangeModalProps) {
  const defaultVal = `${defaultYear}-${String(defaultMonth).padStart(2, '0')}`
  const [startYM, setStartYM] = useState(defaultVal)
  const [endYM, setEndYM] = useState(defaultVal)

  const isValid = startYM <= endYM

  const monthCount = (() => {
    const [sy, sm] = startYM.split('-').map(Number)
    const [ey, em] = endYM.split('-').map(Number)
    return (ey - sy) * 12 + (em - sm) + 1
  })()

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>CSVエクスポート</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>開始月</Label>
            <Select value={startYM} onValueChange={setStartYM}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_MONTH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>終了月</Label>
            <Select value={endYM} onValueChange={setEndYM}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_MONTH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isValid && (
            <p className="text-sm text-destructive">終了月は開始月以降を選択してください</p>
          )}
          {isValid && monthCount > 1 && (
            <p className="text-sm text-muted-foreground">
              {monthCount}ヶ月分を ZIP でまとめてダウンロードします
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>キャンセル</Button>
          <Button
            onClick={() => onExport(startYM, endYM)}
            disabled={!isValid || isExporting}
          >
            {isExporting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                エクスポート中…
              </span>
            ) : 'ダウンロード'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
