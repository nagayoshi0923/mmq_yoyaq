import { isQaTestCustomerEmail, parseQaTestCustomerEmails } from './qa-test-customers.ts'

Deno.test('点検用アカウントの判定: 設定に一致したメールだけ（大文字・空白は無視）', () => {
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
  const raw = ' QA+daily@example.com , other@example.com,,not-an-email '
  assert(parseQaTestCustomerEmails(raw).size === 2, '正しい形のメールだけ読む')
  assert(isQaTestCustomerEmail('qa+daily@example.com', raw), '一致')
  assert(isQaTestCustomerEmail(' QA+DAILY@example.com ', raw), '大文字・空白')
  assert(!isQaTestCustomerEmail('customer@example.com', raw), '一般のお客様は対象外')
  assert(!isQaTestCustomerEmail('qa+daily@example.com', undefined), '未設定なら誰も対象外')
  assert(!isQaTestCustomerEmail('qa+daily@example.com', ''), '空なら誰も対象外')
  assert(!isQaTestCustomerEmail(null, raw), 'メールなし')
})
