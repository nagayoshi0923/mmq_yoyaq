import { describe, it, expect } from 'vitest'
import { validateCouponCampaign } from './couponRules'
const base = { name: 'テスト', discount_type: 'percentage', discount_amount: 25, target_type: 'all', max_uses_per_customer: 1 }
describe('クーポン編集の入力境界', () => {
  it('余分なID・組織・スナップショットを保存データへ渡さない', () => {
    expect(validateCouponCampaign({ ...base, organization_id: 'other', rules_snapshot: {}, id: 'other' })).toEqual(base)
  })
  it.each([0, -1, 101, 1.5, '25'])('不正な割合 %s を拒否', discount_amount => {
    expect(() => validateCouponCampaign({ ...base, discount_amount })).toThrow()
  })
  it('対象作品なし、曜日・時刻の不正値を拒否', () => {
    for (const patch of [{ target_type: 'specific_scenarios', target_ids: [] }, { allowed_weekdays: [7] }, { allowed_time_slots: ['invalid'] }, { same_scenario_once: 'false' }]) {
      expect(() => validateCouponCampaign({ ...base, ...patch })).toThrow()
    }
  })
  it('日付だけの利用期限をJSTの最終秒まで含める', () => {
    const data = validateCouponCampaign({ ...base, usage_valid_from: '2026-09-26', usage_valid_until: '2026-09-26' })
    expect(data.usage_valid_from).toBe('2026-09-26T00:00:00+09:00')
    expect(data.usage_valid_until).toBe('2026-09-26T23:59:59+09:00')
  })
  it('期間の逆転を拒否', () => {
    expect(() => validateCouponCampaign({ ...base, usage_valid_from: '2026-10-01', usage_valid_until: '2026-09-01' })).toThrow()
  })
})
