import { isUndeliverableEmail } from './undeliverable-email.ts'

Deno.test('届かない宛先: デモ参加者や伏せた宛先は送らない', () => {
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
  assert(isUndeliverableEmail('demo@example.com'), 'デモ参加者')
  assert(isUndeliverableEmail('DEMO@Example.COM '), '大文字・空白')
  assert(isUndeliverableEmail('a@sub.example.org'), 'example のサブドメイン')
  assert(isUndeliverableEmail('qa@example.invalid'), '伏せた宛先')
  assert(isUndeliverableEmail('a@foo.test'), '.test')
  assert(isUndeliverableEmail(''), '空')
  assert(isUndeliverableEmail(null), 'null')
  assert(isUndeliverableEmail('no-at-mark'), '@ なし')
  assert(!isUndeliverableEmail('someone@gmail.com'), '普通の宛先は送る')
  assert(!isUndeliverableEmail('a@myexample.com'), 'example を含むだけの別ドメインは送る')
})
