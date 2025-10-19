import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { memo } from 'react'

interface MonthSwitcherProps {
  /**
   * 現在の日付
   */
  value: Date
  /**
   * 日付変更時のコールバック
   */
  onChange: (date: Date) => void
  /**
   * 「今月」ボタンを表示するか
   */
  showToday?: boolean
  /**
   * 年月の直接選択を有効にするか
   */
  quickJump?: boolean
  /**
   * 前月ボタンのラベル
   */
  prevLabel?: string
  /**
   * 次月ボタンのラベル
   */
  nextLabel?: string
}

/**
 * 月表示切り替えUI（共通コンポーネント）
 * 
 * すべての画面で統一されたデザインとUXを提供します。
 * 
 * @example
 * ```tsx
 * <MonthSwitcher
 *   value={currentDate}
 *   onChange={setCurrentDate}
 *   showToday
 *   quickJump
 * />
 * ```
 */
export const MonthSwitcher = memo(function MonthSwitcher({
  value,
  onChange,
  showToday = true,
  quickJump = false,
  prevLabel = '← 前月',
  nextLabel = '次月 →'
}: MonthSwitcherProps) {
  const year = value.getFullYear()
  const month = value.getMonth() + 1

  /**
   * 前月へ移動
   */
  const handlePrevMonth = () => {
    const newDate = new Date(value)
    newDate.setMonth(value.getMonth() - 1)
    onChange(newDate)
  }

  /**
   * 次月へ移動
   */
  const handleNextMonth = () => {
    const newDate = new Date(value)
    newDate.setMonth(value.getMonth() + 1)
    onChange(newDate)
  }

  /**
   * 今月へ移動
   */
  const handleToday = () => {
    onChange(new Date())
  }

  /**
   * 年を変更
   */
  const handleYearChange = (newYear: string) => {
    const newDate = new Date(value)
    newDate.setFullYear(parseInt(newYear))
    onChange(newDate)
  }

  /**
   * 月を変更
   */
  const handleMonthChange = (newMonth: string) => {
    const newDate = new Date(value)
    newDate.setMonth(parseInt(newMonth) - 1)
    onChange(newDate)
  }

  return (
    <div className="flex items-center gap-2">
      {/* 前月ボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevMonth}
        className="h-9 px-3"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        {prevLabel}
      </Button>

      {/* 年月表示 / 選択 */}
      {quickJump ? (
        <div className="flex items-center gap-2">
          <Select value={year.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="h-9 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                <SelectItem key={y} value={y.toString()}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={month.toString()} onValueChange={handleMonthChange}>
            <SelectTrigger className="h-9 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <SelectItem key={m} value={m.toString()}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="text-lg font-bold min-w-[140px] text-center">
          {year}年{month}月
        </div>
      )}

      {/* 次月ボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleNextMonth}
        className="h-9 px-3"
      >
        {nextLabel}
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>

      {/* 今月ボタン */}
      {showToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToday}
          className="h-9 px-3"
        >
          <Calendar className="h-4 w-4 mr-1" />
          今月
        </Button>
      )}
    </div>
  )
})

