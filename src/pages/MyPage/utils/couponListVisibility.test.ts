import { describe, expect, it } from 'vitest'
import {
  getExpiredRetentionDeadline,
  getLastCouponUsedAt,
  isUsedCouponVisible,
  resolveCouponDisplayStatus,
} from './couponListVisibility'

const now = new Date('2026-09-26T12:00:00+09:00')

describe('resolveCouponDisplayStatus', () => {
  it('active で expires_at が過去なら expired', () => {
    expect(
      resolveCouponDisplayStatus(
        {
          status: 'active',
          expires_at: '2026-09-25T12:00:00+09:00',
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
        now,
      ),
    ).toBe('expired')
  })

  it('active で usage_valid_until のみ過去なら expired', () => {
    expect(
      resolveCouponDisplayStatus(
        {
          status: 'active',
          expires_at: null,
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          coupon_campaigns: { usage_valid_until: '2026-09-20T00:00:00+09:00' },
        },
        now,
      ),
    ).toBe('expired')
  })
})

describe('getExpiredRetentionDeadline', () => {
  it('個別期限とキャンペーン期限の早い方を使う', () => {
    expect(
      getExpiredRetentionDeadline({
        status: 'expired',
        expires_at: '2026-09-25T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        coupon_campaigns: { usage_valid_until: '2026-08-01T00:00:00Z' },
      }),
    ).toBe('2026-08-01T00:00:00Z')

    expect(
      getExpiredRetentionDeadline({
        status: 'expired',
        expires_at: null,
        updated_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        coupon_campaigns: { usage_valid_until: '2026-09-20T00:00:00Z' },
      }),
    ).toBe('2026-09-20T00:00:00Z')
  })
})

describe('isUsedCouponVisible', () => {
  it('付与から1か月以上前でも、直近で期限切れなら表示する（updated_at は無視）', () => {
    const displayStatus = resolveCouponDisplayStatus(
      {
        status: 'active',
        expires_at: '2026-09-25T15:00:00+09:00',
        updated_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      },
      now,
    )
    expect(displayStatus).toBe('expired')
    expect(
      isUsedCouponVisible(
        {
          status: displayStatus,
          expires_at: '2026-09-25T15:00:00+09:00',
          updated_at: '2026-01-01T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
        now,
      ),
    ).toBe(true)
  })

  it('expires_at がなく usage_valid_until が直近なら表示する', () => {
    expect(
      isUsedCouponVisible(
        {
          status: 'expired',
          expires_at: null,
          updated_at: '2025-12-01T00:00:00Z',
          created_at: '2025-12-01T00:00:00Z',
          coupon_campaigns: { usage_valid_until: '2026-09-20T00:00:00+09:00' },
        },
        now,
      ),
    ).toBe(true)
  })

  it('期限から1か月超えていれば非表示', () => {
    expect(
      isUsedCouponVisible(
        {
          status: 'expired',
          expires_at: '2026-07-01T00:00:00+09:00',
          updated_at: '2026-09-26T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
        },
        now,
      ),
    ).toBe(false)
  })

  it('使用済みは設定更新日ではなく最終利用日を使う', () => {
    const coupon = { status: 'fully_used' as const, created_at: '2026-01-01', updated_at: now.toISOString() }
    expect(isUsedCouponVisible({ ...coupon, coupon_usages: [{ used_at: '2026-07-01T00:00:00Z' }] }, now)).toBe(false)
    expect(isUsedCouponVisible({ ...coupon, updated_at: '2026-01-01', coupon_usages: [{ used_at: '2026-09-20T00:00:00Z' }] }, now)).toBe(true)
    expect(isUsedCouponVisible(coupon, now)).toBe(true)
  })
  it('月末の1か月前をJSTの前月末に丸める', () => {
    const coupon = { status: 'expired' as const, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const monthEnd = new Date('2026-03-31T00:30:00+09:00')
    expect(isUsedCouponVisible({ ...coupon, expires_at: '2026-02-28T00:30:00+09:00' }, monthEnd)).toBe(true)
    expect(isUsedCouponVisible({ ...coupon, expires_at: '2026-02-28T00:29:59+09:00' }, monthEnd)).toBe(false)
  })

  it('active は used 欄に出さない', () => {
    expect(
      isUsedCouponVisible(
        {
          status: 'active',
          expires_at: '2099-01-01T00:00:00Z',
          updated_at: now.toISOString(),
          created_at: now.toISOString(),
        },
        now,
      ),
    ).toBe(false)
  })
})

it('最終利用日時は利用履歴の最新の有効日時であり更新日時ではない', () => {
  const coupon = { status: 'fully_used' as const, created_at: '2026-01-01', updated_at: '2026-09-26', coupon_usages: [{ used_at: '2026-09-20T00:00:00Z' }, { used_at: 'invalid' }, { used_at: '2026-09-24T00:00:00Z' }] }
  expect(getLastCouponUsedAt(coupon)).toBe('2026-09-24T00:00:00Z')
  expect(getLastCouponUsedAt({ ...coupon, coupon_usages: [] })).toBeNull()
})
