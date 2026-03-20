/**
 * キャンセル料・期限の既定値（オープン / 貸切）
 * DB マイグレーション・公開ページ・管理画面・マイページで整合させる
 */

export type CancellationFeeRow = {
  hours_before: number
  fee_percentage: number
  description: string
}

/** オープン公演: 1日前より50%、当日100%（24時間前より前は無料とみなす） */
export const DEFAULT_OPEN_CANCELLATION_FEES: CancellationFeeRow[] = [
  {
    hours_before: 24,
    fee_percentage: 0,
    description: '公演開始24時間前まで無料（1日より前）',
  },
  {
    hours_before: 0,
    fee_percentage: 50,
    description: '1日前より50%',
  },
  {
    hours_before: -1,
    fee_percentage: 100,
    description: '当日・公演開始後・無断100%',
  },
]

/**
 * 貸切公演: 7日前より公演価格全額の50%、3日前より100%
 * （7日より前は無料）
 */
export const DEFAULT_PRIVATE_CANCELLATION_FEES: CancellationFeeRow[] = [
  {
    hours_before: 168,
    fee_percentage: 0,
    description: '7日より前は無料',
  },
  {
    hours_before: 72,
    fee_percentage: 50,
    description: '7日前より公演価格全額の50%',
  },
  {
    hours_before: 0,
    fee_percentage: 100,
    description: '3日前より公演価格全額の100%',
  },
  {
    hours_before: -1,
    fee_percentage: 100,
    description: '公演開始後・無断キャンセル100%',
  },
]

/** 当日キャンセル（100%）を許容するため、受付期限は「開演まで」（0時間前＝開演時刻まで） */
export const DEFAULT_OPEN_CANCEL_DEADLINE_HOURS = 0
export const DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS = 0
