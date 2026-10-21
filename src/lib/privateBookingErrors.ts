/**
 * 貸切の申込・グループ作成・候補日の保存で DB が返すエラーを、お客様向けの日本語にする。
 * DB は SQLSTATE（P0054 など）と、英字のコード（PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD など）をメッセージに入れて返す。
 * どちらで届いても同じ文にし、英字のコードのまま画面に出さない（2026-10-20 staging 点検）。
 */
import { getErrorCode, getErrorMessage } from '@/lib/errorFields'

/** SQLSTATE → 文 */
export const PRIVATE_BOOKING_ERROR_BY_SQLSTATE: Record<string, string> = {
  P0001: '参加人数が正しくありません',
  P0009: '顧客情報が見つかりません',
  P0011: 'この操作を行う権限がありません',
  P0020: 'お名前を入力してください',
  P0021: 'メールアドレスを入力してください',
  P0022: '電話番号を入力してください',
  P0023: '候補日時を選択してください',
  P0024: '作品が見つかりません',
  P0025: '参加人数が作品の対応人数の範囲外です。作品の人数をご確認ください',
  P0026: '組織情報が見つかりません',
  P0030: '候補日時に既存の公演との競合があります。日時と希望店舗を選び直してください。',
  P0040: '候補日時が現在受付停止中です。日時と希望店舗を選び直してください。',
  P0041: '候補日時の時間帯が正しくありません。日時を選び直してください。',
  P0042: '希望店舗が正しくありません。店舗を選び直してください。',
  P0044: 'この作品は現在、貸切を受け付けていません（貸切の募集期間外です）。',
  P0045: '貸切の受付締切を過ぎた候補日があります。日程を選び直してください。',
  P0047: '貸切リクエストはグループから申し込んでください。画面を開き直してから、もう一度お試しください。',
  P0051: '作品の対応人数が未設定です。店舗へお問い合わせください',
  P0054: 'この作品の公演期間外の候補日があります。公演期間内の日程を選び直してください。',
}

/** メッセージに入る英字のコード → 文 */
export const PRIVATE_BOOKING_ERROR_BY_NAME: Record<string, string> = {
  PRIVATE_BOOKING_OUTSIDE_PERFORMANCE_PERIOD: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0054,
  PRIVATE_BOOKING_NOT_ACCEPTED: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0044,
  PRIVATE_BOOKING_DEADLINE_PASSED: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0045,
  PRIVATE_BOOKING_CONTEXT_REQUIRED: '作品または日付を確認できませんでした。画面を開き直してから、もう一度お試しください。',
  PRIVATE_BOOKING_CANDIDATES_REQUIRED: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0023,
  PRIVATE_BOOKING_CANDIDATE_CONFLICT: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0030,
  PRIVATE_BOOKING_SLOT_BLOCKED: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0040,
  PRIVATE_BOOKING_PLAYER_COUNT_NOT_CONFIGURED: PRIVATE_BOOKING_ERROR_BY_SQLSTATE.P0051,
  PRIVATE_GROUP_NOT_FOUND: 'グループが見つかりません。画面を開き直してください。',
  PRIVATE_GROUP_ORGANIZATION_MISMATCH: '作品と店舗の組み合わせを確認できませんでした。画面を開き直してください。',
  PRIVATE_GROUP_RESERVATION_MISMATCH: '申込内容を確認できませんでした。画面を開き直してください。',
  PRIVATE_GROUP_UPDATE_FAILED: 'グループを更新できませんでした。時間をおいて、もう一度お試しください。',
}

/** 英字の大文字とアンダースコアだけのメッセージ（DB のコードをそのまま出している） */
const RAW_CODE = /^[A-Z][A-Z0-9_]{3,}$/

/**
 * エラーをお客様向けの文にする。分からないコードは fallback。
 * 日本語のメッセージ（DB・画面が作った文）はそのまま使う。
 */
export function privateBookingErrorText(error: unknown, fallback = '送信できませんでした。時間をおいて、もう一度お試しください。'): string {
  const message = getErrorMessage(error).trim()
  const byName = Object.keys(PRIVATE_BOOKING_ERROR_BY_NAME).find(name => message.includes(name))
  if (byName) return PRIVATE_BOOKING_ERROR_BY_NAME[byName]
  const code = getErrorCode(error)
  if (code && PRIVATE_BOOKING_ERROR_BY_SQLSTATE[code]) return PRIVATE_BOOKING_ERROR_BY_SQLSTATE[code]
  if (!message || RAW_CODE.test(message)) return fallback
  return message
}
