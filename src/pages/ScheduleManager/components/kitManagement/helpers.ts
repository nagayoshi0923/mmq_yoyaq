import { formatJstMonthDay } from '@/utils/jstDate'

// 曜日の選択肢
export const WEEKDAYS = [
  { value: 0, label: '日曜日', short: '日' },
  { value: 1, label: '月曜日', short: '月' },
  { value: 2, label: '火曜日', short: '火' },
  { value: 3, label: '水曜日', short: '水' },
  { value: 4, label: '木曜日', short: '木' },
  { value: 5, label: '金曜日', short: '金' },
  { value: 6, label: '土曜日', short: '土' },
]

// 日時を「M/D(曜)」形式でフォーマット
export const formatCompletionDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  return formatJstMonthDay(dateStr, true)
}
