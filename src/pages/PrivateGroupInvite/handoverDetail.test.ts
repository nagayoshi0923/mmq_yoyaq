import { describe, expect, it } from 'vitest'
import { displayedPolicyRecord, handoverPolicyStoreId, handoverStage, isValidHandoverPhone, type HandoverDetail } from './handoverDetail'

const group = (over: Partial<HandoverDetail['group']> = {}): HandoverDetail['group'] => ({
  id: 'g', status: 'gathering', invite_code: 'C', organization_id: 'o', organization_slug: 'queens-waltz', scenario_master_id: 's',
  preferred_store_ids: ['s1'], total_price: null, per_person_price: null, target_participant_count: null, ...over,
})
const reservation = (over: Partial<NonNullable<HandoverDetail['reservation']>> = {}): NonNullable<HandoverDetail['reservation']> => ({
  id: 'r', reservation_number: 'PB-1', status: 'pending', participant_count: 4, total_price: 22000, customer_name: '試験 一子', store_id: null,
  candidates: [], requested_store_ids: ['s1', 's2'], confirmed: null, policy: null, ...over,
})

describe('段階', () => {
  it('申込が無ければ申込前、あれば返事待ち、確定なら確定', () => {
    expect(handoverStage({ group: group(), reservation: null })).toBe('pre_request')
    expect(handoverStage({ group: group({ status: 'booking_requested' }), reservation: reservation() })).toBe('requested')
    expect(handoverStage({ group: group({ status: 'booking_requested' }), reservation: reservation({ status: 'confirmed' }) })).toBe('confirmed')
  })
})

describe('注意事項・規定の店舗の範囲（貸切申込と同じく 1 店舗に決まるときだけ）', () => {
  it('申込前は希望店舗が 1 つのとき', () => {
    expect(handoverPolicyStoreId({ group: group(), reservation: null })).toBe('s1')
    expect(handoverPolicyStoreId({ group: group({ preferred_store_ids: ['s1', 's2'] }), reservation: null })).toBeNull()
  })
  it('返事待ちで希望店舗が複数なら決めない。固定済みの規定があればその店舗', () => {
    expect(handoverPolicyStoreId({ group: group(), reservation: reservation() })).toBeNull()
    expect(handoverPolicyStoreId({ group: group(), reservation: reservation({ requested_store_ids: ['s2'] }) })).toBe('s2')
    const policy = { version: 1, store_id: 's9', store_name: '二号店', performance_type: 'private' as const, deadline_hours: 720, fees: [], fee_basis: null, updated_at: '2026-10-01' }
    expect(handoverPolicyStoreId({ group: group(), reservation: reservation({ policy }) })).toBe('s9')
  })
})

describe('同意の記録', () => {
  it('店舗未確定は希望店舗を残す', () => {
    expect(displayedPolicyRecord(null, [], ['s1', 's2'])).toMatchObject({ store_id: null, store_ids: ['s1', 's2'] })
  })
})

describe('電話番号', () => {
  it('ハイフンを除いて 10〜11 桁', () => {
    expect(isValidHandoverPhone('090-1111-2222')).toBe(true)
    expect(isValidHandoverPhone('03-1234-567')).toBe(false)
  })
})
