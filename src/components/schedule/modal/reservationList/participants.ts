/**
 * 予約リストの参加者集計（純関数・テスト対象）。
 *
 * ReservationList の sumActiveParticipants から抽出（Phase 5-3・挙動不変）。
 * 有効ステータス（ACTIVE_RESERVATION_STATUSES_SET）の予約だけ participant_count を合算する。
 * 型は呼び出し側に依存しないよう最小集合に。副作用なし。
 */
import { ACTIVE_RESERVATION_STATUSES_SET } from '@/lib/constants'

/** sumActiveParticipants が参照するフィールドの最小集合。 */
export interface CountableReservation {
  status?: string | null
  participant_count?: number | null
}

/** 有効ステータスの予約のみ participant_count を合算する（無効・未設定は 0 扱い）。 */
export function sumActiveParticipants(list: CountableReservation[]): number {
  return list.reduce((sum, r) => {
    if (!r?.status || !ACTIVE_RESERVATION_STATUSES_SET.has(r.status)) return sum
    return sum + (r.participant_count || 0)
  }, 0)
}
