import { parseCustomerNoticeOnlyIds } from './customer-notice-only-ids.ts'
Deno.test('お知らせメールの送信処理: only_ids の読み取り（限定試験）', () => {
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
  const id = '11111111-2222-4333-8444-555555555555'
  const ok = (raw: string) => { const r = parseCustomerNoticeOnlyIds(raw); return r.ok ? r.onlyIds : 'error' }
  assert(ok('{}') === null, '定期実行の {} は限定なし')
  assert(ok('') === null, '本文なしは限定なし')
  assert(JSON.stringify(ok(JSON.stringify({ only_ids: [id] }))) === JSON.stringify([id]), '1 件を指定できる')
  assert(JSON.stringify(ok(JSON.stringify({ only_ids: [id, id.toUpperCase()] }))) === JSON.stringify([id]), '重複は 1 件にまとめる')
  assert(ok(JSON.stringify({ only_ids: [] })) === 'error', '空の配列は拒否（全件にしない）')
  assert(ok(JSON.stringify({ only_ids: id })) === 'error', '配列でないものは拒否')
  assert(ok(JSON.stringify({ only_ids: ['not-a-uuid'] })) === 'error', 'ID の形でないものは拒否')
  assert(ok(JSON.stringify({ only_ids: Array.from({ length: 21 }, () => id) })) === 'error', '21 件以上は拒否')
  assert(ok('{only_ids:') === 'error', '壊れた JSON は拒否（全件にしない）')
  assert(ok('[]') === 'error', 'オブジェクトでない本文は拒否')
})
