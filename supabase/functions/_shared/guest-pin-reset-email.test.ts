import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildGuestPinResetEmail } from './guest-pin-reset-email.ts'

Deno.test('PIN 再発行メールに新しい PIN・アドレス・グループの住所を入れる', () => {
  const m = buildGuestPinResetEmail({ guestName: '架空ゲスト', email: 'a@example.invalid', pin: '4821', scenarioTitle: '架空の作品', inviteCode: 'AB CD' })
  assertEquals(m.subject, '【架空の作品】アクセスPINの再発行のご案内')
  assertStringIncludes(m.text, '架空ゲスト 様')
  assertStringIncludes(m.text, '■ 新しいアクセスPIN\n4821')
  assertStringIncludes(m.text, 'https://mmq.game/group/invite/AB%20CD')
  assertStringIncludes(m.text, '以前のPINは使えなくなりました')
})
Deno.test('名前・作品名が無くても文面が崩れない', () => {
  const m = buildGuestPinResetEmail({ guestName: null, email: 'a@example.invalid', pin: '1000', scenarioTitle: null, inviteCode: 'X' })
  assertStringIncludes(m.text, 'ゲスト 様')
  assertEquals(m.subject, '【グループ】アクセスPINの再発行のご案内')
})
