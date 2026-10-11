/**
 * 貸切の取消についての案内（点検 35。社長決定 2026-10-11: 期限は変えず、説明を足す）。
 * 貸切は候補日を「14日前まで」選べるが、マイページから取り消せるのは公演の 30 日前まで（既定の受付期限）。
 * それより後は店舗への連絡が必要で、料金の段（既定は 7 日前から）に入るとキャンセル料がかかる。
 * 申込シート・作品ページからの貸切申込の確認・申込完了の画面・確定後の概要で同じ文を出す。
 */
import { DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS, DEFAULT_PRIVATE_CANCELLATION_FEES } from '@/constants/cancellationPolicyDefaults'
import { hoursBeforeLabel } from '@/lib/cancellationSummary'

/** 「公演の30日前」 */
export const PRIVATE_SELF_CANCEL_LABEL = hoursBeforeLabel(DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS)

/** 料金がかかり始める時期（「7日前」）。料金の段が無ければ null */
function firstPaidLabel(): string | null {
  const paid = DEFAULT_PRIVATE_CANCELLATION_FEES
    .filter(fee => fee.hours_before >= 0 && fee.fee_percentage > 0)
    .sort((a, b) => b.hours_before - a.hours_before)[0]
  return paid ? hoursBeforeLabel(paid.hours_before) : null
}

/**
 * 「マイページから取り消せるのは公演の30日前までです。それより後の取消は店舗へご連絡ください（7日前からはキャンセル料がかかります）。」
 */
export function privateCancelNoticeText(): string {
  const paid = firstPaidLabel()
  return `マイページから取り消せるのは公演の${PRIVATE_SELF_CANCEL_LABEL}までです。それより後の取消は店舗へご連絡ください${paid ? `（${paid}からはキャンセル料がかかります）` : '（キャンセル料がかかる場合があります）'}。`
}
