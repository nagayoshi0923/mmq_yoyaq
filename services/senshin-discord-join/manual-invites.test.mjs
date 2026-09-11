import test from 'node:test'
import assert from 'node:assert/strict'
import { withManualInvites } from './manual-invites.mjs'

test('既存貸切を保ち、各招待を対応する単発公演チャンネルへ追加する', () => {
  const existing = { booked: { channelId: '12345678901234567', label: 'booking' } }
  const entries = Array.from({ length: 4 }, (_, i) => ({
    code: `manual${i}`, channelId: String(123456789012345678n + BigInt(i)), label: `event ${i}`,
  }))
  const result = withManualInvites(existing, JSON.stringify(entries))
  assert.deepEqual(result.booked, existing.booked)
  for (const e of entries) assert.deepEqual(result[e.code], { channelId: e.channelId, label: e.label })
  assert.equal(Object.keys(existing).length, 1)
  assert.equal(withManualInvites(existing, ''), existing)
})

test('不正な設定や既存招待の上書きを拒否する', () => {
  const valid = { code: 'manual', channelId: '123456789012345678', label: 'event' }
  for (const raw of ['{', '{}', '[null]', JSON.stringify([{ ...valid, channelId: 'wrong' }]), JSON.stringify([valid, valid])]) {
    assert.throws(() => withManualInvites({}, raw))
  }
  assert.throws(() => withManualInvites({ manual: { channelId: '999999999999999999' } }, JSON.stringify([valid])))
})
