// 貸切の候補日時の枠表（DB の空き判定の結果をそのまま出す）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
// 見た目の正本（compact）: 候補日の追加・編集の見本（2026-10-11、スマホ全画面）。
//   枠表は内側でスクロールさせない（スクロールは画面・ダイアログ全体の 1 つだけ）。
import { memo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'

const COLUMN_LABELS: ('午前' | '午後' | '夜')[] = ['午前', '午後', '夜']
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

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
  /** 月の切り替えと案内の帯を、親のスクロールの上端に貼り付ける（sticky）。ダイアログで使う */
  stickyHeader?: boolean
  /** 月の切り替え・案内の帯・枠表の左右の余白（全幅の帯の中で文字だけ内側に寄せる） */
  insetClassName?: string
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
  stickyHeader = false,
  insetClassName = '',
  compact = false,
}: PrivateBookingSlotGridProps) {
  const [notice, setNotice] = useState<string | null>(null)
  const selectedCount = selectedSlots.length
  const remainingSelections = maxSelections - selectedCount

  const isSlotSelected = (date: string, slot: PrivateBookingSlot): boolean =>
    selectedSlots.some(s => s.date === date && s.slot.label === slot.label)

  const purple = colorScheme === 'purple'
  const selectedBg = purple ? 'border-purple-600 bg-purple-600 text-white' : 'bg-[#E60012] text-white border-[#E60012]'
  const hoverBg = purple ? 'border-gray-300 bg-white hover:border-purple-300 hover:bg-purple-50' : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
  const accentColor = purple ? 'text-purple-700' : 'text-red-600'

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-1.5 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        読み込み中...
      </div>
    )
  }

  const monthNav = (
    <div className={`flex items-center justify-between ${compact ? `border-b border-border py-1.5 ${insetClassName}` : 'mb-2'}`}>
      <button
        type="button"
        onClick={() => onMonthChange(-1)}
        disabled={isPrevMonthDisabled}
        className={`flex items-center gap-0.5 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${purple && compact ? 'text-purple-700 hover:text-purple-900' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <ChevronLeft className="h-4 w-4" /> 前月
      </button>
      <span className={`${compact ? 'text-base font-bold' : 'text-sm font-medium'} tabular-nums`}>
        {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
      </span>
      <button
        type="button"
        onClick={() => onMonthChange(1)}
        disabled={isNextMonthDisabled}
        className={`flex items-center gap-0.5 px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${purple && compact ? 'text-purple-700 hover:text-purple-900' : 'text-muted-foreground hover:text-foreground'}`}
      >
        次月 <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )

  const noticeLine = notice && (
    <p role="status" aria-live="polite" className={`text-xs font-medium text-amber-700 ${compact ? 'pt-0.5' : 'mb-2 text-center'}`}>
      {notice}
    </p>
  )

  // compact: 案内の帯（押して選ぶ・灰色は選べない・追加済み）と件数を 1 か所に
  const guideBand = compact ? (
    <div className={`border-b border-purple-100 bg-purple-50 py-1.5 text-xs leading-snug text-purple-800 ${insetClassName}`} data-testid="slot-grid-guide">
      <div className="flex items-start justify-between gap-2">
        <span>
          押して選ぶ（最大 {maxSelections} 件）。灰色は選べない枠、押すと理由が出ます
        </span>
        {selectedCount > 0 && (
          <span className={`shrink-0 font-bold ${remainingSelections > 0 ? accentColor : 'text-orange-600'}`}>{selectedCount}件選択中</span>
        )}
      </div>
      {noticeLine}
    </div>
  ) : (
    <>
      <div className="mb-2 text-center text-xs text-muted-foreground">
        {selectedCount === 0 ? (
          <span>候補日時を選択してください（最大{maxSelections}件）</span>
        ) : remainingSelections > 0 ? (
          <span>
            <span className={`font-medium ${accentColor}`}>{selectedCount}件</span>選択中
            <span className="mx-1">·</span>
            あと<span className="font-medium">{remainingSelections}件</span>選択可能
          </span>
        ) : (
          <span className="font-medium text-orange-600">選択上限に達しました（{maxSelections}件）</span>
        )}
      </div>
      {noticeLine}
    </>
  )

  return (
    <div>
      {header}

      <div className={stickyHeader ? 'sticky top-0 z-10 bg-background' : ''} data-testid="slot-grid-header">
        {monthNav}
        {guideBand}
      </div>

      {/* 縦は内側でスクロールさせない。狭い画面で横にはみ出すときだけ横スクロールし、日付の列は固定 */}
      <div className={`overflow-x-auto ${compact ? `py-1.5 ${insetClassName}` : 'border p-2'}`} data-testid="slot-grid-body">
        {availableDates.length === 0 ? (
          emptyMonth ?? (
            <div className="space-y-2 px-2 py-6 text-center text-xs text-muted-foreground">
              <p>今月に選択可能な日がありません。</p>
            </div>
          )
        ) : (
          <div className={compact ? 'min-w-72 space-y-1.5' : ''}>
            {compact && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="sticky left-0 z-[1] w-11 shrink-0 bg-background">日付</div>
                {COLUMN_LABELS.map(label => (
                  <div key={label} className="flex-1 text-center">{label}</div>
                ))}
              </div>
            )}

            {availableDates.map(date => {
              const dateObj = new Date(date + 'T00:00:00+09:00')
              const month = dateObj.getMonth() + 1
              const day = dateObj.getDate()
              const dayOfWeek = dateObj.getDay()
              const isHoliday = isJapaneseHoliday(date) || isCustomHoliday?.(date)
              const weekdayColor =
                isHoliday || dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : 'text-muted-foreground'

              const tooSoon = isTooSoon?.(date) ?? false
              const daySlots = slotsByDate[date] || []

              return (
                <div
                  key={date}
                  className={compact
                    ? `flex items-stretch gap-1.5 ${tooSoon ? 'opacity-50' : ''}`
                    : `flex items-stretch gap-1.5 border-b border-gray-100 py-1.5 last:border-b-0 ${tooSoon ? 'opacity-50' : ''}`}
                >
                  <div className={`sticky left-0 z-[1] flex shrink-0 flex-col justify-center bg-background leading-tight ${compact ? 'w-11 text-left' : 'w-10 text-center'}`}>
                    <div className="text-sm font-bold tabular-nums">{month}/{day}</div>
                    <div className={`text-xs ${weekdayColor}`}>({WEEKDAYS[dayOfWeek]})</div>
                  </div>

                  {COLUMN_LABELS.map(label => {
                    const slot = daySlots.find(s => s.label === label)
                    if (!slot) {
                      return (
                        <div
                          key={label}
                          className={`flex min-w-16 flex-1 cursor-not-allowed flex-col items-center justify-center border border-gray-200 bg-gray-50 px-1 text-center leading-tight text-muted-foreground ${compact ? 'min-h-14 rounded-lg' : 'min-h-12 rounded-sm'}`}
                        >
                          <div className="text-xs">{label}</div>
                          <div className="text-xs">–</div>
                        </div>
                      )
                    }
                    return renderSlotCell(slot, date, tooSoon)
                  })}
                </div>
              )
            })}
          </div>
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
    const timeText = slot.startTime ? `${slot.startTime}〜${slot.endTime}` : '—'
    // 2 行目: 追加済み／選べない理由（1 行）／時刻（調整したときは「に調整」）
    // 時刻の途中では折り返さない（折り返すなら「に調整」の前で）
    const subText = isExisting ? '追加済み' : explain ?? (
      <>
        <span className="whitespace-nowrap">{timeText}</span>
        {adjusted && <> <span className="whitespace-nowrap">に調整</span></>}
      </>
    )
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
      ? 'cursor-not-allowed border-purple-200 bg-purple-50 text-purple-800'
      : !isAvailable
      ? 'cursor-help border-gray-200 bg-gray-50 text-muted-foreground'
      : isSelected
      ? `${selectedBg} font-bold`
      : canSelect
      ? hoverBg
      : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
    const subColor = isSelected ? 'font-normal' : isExisting ? '' : adjusted ? 'text-amber-700' : 'text-muted-foreground'
    const ariaLabel = `${date} ${slot.label}${isExisting ? ' 追加済み' : explain ? ` 選択不可（${explain}）` : adjusted ? ` ${timeText} に調整` : ''}`

    return (
      <button
        key={slot.label}
        type="button"
        className={`flex min-w-16 flex-1 flex-col items-center justify-center border px-1 text-center leading-tight transition-colors ${compact ? 'min-h-14 rounded-lg' : 'min-h-12 rounded-sm'} ${stateClass}`}
        aria-label={ariaLabel}
        aria-disabled={!canSelect}
        disabled={isExisting || (!explain && !canSelect)}
        onClick={handleClick}
      >
        <span className="text-xs">{slot.label}</span>
        <span className={`mt-0.5 text-xs ${explain ? 'line-clamp-1' : ''} ${subColor}`}>{subText}</span>
      </button>
    )
  }
})
