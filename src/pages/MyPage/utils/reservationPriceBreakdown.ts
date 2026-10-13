/**
 * 通常予約の金額の内訳（公開前検証 P2）。
 * 合計はサーバーが確定した final_price を正とし、単価×人数・割引・合計が必ず一致するように出す。
 * 予約完了画面（useBookingSubmit の final_price）・マイページ一覧（final_price）と同じ計算元。
 */
export interface ReservationPriceInput {
  unit_price?: number | null
  participant_count?: number | null
  total_price?: number | null
  discount_amount?: number | null
  final_price?: number | null
}

export interface ReservationPriceBreakdown {
  unitPrice: number
  participantCount: number
  /** 割引前（単価×人数。単価が無い旧予約は保存済みの total_price） */
  subtotal: number
  /** 割引額（割引前 − 合計。0 以上） */
  discount: number
  /** お支払い合計（サーバー確定金額） */
  total: number
}

const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function reservationPriceBreakdown(reservation: ReservationPriceInput): ReservationPriceBreakdown {
  const unitPrice = validAmount(reservation.unit_price) ? reservation.unit_price : 0
  const participantCount = validAmount(reservation.participant_count) ? reservation.participant_count : 0
  const subtotal = unitPrice > 0
    ? unitPrice * participantCount
    : (validAmount(reservation.total_price) ? reservation.total_price : 0)
  const savedDiscount = validAmount(reservation.discount_amount) ? reservation.discount_amount : 0
  // 合計はサーバー確定金額。旧予約で未設定なら保存済みの割引を引く（確認メールと同じ考え方）
  const total = validAmount(reservation.final_price)
    ? reservation.final_price
    : Math.max(0, subtotal - savedDiscount)
  return { unitPrice, participantCount, subtotal, discount: Math.max(0, subtotal - total), total }
}
