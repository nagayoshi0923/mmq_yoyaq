import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildSurveyReminderEmail, formatJstDate } from './survey-reminder-email.ts'

const base = { toName: '架空 太郎', scenarioTitle: '架空の作品', performanceDate: '2026-11-07', startTime: '10:00:00', venue: 'クインズワルツ大久保店', deadlineAt: '2026-10-24T23:59:59.999+09:00', inviteCode: 'JQZS5U5T', companyName: 'クインズワルツ' }

Deno.test('件名・日付・期限・リンク・署名を普段のリマインドと同じ形で組む', () => {
  const m = buildSurveyReminderEmail(base)
  assertEquals(m.subject, '【アンケートのお願い】架空の作品 - 2026年11月7日(土) | クインズワルツ')
  assertStringIncludes(m.text, '架空 太郎 様\n\n2026年11月7日(土)の貸切公演「架空の作品」')
  assertStringIncludes(m.text, '回答期限: 2026年10月24日(土)まで')
  assertStringIncludes(m.text, '回答はこちら: https://mmq.game/group/invite/JQZS5U5T?tab=survey')
  assertStringIncludes(m.text, '開催日時: 2026年11月7日(土) 10:00開演\n会場: クインズワルツ大久保店')
  assertStringIncludes(m.text, '歯車マークから「店舗へのお問い合わせ」')
  assertEquals(m.text.trim().split('\n').at(-1), 'クインズワルツ')
  assertStringIncludes(m.html, '<a href="https://mmq.game/group/invite/JQZS5U5T?tab=survey">')
})
Deno.test('締切は日本時間の日付で出す（日付の境目でずれない）', () => {
  assertEquals(formatJstDate('2026-10-24T23:59:59.999+09:00'), '2026年10月24日(土)')
  assertEquals(formatJstDate('2026-10-24T15:00:00Z'), '2026年10月25日(日)')
})
Deno.test('会場・開演時刻が無くても崩れず、名前の記号は HTML で無害化する', () => {
  const m = buildSurveyReminderEmail({ ...base, venue: null, startTime: null, toName: '<b>テスト</b>' })
  assertStringIncludes(m.text, '開催日時: 2026年11月7日(土)\n\n■ ログインについて')
  assertStringIncludes(m.html, '&lt;b&gt;テスト&lt;/b&gt; 様')
})
