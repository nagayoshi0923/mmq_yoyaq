// 作品ページの貸切タブの上に出す「近い空き」「月ごとの空き数」「絞り込み」（段階1、2026-11-14 QW-20261114-001）。
// 空き判定は DB の結果をそのまま並べるだけ（画面で計算しない）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { ChipButton } from '@/components/public-top/ChipButton'
import type { PrivateBookingSlot } from '@/lib/computePrivateBookingSlots'
import {
  formatMonthDayWeekday,
  type MonthCount,
  type OpenSlot,
  type OverviewSlotFilter,
  type PrivateBookingOverviewFilter,
} from '@/lib/privateBookingOverview'

const ACCENT = '#7c3aed'
const SLOT_FILTERS: Array<{ value: OverviewSlotFilter; label: string }> = [
  { value: 'all', label: 'すべての時間' },
  { value: '午前', label: '午前' },
  { value: '午後', label: '午後' },
  { value: '夜', label: '夜' },
]

export interface PrivateBookingAvailabilityOverviewProps {
  /** 絞り込み後の選べる枠（日付・時間帯の順） */
  openSlots: OpenSlot[]
  monthCounts: MonthCount[]
  /** 表示中の月（YYYY-MM） */
  currentYm: string
  filter: PrivateBookingOverviewFilter
  onFilterChange: (filter: PrivateBookingOverviewFilter) => void
  onPickSlot: (date: string, slot: PrivateBookingSlot) => void
  onPickMonth: (year: number, month: number) => void
  selectedKeys: ReadonlySet<string>
  loading?: boolean
  error?: string | null
  /** 近い空きに出す件数 */
  nearestCount?: number
}

export const PrivateBookingAvailabilityOverview = memo(function PrivateBookingAvailabilityOverview({
  openSlots,
  monthCounts,
  currentYm,
  filter,
  onFilterChange,
  onPickSlot,
  onPickMonth,
  selectedKeys,
  loading = false,
  error = null,
  nearestCount = 6,
}: PrivateBookingAvailabilityOverviewProps) {
  const nearest = openSlots.slice(0, nearestCount)

  return (
    <section className="space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-3" aria-label="空いている日" data-testid="private-booking-overview">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="絞り込み">
        <ChipButton selected={!filter.weekendOnly} primaryColor={ACCENT} onClick={() => onFilterChange({ ...filter, weekendOnly: false })}>すべての曜日</ChipButton>
        <ChipButton selected={filter.weekendOnly} primaryColor={ACCENT} onClick={() => onFilterChange({ ...filter, weekendOnly: true })}>土日祝だけ</ChipButton>
        {SLOT_FILTERS.map(f => (
          <ChipButton key={f.value} selected={filter.slot === f.value} primaryColor={ACCENT} onClick={() => onFilterChange({ ...filter, slot: f.value })}>{f.label}</ChipButton>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 ts-caption" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          空いている日を探しています…
        </p>
      ) : error ? (
        <p className="ts-caption" role="status">{error}（下の日付からは選べます）</p>
      ) : (
        <>
          <div>
            <h3 className="ts-label">近い空き（押すと候補に入ります）</h3>
            {nearest.length === 0 ? (
              <p className="ts-caption" data-testid="private-booking-overview-empty">
                この条件では申し込める空きがありません。絞り込みを外すか、希望店舗を増やすと見つかることがあります。
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" data-testid="private-booking-nearest">
                {nearest.map(({ date, slot }) => {
                  const key = `${date}-${slot.label}`
                  const selected = selectedKeys.has(key)
                  return (
                    <li key={key}>
                      <ChipButton
                        selected={selected}
                        primaryColor={ACCENT}
                        onClick={() => onPickSlot(date, slot)}
                        aria-label={`${date} ${slot.label} ${slot.startTime}〜${selected ? ' 選択中' : ''}`}
                      >
                        {formatMonthDayWeekday(date)} {slot.label} {slot.startTime}〜
                      </ChipButton>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="ts-label">月ごとの空き</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="private-booking-month-counts">
              {monthCounts.map(m => (
                <ChipButton
                  key={m.ym}
                  selected={m.ym === currentYm}
                  primaryColor={ACCENT}
                  disabled={m.count === 0}
                  className={m.count === 0 ? 'opacity-50' : undefined}
                  onClick={() => onPickMonth(m.year, m.month)}
                >
                  {m.month}月 {m.count > 0 ? `${m.count}枠` : '空きなし'}
                </ChipButton>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
})
