export interface SlotTimes {
  morning: string
  afternoon: string
  evening: string
}

export interface DayHours {
  is_open: boolean
  open_time: string
  close_time: string
  available_slots: ('morning' | 'afternoon' | 'evening')[]
  slot_start_times?: SlotTimes
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

export interface SpecialDay {
  date: string
  note: string
}

export const WEEKDAYS = [
  { value: 'monday', label: '月曜日', short: '月' },
  { value: 'tuesday', label: '火曜日', short: '火' },
  { value: 'wednesday', label: '水曜日', short: '水' },
  { value: 'thursday', label: '木曜日', short: '木' },
  { value: 'friday', label: '金曜日', short: '金' },
  { value: 'saturday', label: '土曜日', short: '土' },
  { value: 'sunday', label: '日曜日', short: '日' },
] as const

export const SLOT_OPTIONS = [
  { value: 'morning' as const, label: '朝公演', defaultTime: '10:00' },
  { value: 'afternoon' as const, label: '昼公演', defaultTime: '14:00' },
  { value: 'evening' as const, label: '夜公演', defaultTime: '18:00' },
]

export const defaultSlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '14:00',
  evening: '19:00',
}

export const weekdaySlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '13:00',
  evening: '19:00',
}

export const defaultWeekdayHours: DayHours = {
  is_open: true,
  open_time: '13:00',
  close_time: '23:00',
  available_slots: ['afternoon', 'evening'],
  slot_start_times: weekdaySlotTimes,
}

export const defaultWeekendHours: DayHours = {
  is_open: true,
  open_time: '09:00',
  close_time: '23:00',
  available_slots: ['morning', 'afternoon', 'evening'],
  slot_start_times: defaultSlotTimes,
}

export const getDefaultOpeningHours = (): OpeningHours => ({
  monday: { ...defaultWeekdayHours },
  tuesday: { ...defaultWeekdayHours },
  wednesday: { ...defaultWeekdayHours },
  thursday: { ...defaultWeekdayHours },
  friday: { ...defaultWeekdayHours },
  saturday: { ...defaultWeekendHours },
  sunday: { ...defaultWeekendHours },
})

export function mergeWithDefaults(dbOpeningHours: OpeningHours | null): OpeningHours {
  const defaults = getDefaultOpeningHours()
  if (!dbOpeningHours) return defaults

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const result: OpeningHours = { ...defaults }

  for (const day of days) {
    const isWeekend = day === 'saturday' || day === 'sunday'
    const defaultHours = isWeekend ? defaultWeekendHours : defaultWeekdayHours
    const dbDay = dbOpeningHours[day]

    if (dbDay) {
      const mergedSlotTimes: SlotTimes = {
        morning: dbDay.slot_start_times?.morning || defaultHours.slot_start_times?.morning || '10:00',
        afternoon: dbDay.slot_start_times?.afternoon || defaultHours.slot_start_times?.afternoon || '13:00',
        evening: dbDay.slot_start_times?.evening || defaultHours.slot_start_times?.evening || '19:00',
      }
      result[day] = {
        ...defaultHours,
        ...dbDay,
        slot_start_times: mergedSlotTimes,
        available_slots: dbDay.available_slots || defaultHours.available_slots,
      }
    }
  }

  return result
}

export function closedDaysFromSettings(
  specialClosedDays: SpecialDay[] | null | undefined,
  holidays: string[] | null | undefined
): SpecialDay[] {
  if (specialClosedDays && specialClosedDays.length > 0) return specialClosedDays
  return (holidays || []).filter(Boolean).map(date => ({ date, note: '' }))
}

export function holidaysFromClosedDays(days: SpecialDay[]): string[] {
  return [...new Set(days.map(d => d.date).filter(Boolean))].sort()
}
