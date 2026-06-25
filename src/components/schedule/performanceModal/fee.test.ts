import { describe, expect, it } from 'vitest'
import type { Scenario } from '@/types'
import { getNormalFeeAmount, formatFee, computeCategoryFee } from './fee'

// テスト用に必要なフィールドだけ持つ Scenario を作る
function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    title: 'テスト',
    player_count_max: 6,
    participation_fee: 0,
    participation_costs: [],
    ...overrides,
  } as Scenario
}

describe('formatFee', () => {
  it('¥per / ¥total（満員想定）を返す', () => {
    expect(formatFee(5000, 6)).toBe('¥5,000 / ¥30,000')
  })
})

describe('getNormalFeeAmount', () => {
  it('participation_costs の normal を優先', () => {
    expect(getNormalFeeAmount(scenario({
      participation_costs: [{ time_slot: 'normal', amount: 4500, type: 'fixed', status: 'active' }],
      participation_fee: 9999,
    }))).toBe(4500)
  })
  it('normal が無ければ participation_fee', () => {
    expect(getNormalFeeAmount(scenario({ participation_costs: [], participation_fee: 3000 }))).toBe(3000)
  })
  it('どちらも無ければ null', () => {
    expect(getNormalFeeAmount(scenario({ participation_costs: [], participation_fee: 0 }))).toBeNull()
  })
})

describe('computeCategoryFee', () => {
  it('MTG / メモ は null', () => {
    expect(computeCategoryFee('mtg', null)).toBeNull()
    expect(computeCategoryFee('memo', null)).toBeNull()
  })
  it('場所貸しは既定¥12,000、指定があればその額', () => {
    expect(computeCategoryFee('venue_rental', null)).toEqual({ label: '場所貸し', fee: '¥12,000' })
    expect(computeCategoryFee('venue_rental', null, { venueRentalFee: 8000 })).toEqual({ label: '場所貸し', fee: '¥8,000' })
  })
  it('場所貸無料・テストプレイは¥0', () => {
    expect(computeCategoryFee('venue_rental_free', null)).toEqual({ label: '場所貸し', fee: '¥0' })
    expect(computeCategoryFee('testplay', null)).toEqual({ label: 'テストプレイ', fee: '¥0' })
  })
  it('シナリオ未選択（open等）は null', () => {
    expect(computeCategoryFee('open', null)).toBeNull()
  })
  it('GMテスト: participation_costs の gmtest を使う', () => {
    expect(computeCategoryFee('gmtest', scenario({
      participation_costs: [{ time_slot: 'gmtest', amount: 1000, type: 'fixed', status: 'active' }],
    }))).toEqual({ label: 'GMテスト', fee: '¥1,000 / ¥6,000' })
  })
  it('GMテスト: gmtestコストが無ければ gm_test_participation_fee、それも0なら¥0', () => {
    expect(computeCategoryFee('gmtest', scenario({ gm_test_participation_fee: 500 }))).toEqual({ label: 'GMテスト', fee: '¥500 / ¥3,000' })
    expect(computeCategoryFee('gmtest', scenario({}))).toEqual({ label: 'GMテスト', fee: '¥0' })
  })
  it('貸切: 通常参加費×満員', () => {
    expect(computeCategoryFee('private', scenario({ participation_fee: 4000 }))).toEqual({ label: '貸切', fee: '¥4,000 / ¥24,000' })
  })
  it('open: 通常コスト1件はその額', () => {
    expect(computeCategoryFee('open', scenario({
      participation_costs: [{ time_slot: 'normal', amount: 3500, type: 'fixed', status: 'active' }],
    }))).toEqual({ label: '', fee: '¥3,500 / ¥21,000' })
  })
  it('open: 通常コスト複数で額が異なれば範囲表記', () => {
    expect(computeCategoryFee('open', scenario({
      participation_costs: [
        { time_slot: 'normal', amount: 3000, type: 'fixed', status: 'active' },
        { time_slot: 'normal', amount: 5000, type: 'fixed', status: 'active' },
      ],
    }))).toEqual({ label: '', fee: '¥3,000〜 / ¥30,000' })
  })
  it('open: コスト無しは participation_fee にフォールバック', () => {
    expect(computeCategoryFee('open', scenario({ participation_costs: [], participation_fee: 2500 }))).toEqual({ label: '', fee: '¥2,500 / ¥15,000' })
  })
})
