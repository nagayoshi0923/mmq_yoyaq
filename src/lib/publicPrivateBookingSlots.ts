import { getPerStoreSlotsForDate, type BusinessHoursSettingRow } from './privateGroupCandidateSlots'
import { buildPrivateBookingBlockedSlotIndex, getPrivateBookingCandidateBlockedState, type PrivateBookingBlockedSlotRow } from './privateBookingBlockedSlotAvailability'
import { getPrivateBookingStoreSlotFeasibility } from './privateBookingStoreSlotFeasibility'

type Slot = 'morning' | 'afternoon' | 'evening'
type Event = { store_id?: string | null; date?: string | null; start_time?: string | null; end_time?: string | null }

/**
 * 作品選択前の入口。受付可能な店舗とその開始時刻だけを返す。返した店舗の一覧がそのまま作品選択画面へ渡る（`store=`）。
 * 営業設定が無い店舗の既定の 3 枠（合成）は、DB（private_booking_store_day_slots の p_allow_missing）と同じく
 * 渡す店舗が 1 店だけのときだけ使う（issue #1203: 未設定の店舗を複数まとめて渡すと、作品選択後に同じ枠が選べなかった）。
 * 設定のある店舗で受付可能な店があればそれだけを返し、無ければ合成で受付可能な未設定の店舗がちょうど 1 店のときだけ返す。
 */
export function getPublicPrivateBookingSlotOptions(date: string, slot: Slot, storeIds: string[], hours: Map<string, BusinessHoursSettingRow>, blocked: PrivateBookingBlockedSlotRow[], events: Event[], isCustomHoliday: (date: string) => boolean) {
  const available = getPrivateBookingCandidateBlockedState({ date, timeSlot: slot }, storeIds, buildPrivateBookingBlockedSlotIndex(blocked)).availableStoreIds
  const options = (allowSynthetic: boolean) => available.flatMap(storeId => {
    const row = hours.get(storeId)
    const bounds = getPerStoreSlotsForDate(date, row, isCustomHoliday, { allowSyntheticWhenMissingRow: allowSynthetic, respectConfiguredHours: true })?.find(band => band.key === slot)
    if (!bounds) return []
    const feasibility = getPrivateBookingStoreSlotFeasibility(date, storeId, slot, row, events, isCustomHoliday, allowSynthetic, 60, true)
    if (!feasibility || feasibility.minAllowedStart >= bounds.endMin) return []
    // この枠を占有する公演は、公開・非公開を問わず入口から除く。
    const occupied = events.some(event => {
      if (event.store_id !== storeId || !event.date || !event.start_time) return false
      const offset = (Date.parse(`${event.date}T00:00:00+09:00`) - Date.parse(`${date}T00:00:00+09:00`)) / 60000
      const [h, m] = event.start_time.split(':').map(Number)
      const start = offset + h * 60 + m
      const bandStart = slot === 'morning' ? 0 : slot === 'afternoon' ? 12 * 60 : 18 * 60
      const bandEnd = slot === 'morning' ? 12 * 60 : slot === 'afternoon' ? 18 * 60 : 24 * 60
      return start >= bandStart && start < bandEnd
    })
    if (occupied) return []
    const start = feasibility.minAllowedStart
    return [{ storeId, startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` }]
  }).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const configured = options(false)
  if (configured.length > 0) return configured
  // 営業設定のある店舗で受付可能な店が無いときだけ、未設定の店舗を既定の 3 枠で見る。1 店だけなら DB も合成を使う
  const synthetic = options(true)
  return synthetic.length === 1 ? synthetic : []
}
