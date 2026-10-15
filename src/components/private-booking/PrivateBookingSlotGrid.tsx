// 貸切の候補日時の枠表（DB の空き判定の結果をそのまま出す）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { memo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'

const COLUMN_LABELS: ('午前' | '午後' | '夜')[] = ['午前', '午後', '夜']

export interface PrivateBookingSlotGridProps {
  currentMonth: Date
  onMonthChange: (delta: number) => void
  isPrevMonthDisabled: boolean
  isNextMonthDisabled?: boolean
  availableDates: string[]
  slotsByDate: Record<string, PrivateBookingSlot[]>
  selectedSlots: Array<{ date: string; slot: PrivateBookingSlot }>
  onSlotToggle: (date: string, slot: PrivateBookingSlot) => void
  maxSelections: number
  /** `${date}-${label}` → 選べない理由（DB の判定結果）。載っていない枠は選べる。灰色の枠を押すと理由を出す */
  unavailableReasons: Record<string, string>
  /** 保存済み候補は受付停止と区別して表示する。 */
  existingSlotKeys?: ReadonlySet<string>
  isCustomHoliday?: (date: string) => boolean
  colorScheme?: 'red' | 'purple'
  isTooSoon?: (date: string) => boolean
  loading?: boolean
  header?: ReactNode
  emptyMonth?: ReactNode
  /** Fixed max-height for the scrollable grid. Ignored when fillContainer is true. */
  maxHeight?: string
  /** When true, the component uses flex layout to fill its parent container. */
  fillContainer?: boolean
  compact?: boolean
}

