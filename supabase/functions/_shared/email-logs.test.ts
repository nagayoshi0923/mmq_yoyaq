import { emailLogIdFromTags, emailLogTags } from './email-logs.ts'

Deno.test('送信記録のタグ: 渡す形と、Webhook のオブジェクト形式・配列形式から取り出す', () => {
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
  const id = '11111111-2222-3333-4444-555555555555'
  assert(JSON.stringify(emailLogTags(id)) === JSON.stringify([{ name: 'email_log_id', value: id }]), 'タグを作る')
  assert(emailLogTags(null) === undefined, '記録が無ければタグなし')
  assert(emailLogIdFromTags({ email_log_id: id }) === id, 'オブジェクト形式')
  assert(emailLogIdFromTags([{ name: 'x', value: 'y' }, { name: 'email_log_id', value: id }]) === id, '配列形式')
  assert(emailLogIdFromTags(undefined) === null && emailLogIdFromTags([]) === null && emailLogIdFromTags({}) === null, '無ければ null')
})
