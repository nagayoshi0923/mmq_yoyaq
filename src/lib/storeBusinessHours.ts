export interface SlotTimes {
  morning: string
  afternoon: string
  evening: string
}

export interface DayHours {
  is_open: boolean
  open_time: string
  close_time: string
  available_slots: ('morning' | 'afternoon' | 'evening')[] // 受付可能な公演枠
  slot_start_times?: SlotTimes // 公演枠ごとの開始時間（オプション）
}

export interface OpeningHours {
  monday: DayHours
  tuesday: DayHours
  wednesday: DayHours
  thursday: DayHours
  friday: DayHours
  saturday: DayHours
  sunday: DayHours
}

export const weekdays = [
  { value: 'monday', label: '月曜日', short: '月' },
  { value: 'tuesday', label: '火曜日', short: '火' },
  { value: 'wednesday', label: '水曜日', short: '水' },
  { value: 'thursday', label: '木曜日', short: '木' },
  { value: 'friday', label: '金曜日', short: '金' },
  { value: 'saturday', label: '土曜日', short: '土' },
  { value: 'sunday', label: '日曜日', short: '日' }
] as const

// 公演枠の定義
export const slotOptions = [
  { value: 'morning' as const, label: '朝公演', defaultTime: '10:00' },
  { value: 'afternoon' as const, label: '昼公演', defaultTime: '14:00' },
  { value: 'evening' as const, label: '夜公演', defaultTime: '18:00' }
]

// デフォルトの開始時間（土日祝用）
export const defaultSlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '14:00',
  evening: '19:00'
}

// 平日用の開始時間（昼公演は13:00開始）
export const weekdaySlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '13:00',
  evening: '19:00'
}

// デフォルトの営業時間設定
export const defaultWeekdayHours: DayHours = {
  is_open: true,
  open_time: '13:00',
  close_time: '23:00',
  available_slots: ['afternoon', 'evening'],
  slot_start_times: weekdaySlotTimes
}
export const defaultWeekendHours: DayHours = {
  is_open: true,
  open_time: '09:00',
  close_time: '23:00',
  available_slots: ['morning', 'afternoon', 'evening'], // 土日は全公演
  slot_start_times: defaultSlotTimes
}

function cloneDayHours(day: DayHours): DayHours {
  return { ...day, available_slots: [...day.available_slots], slot_start_times: { ...day.slot_start_times! } }
}

export const getDefaultOpeningHours = (): OpeningHours => ({
  monday: cloneDayHours(defaultWeekdayHours),
  tuesday: cloneDayHours(defaultWeekdayHours),
  wednesday: cloneDayHours(defaultWeekdayHours),
  thursday: cloneDayHours(defaultWeekdayHours),
  friday: cloneDayHours(defaultWeekdayHours),
  saturday: cloneDayHours(defaultWeekendHours),
  sunday: cloneDayHours(defaultWeekendHours)
})

// DBから取得したデータにデフォルト値をマージする関数
// slot_start_timesなどが欠けている古いデータ用
export const mergeWithDefaults = (dbOpeningHours: OpeningHours | null): OpeningHours => {
  const defaults = getDefaultOpeningHours()
  if (!dbOpeningHours) return defaults

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const result: OpeningHours = { ...defaults }

  for (const day of weekdays) {
    const isWeekend = day === 'saturday' || day === 'sunday'
    const defaultHours = isWeekend ? defaultWeekendHours : defaultWeekdayHours
    const dbDay = dbOpeningHours[day]

    if (dbDay) {
      // slot_start_timesは個々のプロパティをマージ（部分的に設定されている場合に対応）
      const mergedSlotTimes: SlotTimes = {
        morning: dbDay.slot_start_times?.morning || defaultHours.slot_start_times?.morning || '10:00',
        afternoon: dbDay.slot_start_times?.afternoon || defaultHours.slot_start_times?.afternoon || '13:00',
        evening: dbDay.slot_start_times?.evening || defaultHours.slot_start_times?.evening || '19:00'
      }

      // DBのデータがある場合、デフォルトとマージ
      result[day] = {
        ...defaultHours,  // まずデフォルトを適用
        ...dbDay,         // DBのデータで上書き
        // slot_start_timesは個々のプロパティをマージ
        slot_start_times: mergedSlotTimes,
        // available_slotsも同様
        available_slots: [...(dbDay.available_slots || defaultHours.available_slots)]
      }
    }
  }

  return result
}


export interface BusinessHoursData {
  id: string
  store_id: string
  opening_hours: OpeningHours | null
  holidays: string[]
  special_open_days: { date: string; note: string }[]
  special_closed_days: { date: string; note: string }[]
}

export function normalizeBusinessHoursData(storeId: string, data: Partial<BusinessHoursData> | null): BusinessHoursData {
  // 古いholidaysだけの設定も保持し、備考付きの日付と合流する。
  const closed = (data?.special_closed_days ?? []).map(day => ({ ...day }))
  for (const date of data?.holidays ?? []) {
    if (date && !closed.some(day => day.date === date)) closed.push({ date, note: '' })
  }
  return {
    id: data?.id ?? '',
    store_id: storeId,
    opening_hours: mergeWithDefaults(data?.opening_hours ?? null),
    holidays: [...(data?.holidays ?? [])],
    special_open_days: (data?.special_open_days ?? []).map(day => ({ ...day })),
    special_closed_days: closed,
  }
}

export function businessHoursSaveFields(data: BusinessHoursData) {
  return {
    opening_hours: mergeWithDefaults(data.opening_hours),
    holidays: [...new Set(data.special_closed_days.map(day => day.date).filter(Boolean))].sort(),
    special_open_days: data.special_open_days.map(day => ({ ...day })),
    special_closed_days: data.special_closed_days.map(day => ({ ...day })),
  }
}
