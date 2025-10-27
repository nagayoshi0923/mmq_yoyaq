import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'
import { CustomDatePicker } from './CustomDatePicker'

interface DateRangeModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (startDate?: string, endDate?: string) => void
  initialStartDate?: string
  initialEndDate?: string
  title?: string
  description?: string
  monthOnly?: boolean  // 月選択モード
}

export function DateRangeModal({
  isOpen,
  onClose,
  onSave,
  initialStartDate = '',
  initialEndDate = '',
  title = '適用期間設定',
  description = '開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。',
  monthOnly = false
}: DateRangeModalProps) {
  const [startDate, setStartDate] = useState(initialStartDate)
  const [endDate, setEndDate] = useState(initialEndDate)

  const handleSave = () => {
    onSave(startDate || undefined, endDate || undefined)
    onClose()
  }

  const handleClear = () => {
    setStartDate('')
    setEndDate('')
  }

  // モーダルが開かれたときに初期値をリセット
  React.useEffect(() => {
    if (isOpen) {
      setStartDate(initialStartDate || '')
      setEndDate(initialEndDate || '')
    }
  }, [isOpen, initialStartDate, initialEndDate])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!monthOnly && (
            <>
              {/* 開始日カレンダー */}
              <CustomDatePicker
                value={startDate}
                onChange={setStartDate}
                label="開始日（任意）"
              />
              <p className="text-xs text-muted-foreground -mt-2">
                未指定の場合、現行設定として扱われます
              </p>

              <div className="border-t pt-6">
                {/* 終了日カレンダー */}
                <CustomDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  label="終了日（任意）"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  未指定の場合、無期限となります
                </p>
              </div>
            </>
          )}

          {/* プレビュー */}
          {(startDate || endDate) && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {monthOnly ? '発生月: ' : '適用期間: '}
                </span>
                <span className="text-sm text-foreground">
                  {monthOnly ? (
                    startDate && startDate.substring(0, 7)
                  ) : (
                    <>
                      {startDate && !endDate && `${startDate}から`}
                      {!startDate && endDate && `${endDate}まで`}
                      {startDate && endDate && `${startDate} 〜 ${endDate}`}
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-6 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="flex-1"
          >
            クリア
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="flex-1"
          >
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

