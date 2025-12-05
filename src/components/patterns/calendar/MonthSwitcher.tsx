import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { memo, useEffect, useCallback } from 'react'

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
  /**
   * キーボード操作を有効にするか (← → キーで月移動、Home で今月)
   */
  enableKeyboard?: boolean
  /**
   * URL同期を有効にするか (queryParamName指定時のみ)
   */
  urlSync?: {
    /** URL param名 (例: 'month') */
    paramName: string
    /** URL更新時のフォーマット (デフォルト: 'YYYY-MM') */
    format?: 'YYYY-MM' | 'YYYY-MM-DD'
  }
  /**
   * カスタムクラス名
   */
  className?: string
}

/**
 * 月表示切り替えUI（共通コンポーネント）
 * 
 * すべての画面で統一されたデザインとUXを提供します。
 * 
 * 機能:
 * - キーボード操作 (← → で月移動、Home で今月)
 * - 境界ケース対応 (年跨ぎ、12月→1月)
 * - オプションのURL同期
 * - aria-label でアクセシビリティ対応
 * 
 * @example
 * ```tsx
 * <MonthSwitcher
 *   value={currentDate}
 *   onChange={setCurrentDate}
 *   showToday
 *   quickJump
 *   enableKeyboard
 * />
 * ```
 */
export const MonthSwitcher = memo(function MonthSwitcher({
  value,
  onChange,
  showToday = true,
  quickJump = false,
  prevLabel = '前月',
  nextLabel = '次月',
  enableKeyboard = true,
  urlSync,
  className = ''
}: MonthSwitcherProps) {
  const year = value.getFullYear()
  const month = value.getMonth() + 1

  /**
   * 前月へ移動
   * 境界ケース: 1月 → 前年12月
   * タイムゾーン安全な実装
   */
  const handlePrevMonth = useCallback(() => {
    const year = value.getFullYear()
    const month = value.getMonth()
    
    // 前月の1日を作成（タイムゾーンに依存しない）
    const newYear = month === 0 ? year - 1 : year
    const newMonth = month === 0 ? 11 : month - 1
    const newDate = new Date(newYear, newMonth, 1, 12, 0, 0, 0)
    
    onChange(newDate)
  }, [value, onChange])

  /**
   * 次月へ移動
   * 境界ケース: 12月 → 翌年1月
   * タイムゾーン安全な実装
   */
  const handleNextMonth = useCallback(() => {
    const year = value.getFullYear()
    const month = value.getMonth()
    
    // 次月の1日を作成（タイムゾーンに依存しない）
    const newYear = month === 11 ? year + 1 : year
    const newMonth = month === 11 ? 0 : month + 1
    const newDate = new Date(newYear, newMonth, 1, 12, 0, 0, 0)
    
    onChange(newDate)
  }, [value, onChange])

  /**
   * 今月へ移動
   * タイムゾーン安全な実装
   */
  const handleToday = useCallback(() => {
    const now = new Date()
    const newDate = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
    onChange(newDate)
  }, [onChange])

  /**
   * 年を変更
   * タイムゾーン安全な実装
   */
  const handleYearChange = useCallback((newYear: string) => {
    const month = value.getMonth()
    const newDate = new Date(parseInt(newYear, 10), month, 1, 12, 0, 0, 0)
    onChange(newDate)
  }, [value, onChange])

  /**
   * 月を変更
   * タイムゾーン安全な実装
   */
  const handleMonthChange = useCallback((newMonth: string) => {
    const year = value.getFullYear()
    const newDate = new Date(year, parseInt(newMonth, 10) - 1, 1, 12, 0, 0, 0)
    onChange(newDate)
  }, [value, onChange])

  /**
   * キーボードショートカット
   * ← → で月移動、Home で今月
   */
  useEffect(() => {
    if (!enableKeyboard) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // input/textarea/select要素内では無効
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handlePrevMonth()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNextMonth()
          break
        case 'Home':
          e.preventDefault()
          handleToday()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enableKeyboard, handlePrevMonth, handleNextMonth, handleToday])

  /**
   * URL同期 (オプション)
   */
  useEffect(() => {
    if (!urlSync) return

    const params = new URLSearchParams(window.location.search)
    const format = urlSync.format || 'YYYY-MM'
    
    let formattedDate: string
    if (format === 'YYYY-MM-DD') {
      formattedDate = value.toISOString().split('T')[0]
    } else {
      formattedDate = `${year}-${month.toString().padStart(2, '0')}`
    }

    params.set(urlSync.paramName, formattedDate)
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }, [value, year, month, urlSync])

  /**
   * 年の範囲を生成 (現在年の前後2年、計5年)
   */
  const yearRange = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

  return (
    <div className={`flex items-center gap-2 ${className}`} role="group" aria-label="月選択">
      {/* 前月ボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevMonth}
        className="flex-shrink-0"
        aria-label={`前月へ移動 (${prevLabel})`}
        title="← キーでも移動できます"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* 年月表示 / 選択 */}
      {quickJump ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Select value={year.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[100px] whitespace-nowrap" aria-label="年を選択">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearRange.map(y => (
                <SelectItem key={y} value={y.toString()}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={month.toString()} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-[80px] whitespace-nowrap" aria-label="月を選択">
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
        <div 
          className="font-bold min-w-[120px] text-center whitespace-nowrap" 
          aria-live="polite"
          aria-atomic="true"
        >
          {year}年{month}月
        </div>
      )}

      {/* 次月ボタン */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleNextMonth}
        className="flex-shrink-0"
        aria-label={`次月へ移動 (${nextLabel})`}
        title="→ キーでも移動できます"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
})
