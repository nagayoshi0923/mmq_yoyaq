import { describe, expect, it } from 'vitest'
import { isInternalLicenseReportablePerformance } from './licensePerformance'

describe('isInternalLicenseReportablePerformance', () => {
  it.each(['open', 'private', 'gmtest'])(
    '%s は自社ライセンス報告対象にする',
    category => {
      expect(isInternalLicenseReportablePerformance({ category, scenarioTitle: '通常作品' })).toBe(true)
    },
  )

  it('Queen\'s Waltzが外部会場で行う出張公演は対象にする', () => {
    expect(isInternalLicenseReportablePerformance({
      category: 'offsite',
      scenarioTitle: 'アンシンメトリー',
    })).toBe(true)
  })

  it.each([
    '特別出張公演「冷血と命脈」',
    '【特別出張公演】公平なWorld',
  ])('外部団体を招いた管理用登録 %s は対象外にする', scenarioTitle => {
    expect(isInternalLicenseReportablePerformance({ category: 'offsite', scenarioTitle })).toBe(false)
  })

  it.each(['testplay', 'venue_rental', 'venue_rental_free', 'package', 'mtg', 'memo'])(
    '%s は自社ライセンス報告対象外にする',
    category => {
      expect(isInternalLicenseReportablePerformance({ category, scenarioTitle: '通常作品' })).toBe(false)
    },
  )
})