export const PrivateBookingSlotGrid = memo(function PrivateBookingSlotGrid({
  currentMonth,
  onMonthChange,
  isPrevMonthDisabled,
  isNextMonthDisabled = false,
  availableDates,
  slotsByDate,
  selectedSlots,
  onSlotToggle,
  maxSelections,
  unavailableReasons,
  existingSlotKeys,
  isCustomHoliday,
  colorScheme = 'red',
  isTooSoon,
  loading = false,
  header,
  emptyMonth,
  maxHeight = '280px',
  fillContainer = false,
  compact = false,
}: PrivateBookingSlotGridProps) {
  const [notice, setNotice] = useState<string | null>(null)
  const selectedCount = selectedSlots.length
  const remainingSelections = maxSelections - selectedCount

  const isSlotSelected = (date: string, slot: PrivateBookingSlot): boolean =>
    selectedSlots.some(s => s.date === date && s.slot.label === slot.label)

  const selectedBg = colorScheme === 'purple' ? 'border-purple-600 bg-purple-600 text-white' : 'bg-[#E60012] text-white border-[#E60012]'
  const hoverBg = colorScheme === 'purple' ? 'border-gray-200 hover:border-purple-300 hover:bg-purple-50' : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
  const selectedTimeColor = colorScheme === 'purple' ? 'text-purple-100' : 'opacity-70'
  const accentColor = colorScheme === 'purple' ? 'text-purple-600' : 'text-red-600'

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中...
      </div>
    )
  }

  const textSize = compact ? 'text-[11px]' : 'text-sm'
  const smallText = compact ? 'text-[9px]' : 'text-xs'
  const tinyText = compact ? 'text-[8px]' : 'text-[10px]'
  const cellPy = compact ? 'py-1 sm:py-1.5' : 'py-1.5'
  const dateW = compact ? 'w-10 sm:w-11' : 'w-10'

  return (
    <div className={fillContainer ? 'flex min-h-0 flex-1 flex-col' : ''}>
      {header}

      {/* Month navigation */}
      <div className={`shrink-0 flex items-center justify-between ${compact ? 'px-0' : 'mb-2'}`}>
        <button
          type="button"
          onClick={() => onMonthChange(-1)}
          disabled={isPrevMonthDisabled}
          className="flex items-center gap-0.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" /> 前月
        </button>
        <span className="text-sm font-medium tabular-nums">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </span>
        <button
          type="button"
          onClick={() => onMonthChange(1)}
          disabled={isNextMonthDisabled}
          className="flex items-center gap-0.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          次月 <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Selection summary */}
      <div className={`shrink-0 ${tinyText} text-muted-foreground ${compact ? 'py-px' : 'mb-2'} text-center`}>
        {selectedCount === 0 ? (
          compact ? (
            <>タップで選択</>
          ) : (
            <span>候補日時を選択してください（最大{maxSelections}件）</span>
          )
        ) : remainingSelections > 0 ? (
          <span>
            <span className={`font-medium ${accentColor}`}>{selectedCount}件</span>選択中
            {!compact && (
              <>
                <span className="mx-1">·</span>
                あと<span className="font-medium">{remainingSelections}件</span>選択可能
              </>
            )}
          </span>
        ) : (
          <span className="text-orange-600 font-medium">選択上限に達しました（{maxSelections}件）</span>
        )}
      </div>

      {notice && (
        <p role="status" aria-live="polite" className={`shrink-0 ${smallText} text-center font-medium text-amber-700 ${compact ? 'py-px' : 'mb-2'}`}>
          {notice}
        </p>
      )}

      {/* Grid */}
      <div
        className={`overflow-y-auto border ${compact ? 'rounded-sm border-gray-200/90 bg-white px-1 py-1 sm:px-1.5 sm:py-1.5' : 'p-2'} ${fillContainer ? 'min-h-0 flex-1 basis-0' : ''}`}
        style={fillContainer ? undefined : { maxHeight }}
      >
        {availableDates.length === 0 ? (
          emptyMonth ?? (
            <div className="space-y-2 px-2 py-6 text-center text-xs text-muted-foreground">
              <p>今月に選択可能な日がありません。</p>
            </div>
          )
        ) : (
          <>
            {compact && (
              <>
                <div className="mb-1 flex items-center gap-1 border-b border-gray-200 pb-1">
                  <div className={`${dateW} shrink-0`} />
                  {COLUMN_LABELS.map(label => (
                    <div key={label} className="flex-1 text-center text-[9px] text-muted-foreground sm:text-[10px]">
                      {label}
                    </div>
                  ))}
                </div>
                <p className="mb-1 hidden text-center text-[9px] leading-snug text-muted-foreground sm:block">
                  時刻は店舗の営業設定に基づきます
                </p>
              </>
            )}

            {availableDates.map(date => {
              const dateObj = new Date(date + 'T00:00:00+09:00')
              const month = dateObj.getMonth() + 1
              const day = dateObj.getDate()
              const weekdays = ['日', '月', '火', '水', '木', '金', '土']
              const weekday = weekdays[dateObj.getDay()]
              const dayOfWeek = dateObj.getDay()
              const isHoliday = isJapaneseHoliday(date) || isCustomHoliday?.(date)
              const weekdayColor =
                isHoliday || dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''

              const tooSoon = isTooSoon?.(date) ?? false
              const daySlots = slotsByDate[date] || []

              return (
                <div
                  key={date}
                  className={`flex items-stretch gap-${compact ? '1' : '1.5'} border-b border-gray-100 ${cellPy} last:border-b-0 ${tooSoon ? 'opacity-50' : ''}`}
                >
                  <div className={`flex ${dateW} shrink-0 flex-col justify-center text-center leading-tight ${compact ? 'gap-0.5' : ''}`}>
                    <div className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold tabular-nums`}>{month}/{day}</div>
                    <div className={`${smallText} ${weekdayColor}`}>({weekday})</div>
                  </div>

                  {compact ? (
                    COLUMN_LABELS.map(label => {
                      const slot = daySlots.find(s => s.label === label)
                      if (!slot) {
                        return (
                          <div
                            key={label}
                            className="flex min-h-[2.35rem] flex-1 cursor-not-allowed items-center justify-center rounded border border-gray-100 bg-gray-50 px-1 py-1.5 text-center opacity-40 sm:min-h-0 sm:py-2"
                          >
                            <div className="text-[10px] text-muted-foreground">—</div>
                          </div>
                        )
                      }
                      return renderSlotCell(slot, date, tooSoon)
                    })
                  ) : (
                    <div className="flex gap-1.5 flex-1">
                      {COLUMN_LABELS.map(label => {
                        const slot = daySlots.find(s => s.label === label)
                        if (!slot) {
                          return (
                            <div
                              key={label}
                              className="flex-1 py-1 px-1 border border-gray-100 bg-gray-50 text-center opacity-40 cursor-not-allowed rounded-sm"
                            >
                              <div className="text-xs font-medium text-muted-foreground">{label}</div>
                              <div className="text-[10px] text-muted-foreground">—</div>
                            </div>
                          )
                        }
                        return renderSlotCell(slot, date, tooSoon)
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )

  function renderSlotCell(slot: PrivateBookingSlot, date: string, tooSoon: boolean) {
    const key = `${date}-${slot.label}`
    const isExisting = existingSlotKeys?.has(key) ?? false
    const reason = unavailableReasons[key]
    const isAvailable = !isExisting && !tooSoon && !reason && !!slot.startTime
    const isSelected = isSlotSelected(date, slot)
    const canSelect = isAvailable && (isSelected || selectedCount < maxSelections)
    // 選べない枠は灰色のまま押せる（理由を出すだけ）
    const explain = !isExisting && !isAvailable ? (reason ?? (tooSoon ? '受付締切を過ぎています' : '選択できません')) : null
    // 前後の公演から逆算して標準からずらした時刻は「に調整」と添える
    const adjusted = !isExisting && isAvailable && slot.adjusted === true
    const timeText = isExisting ? '追加済み' : slot.startTime ? `${slot.startTime}〜${slot.endTime}` : '—'
    const adjustedNote = adjusted ? <span className={`block ${isSelected ? '' : 'text-amber-700'}`}>に調整</span> : null
    const handleClick = () => {
      if (explain) {
        setNotice(`${date.slice(5).replace('-', '/')} ${slot.label}: ${explain}`)
        return
      }
      if (canSelect) {
        setNotice(null)
        onSlotToggle(date, slot)
      }
    }
    const stateClass = isExisting
      ? 'cursor-not-allowed border-purple-200 bg-purple-50'
      : !isAvailable
      ? 'cursor-help border-gray-100 bg-gray-100 text-muted-foreground opacity-60'
      : isSelected
      ? selectedBg
      : canSelect
      ? hoverBg
      : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
    const ariaLabel = `${date} ${slot.label}${isExisting ? ' 追加済み' : explain ? ` 選択不可（${explain}）` : adjusted ? ` ${timeText} に調整` : ''}`

    if (compact) {
      return (
        <button
          key={slot.label}
          type="button"
          className={`flex-1 rounded border px-1 py-1.5 text-center leading-tight transition-colors sm:px-1 sm:py-2 ${stateClass}`}
          aria-label={ariaLabel}
          aria-disabled={!canSelect}
          disabled={isExisting || (!explain && !canSelect)}
          onClick={handleClick}
        >
          <div className="text-[11px] font-medium sm:text-xs">{slot.label}</div>
          <div className={`mt-0.5 text-[8px] leading-snug sm:text-[9px] ${isSelected ? selectedTimeColor : 'text-muted-foreground'}`}>
            {timeText}
            {adjustedNote}
          </div>
        </button>
      )
    }

    return (
      <button
        key={slot.label}
        type="button"
        className={`flex-1 py-1 px-1 border text-center transition-colors ${stateClass}`}
        aria-label={ariaLabel}
        aria-disabled={!canSelect}
        disabled={isExisting || (!explain && !canSelect)}
        onClick={handleClick}
      >
        <div className="text-xs font-medium">{slot.label}</div>
        <div className={`text-[10px] ${isSelected ? selectedTimeColor : 'opacity-70'}`}>
          {timeText}
          {adjustedNote}
        </div>
      </button>
    )
  }
})
