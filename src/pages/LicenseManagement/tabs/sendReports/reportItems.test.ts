import { describe, expect, it } from 'vitest'
import { computePreviewItem, type PreviewInput } from './reportItems'

function input(overrides: Partial<PreviewInput> & { scenarioKey: string; scenarioTitle?: string }): PreviewInput & { scenarioTitle?: string } {
  return {
    internalEvents: 0,
    internalLicenseAmount: 0,
    externalEvents: 0,
    externalLicenseAmount: 0,
    ...overrides,
  }
}

describe('computePreviewItem', () => {
  it('上書きが無ければ実データの公演数で金額を算出', () => {
    const item = input({ scenarioKey: 'A', internalEvents: 3, internalLicenseAmount: 1000 })
    const r = computePreviewItem(item, {}, {})
    expect(r.internalEvents).toBe(3)
    expect(r.internalLicenseCost).toBe(3000)
    expect(r.externalEvents).toBe(0)
    expect(r.externalLicenseCost).toBe(0)
    expect(r.events).toBe(3)
    expect(r.licenseCost).toBe(3000)
  })

  it('internalInputs があれば自社公演数を上書き（0 も尊重）', () => {
    const item = input({ scenarioKey: 'A', internalEvents: 3, internalLicenseAmount: 1000 })
    expect(computePreviewItem(item, { A: 5 }, {}).internalEvents).toBe(5)
    expect(computePreviewItem(item, { A: 5 }, {}).internalLicenseCost).toBe(5000)
    // 0 上書きは ?? で尊重される
    expect(computePreviewItem(item, { A: 0 }, {}).internalEvents).toBe(0)
    expect(computePreviewItem(item, { A: 0 }, {}).licenseCost).toBe(0)
  })

  it('管理作品は externalInputs を反映、通常作品は他社 0', () => {
    const managed = input({ scenarioKey: 'M', externalEvents: 2, externalLicenseAmount: 800, scenarioType: 'managed' })
    const r = computePreviewItem(managed, {}, { M: 4 })
    expect(r.externalEvents).toBe(4)
    expect(r.externalLicenseCost).toBe(3200)

    const normal = input({ scenarioKey: 'N', externalEvents: 9, externalLicenseAmount: 800, scenarioType: 'normal' })
    const rn = computePreviewItem(normal, {}, { N: 4 })
    expect(rn.externalEvents).toBe(0)
    expect(rn.externalLicenseCost).toBe(0)
  })

  it('管理作品で externalInputs 未設定なら実データの他社公演数を使用', () => {
    const managed = input({ scenarioKey: 'M', externalEvents: 2, externalLicenseAmount: 800, scenarioType: 'managed' })
    expect(computePreviewItem(managed, {}, {}).externalEvents).toBe(2)
  })

  it('合計（events / licenseCost）は自社＋他社', () => {
    const managed = input({ scenarioKey: 'M', internalEvents: 3, internalLicenseAmount: 1000, externalEvents: 2, externalLicenseAmount: 800, scenarioType: 'managed' })
    const r = computePreviewItem(managed, {}, {})
    expect(r.events).toBe(5)
    expect(r.licenseCost).toBe(3000 + 1600)
  })

  it('入力の他フィールドは温存して返す', () => {
    const item = input({ scenarioKey: 'A', internalEvents: 1, internalLicenseAmount: 100, scenarioTitle: 'タイトル' })
    expect(computePreviewItem(item, {}, {}).scenarioTitle).toBe('タイトル')
    expect(computePreviewItem(item, {}, {}).scenarioKey).toBe('A')
  })
})
