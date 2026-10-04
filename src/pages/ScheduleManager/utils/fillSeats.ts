/**
 * 「満席にする」（デモ参加者で埋める）の計算。一括と単体の両方で同じ規則を使う（画面から切り出した純粋な関数）。
 */
import { RESERVATION_SOURCE } from '@/lib/constants'

export interface FillSeatsEvent {
  id: string
  date: string
  start_time: string
  scenario?: string | null
  scenario_master_id?: string | null
  scenario_id?: string | null
  store_id?: string | null
  gms?: string[] | null
  max_participants?: number | null
  capacity?: number | null
  scenario_masters?: unknown
}

/** 満席の人数: シナリオの最大人数 → 公演の最大人数 → 定員 → 8 人。定員を超えない */
export function resolveFillSeatsCapacity(event: Pick<FillSeatsEvent, 'scenario_masters' | 'max_participants' | 'capacity'>): number {
  const scenarioMax = (event.scenario_masters as { player_count_max?: number } | null)?.player_count_max
  const baseMax = scenarioMax || event.max_participants || event.capacity || 8
  return event.capacity ? Math.min(baseMax, event.capacity) : baseMax
}

type ReservationLike = { participant_count?: number | null; participant_names?: string[] | null }

/** 有効な予約の人数の合計 */
export function countReservedParticipants(reservations: ReservationLike[]): number {
  return reservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
}

/** 既にデモ参加者がいるか */
export function hasDemoParticipant(reservations: ReservationLike[]): boolean {
  return reservations.some(r =>
    r.participant_names?.includes('デモ参加者') ||
    r.participant_names?.some((name: string) => name.includes('デモ'))
  )
}

/** 予約番号（YYMMDD-ランダム4文字） */
export function demoReservationNumber(now: Date = new Date(), random: () => number = Math.random): string {
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
  const randomStr = random().toString(36).substring(2, 6).toUpperCase()
  return `${dateStr}-${randomStr}`
}

/** デモ参加者の予約（当日精算・支払い済み・確定） */
export function buildDemoReservation({ event, organizationId, neededParticipants, participationFee, duration, reservationNumber }: {
  event: FillSeatsEvent
  organizationId: string
  neededParticipants: number
  participationFee: number
  duration: number
  reservationNumber: string
}) {
  const totalPrice = participationFee * neededParticipants
  return {
    schedule_event_id: event.id,
    organization_id: organizationId,
    title: event.scenario || '',
    scenario_master_id: event.scenario_master_id || event.scenario_id || null,
    store_id: event.store_id || null,
    customer_id: null,
    customer_notes: `デモ参加者${neededParticipants}名`,
    requested_datetime: `${event.date}T${event.start_time}+09:00`,
    duration,
    participant_count: neededParticipants,
    participant_names: Array(neededParticipants).fill(null).map((_, i) =>
      neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`
    ),
    assigned_staff: event.gms || [],
    base_price: totalPrice,
    options_price: 0,
    total_price: totalPrice,
    discount_amount: 0,
    final_price: totalPrice,
    unit_price: participationFee,
    payment_method: 'onsite',
    payment_status: 'paid',
    status: 'confirmed',
    reservation_source: RESERVATION_SOURCE.DEMO,
    reservation_number: reservationNumber,
  }
}
