/**
 * 公演の詳細画面を開いたときの入力欄の値（編集・追加）。PerformanceModal.tsx から規則を変えずに切り出した純粋な関数。
 */
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import { scheduleTimeSlotToEn, timeSlotEnToSchedule } from '@/lib/timeSlot'
import type { Scenario } from '@/types'
import type { EventFormData, ScheduleEvent } from '@/types/schedule'
import type { reservationApi } from '@/lib/reservationApi'

export type TimeSlotEn = 'morning' | 'afternoon' | 'evening'

/** デフォルト時間設定のフォールバック（設定がロードされていない場合に使用） */
export const DEFAULT_TIME_SLOTS: Record<TimeSlotEn, { start_time: string; end_time: string }> = {
  morning: { start_time: '10:00', end_time: '14:00' },
  afternoon: { start_time: '14:30', end_time: '18:30' },
  evening: { start_time: '19:00', end_time: '23:00' }
}

/**
 * 公演の作品を選択肢から探す。タイトル完全一致を優先し、一致しない場合は scenario_master_id で照合する
 * （同一シナリオでもマスタ名と組織側の表示名が食い違うと「未登録」誤表示になるため）。
 */
export function findEventScenario(scenarios: Scenario[], event: Pick<ScheduleEvent, 'scenario'> & { scenario_master_id?: string }): Scenario | undefined {
  const eventMasterId = event.scenario_master_id
  return scenarios.find(s => s.title === event.scenario) ||
    (eventMasterId
      ? scenarios.find(s => s.scenario_master_id === eventMasterId || s.id === eventMasterId)
      : undefined)
}

/** 時間帯: time_slot があればそれ、無ければ開始時刻から（12 時前=朝、17 時前=昼、それ以降=夜） */
export function resolveEventTimeSlot(event: Pick<ScheduleEvent, 'time_slot' | 'start_time'>): TimeSlotEn {
  if (event.time_slot) return scheduleTimeSlotToEn(event.time_slot) ?? 'morning'
  const startHour = parseInt(event.start_time.split(':')[0])
  if (startHour < 12) return 'morning'
  if (startHour < 17) return 'afternoon'
  return 'evening'
}

/** 編集で開いたときの入力欄（担当とスタッフ参加は取り直した値を使う） */
export function buildEditFormData(
  event: ScheduleEvent,
  selectedScenario: Scenario | undefined,
  slot: TimeSlotEn,
  participation: Pick<Awaited<ReturnType<typeof reservationApi.getStaffParticipation>>, 'entries' | 'assignment'>,
): EventFormData {
  return {
    ...event,
    gms: participation.assignment.gms,
    staffParticipation: { entries: participation.entries.filter(entry => !entry.needs_confirmation), expected: participation.entries, expectedStaff: participation.assignment },
    // master_id で照合できた場合は登録済みの表示名にそろえる（「未登録」警告の誤表示を防ぐ）
    scenario: selectedScenario?.title ?? event.scenario,
    scenario_master_id: selectedScenario?.id,  // scenario_masters.id
    time_slot: event.time_slot || timeSlotEnToSchedule(slot), // time_slotを設定
    max_participants: selectedScenario?.player_count_max ?? event.max_participants ?? DEFAULT_MAX_PARTICIPANTS, // シナリオの参加人数を反映
    gmRoles: participation.assignment.gm_roles, // 既存の役割があれば設定
    capacity: event.max_participants || 0, // capacityを追加
    is_private_request: event.is_private_request, // 貸切リクエストフラグを明示的に引き継ぎ
    reservation_id: event.reservation_id, // 予約IDを明示的に引き継ぎ
    reservation_name: event.reservation_name || '' // 予約者名を明示的に引き継ぎ
  }
}

/**
 * 追加で開いたときの終了時刻: 時間帯の既定の終了時刻。ただし開始時刻より前になる場合は開始 + 4 時間。
 */
export function resolveAddEndTime(startTime: string, slotDefaultEndTime: string): string {
  let endTime = slotDefaultEndTime
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [defaultEndHour, defaultEndMinute] = slotDefaultEndTime.split(':').map(Number)
  const startMinutes = startHour * 60 + startMinute
  const defaultEndMinutes = defaultEndHour * 60 + defaultEndMinute
  // 終了時間が開始時間より前になる場合は、開始時間 + 4時間に設定
  if (defaultEndMinutes <= startMinutes) {
    const newEndMinutes = startMinutes + 240 // 4時間 = 240分
    const newEndHour = Math.floor(newEndMinutes / 60)
    const newEndMinute = newEndMinutes % 60
    endTime = `${String(newEndHour).padStart(2, '0')}:${String(newEndMinute).padStart(2, '0')}`
  }
  return endTime
}

/** 追加で開いたときの入力欄（空き枠のメモは備考に引き継ぐ） */
export function buildAddFormData({ id, date, venue, startTime, endTime, notes }: { id: string; date: string; venue: string; startTime: string; endTime: string; notes: string }): EventFormData {
  return {
    id,
    date,
    venue,
    scenario: '',
    gms: [],
    gmRoles: {},
    staffParticipation: { entries: [], expected: [], expectedStaff: {gms: [], gm_roles: {}} },
    start_time: startTime,
    end_time: endTime,
    category: 'open',
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    capacity: 0,
    notes,  // スロットメモを備考に引き継ぎ
    reservation_name: ''  // 予約者名（初期値は空）
  }
}
