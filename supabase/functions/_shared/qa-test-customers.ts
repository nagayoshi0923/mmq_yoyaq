// 毎日の本番点検（テスト予約）で使うお客様アカウントの判定。
// QA_TEST_CUSTOMER_EMAILS（カンマ区切り）に一致するメールの予約・貸切申込では、
// スタッフ・GM への通知を送らない。お客様本人へのメールは通常どおり送る（届くことも点検する）。
// 未設定なら誰も該当しない（既定は通常どおり通知）。
export function parseQaTestCustomerEmails(raw: string | undefined | null): Set<string> {
  return new Set(String(raw ?? '').split(',').map(v => v.trim().toLowerCase()).filter(v => /^[^\s@]+@[^\s@]+$/.test(v)))
}

export function isQaTestCustomerEmail(email: unknown, raw: string | undefined | null): boolean {
  if (typeof email !== 'string' || !email.trim()) return false
  return parseQaTestCustomerEmails(raw).has(email.trim().toLowerCase())
}
