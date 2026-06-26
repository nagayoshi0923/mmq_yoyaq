/**
 * 予約キャンセルメールの編集状態（型＋初期値）。
 * ReservationList とキャンセルメール送信確認ダイアログで共有する。
 */
import type { CancellationEmailContent } from '@/lib/cancellationEmail'

/** 共通 CancellationEmailContent ＋ 宛先・本文。 */
export interface ReservationCancellationEmailState extends CancellationEmailContent {
  customerEmail: string
  emailBody: string
}

/** 初期値・リセット用の空状態。 */
export const EMPTY_CANCELLATION_EMAIL_STATE: ReservationCancellationEmailState = {
  customerEmail: '',
  customerName: '',
  cancellationReason: '店舗都合によるキャンセル',
  scenarioTitle: '',
  eventDate: '',
  startTime: '',
  endTime: '',
  storeName: '',
  participantCount: 0,
  totalPrice: 0,
  reservationNumber: '',
  cancellationFee: 0,
  paymentMethod: 'onsite',
  cancellationPolicy: '',
  organizationName: '',
  emailBody: '',
}
