import { getPerStoreSlotsForDate, type BusinessHoursSettingRow } from './privateGroupCandidateSlots'
import { buildPrivateBookingBlockedSlotIndex, getPrivateBookingCandidateBlockedState, type PrivateBookingBlockedSlotRow } from './privateBookingBlockedSlotAvailability'
import { getPrivateBookingStoreSlotFeasibility } from './privateBookingStoreSlotFeasibility'

type Slot = 'morning' | 'afternoon' | 'evening'
type Event = { store_id?: string | null; date?: string | null; start_time?: string | null; end_time?: string | null }

/** 作品選択前の入口。受付可能な店舗とその開始時刻だけを返す。 */
export function getPublicPrivateBookingSlotOptions(date: string, slot: Slot, storeIds: string[], hours: Map<string, BusinessHoursSettingRow>, blocked: PrivateBookingBlockedSlotRow[], events: Event[], isCustomHoliday: (date: string) => boolean) {
  const available = getPrivateBookingCandidateBlockedState({ date, timeSlot: slot }, storeIds, buildPrivateBookingBlockedSlotIndex(blocked)).availableStoreIds
  return available.flatMap(storeId => {
    const row = hours.get(storeId)
    // 未設定店は設定画面と同じ既定値で扱う。取得エラーは呼び出し元で閉じる。
    const bounds = getPerStoreSlotsForDate(date, row, isCustomHoliday, { allowSyntheticWhenMissingRow: true, respectConfiguredHours: true })?.find(band => band.key === slot)
    if (!bounds) return []
    const feasibility = getPrivateBookingStoreSlotFeasibility(date, storeId, slot, row, events, isCustomHoliday, true, 60, true)
    if (!feasibility || feasibility.minAllowedStart >= bounds.endMin) return []
    // この枠を占有する公演は、公開・非公開を問わず入口から除く。
    const occupied = events.some(event => {
      if (event.store_id !== storeId || !event.date || !event.start_time) return false
      const offset = (Date.parse(`${event.date}T00:00:00+09:00`) - Date.parse(`${date}T00:00:00+09:00`)) / 60000
      const [h, m] = event.start_time.split(':').map(Number)
      const start = offset + h * 60 + m
      return start >= bounds.startMin && start < bounds.endMin
    })
    if (occupied) return []
    const start = feasibility.minAllowedStart
    return [{ storeId, startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` }]
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))
}
