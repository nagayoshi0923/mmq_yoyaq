import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildCustomerNoticeEmail } from './customer-notice-email.ts'

const row = { subject: '【日程確定】架空の作品 - 2026年10月24日(土) | クインズワルツ', body_text: '架空 太郎 様\n\n本文 <b>\n\n▼ 詳しくはこちら\n{{SITE_URL}}/group/invite/ABC\n\nクインズワルツ' }

Deno.test('リンクの頭をサイトの URL に置き換え、その行だけリンクにする', () => {
  const m = buildCustomerNoticeEmail(row, 'https://example.test/')
  assertStringIncludes(m.text, 'https://example.test/group/invite/ABC')
  assertStringIncludes(m.html, '<a href="https://example.test/group/invite/ABC">')
  assertStringIncludes(m.html, '本文 &lt;b&gt;')
  assertEquals(m.subject, row.subject)
})
Deno.test('サイトの URL が無ければ mmq.game', () => {
  assertStringIncludes(buildCustomerNoticeEmail(row).text, 'https://mmq.game/group/invite/ABC')
})
