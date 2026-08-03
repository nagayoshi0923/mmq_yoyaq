import { describe, it, expect } from 'vitest'
import {
  serializePublicScenario,
  buildPrice,
  PUBLIC_SCENARIO_VIEW_COLUMNS,
  type PublicScenarioRow,
} from './publicScenario'

// 設計書 §3-4 のブラックリスト列。公開レスポンスにもSELECT列にも1つも現れてはならない。
const BLACKLIST_KEYS = [
  'license_amount', 'gm_test_license_amount',
  'franchise_license_amount', 'franchise_gm_test_license_amount',
  'external_license_amount', 'external_gm_test_license_amount',
  'fc_receive_license_amount', 'fc_receive_gm_test_license_amount',
  'fc_author_license_amount', 'fc_author_gm_test_license_amount',
  'production_cost', 'production_costs', 'depreciation_per_performance',
  'gm_costs', 'gm_count', 'gm_assignments', 'available_gms', 'experienced_staff',
  'notes', 'author_email', 'author_id',
  'survey_url', 'survey_enabled', 'survey_deadline_days',
  'characters', 'available_stores',
  'booking_start_date', 'booking_end_date', 'individual_notice_template',
  'private_booking_time_slots', 'private_booking_blocked_slots',
  'play_count', 'kit_count', 'master_status', 'report_display_name',
  'required_props', 'gm_test_participation_fee', 'difficulty',
  'participation_costs', 'participation_fee',
  'flexible_pricing', 'pricing_patterns', 'use_flexible_pricing',
]

function baseRow(overrides: Partial<PublicScenarioRow> = {}): PublicScenarioRow {
  return {
    id: 'os-1',
    organization_id: 'org-1',
    slug: 'sorcier',
    title: 'SORCIER',
    author: '作者',
    key_visual_url: 'https://example.com/kv.png',
    description: '説明',
    caution: '注意',
    player_count_min: 6,
    player_count_max: 6,
    duration: 210,
    weekend_duration: 240,
    genre: ['オススメ', '新作'],
    sensitive_tags: [],
    has_pre_reading: false,
    scenario_type: 'normal',
    is_recommended: true,
    release_date: '2025-04-01',
    participation_fee: 4500,
    participation_costs: [{ type: 'fixed', amount: 4500, time_slot: 'normal' }],
    web_display_order: 1,
    updated_at: '2026-08-01T00:00:00+09:00',
    ...overrides,
  }
}

describe('serializePublicScenario', () => {
  it('公開フィールドだけを返す', () => {
    const item = serializePublicScenario(baseRow())
    expect(item).toEqual({
      id: 'os-1',
      slug: 'sorcier',
      title: 'SORCIER',
      author: '作者',
      key_visual_url: 'https://example.com/kv.png',
      description: '説明',
      caution: '注意',
      player_count_min: 6,
      player_count_max: 6,
      duration: 210,
      weekend_duration: 240,
      genre: ['オススメ', '新作'],
      sensitive_tags: [],
      has_pre_reading: false,
      scenario_type: 'normal',
      is_recommended: true,
      release_date: '2025-04-01',
      price: { normal: 4500, display: '4,500円' },
    })
  })

  it('レスポンスにブラックリスト列が1つも含まれない', () => {
    const item = serializePublicScenario(baseRow())
    const keys = Object.keys(item)
    for (const forbidden of BLACKLIST_KEYS) {
      expect(keys).not.toContain(forbidden)
    }
    // price は normal/display のみ
    expect(Object.keys(item.price).sort()).toEqual(['display', 'normal'])
  })

  it('gmtest 価格をレスポンスのどこにも露出しない', () => {
    const item = serializePublicScenario(baseRow({
      participation_costs: [
        { type: 'fixed', amount: 4500, time_slot: 'normal' },
        { type: 'fixed', amount: 3500, time_slot: 'gmtest' },
      ] as unknown,
    }))
    const json = JSON.stringify(item)
    expect(json).not.toContain('3500')
    expect(json).not.toContain('gmtest')
    expect(item.price.normal).toBe(4500)
  })
})

describe('buildPrice', () => {
  it('normal 要素のみ採用する', () => {
    const p = buildPrice(
      [
        { amount: 4500, time_slot: 'normal' },
        { amount: 3500, time_slot: 'gmtest' },
      ],
      null,
    )
    expect(p).toEqual({ normal: 4500, display: '4,500円' })
  })

  it('平日/土日祝で差がある場合は display を組み立てる', () => {
    const p = buildPrice(
      [
        { amount: 4500, time_slot: 'normal' },
        { amount: 5000, time_slot: 'normal' },
      ],
      null,
    )
    expect(p.normal).toBe(4500)
    expect(p.display).toBe('平日4,500円 / 土日祝5,000円')
  })

  it('participation_costs に normal が無ければ participation_fee にフォールバック', () => {
    const p = buildPrice([{ amount: 3500, time_slot: 'gmtest' }], 5000)
    expect(p).toEqual({ normal: 5000, display: '5,000円' })
  })

  it('価格情報が全く無ければ normal=null, display 空', () => {
    expect(buildPrice(null, null)).toEqual({ normal: null, display: '' })
    expect(buildPrice([], null)).toEqual({ normal: null, display: '' })
  })

  it('status が active 以外の normal は除外する', () => {
    const p = buildPrice(
      [
        { amount: 9999, time_slot: 'normal', status: 'inactive' },
        { amount: 4500, time_slot: 'normal', status: 'active' },
      ],
      null,
    )
    expect(p).toEqual({ normal: 4500, display: '4,500円' })
  })
})

describe('PUBLIC_SCENARIO_VIEW_COLUMNS', () => {
  it('SELECT 列にブラックリスト列を含まない', () => {
    const cols = PUBLIC_SCENARIO_VIEW_COLUMNS.split(',').map((c) => c.trim())
    // participation_fee/participation_costs はビューに含める（gmtest除去はAPI層）ので
    // SELECT には現れてよい。それ以外のブラックリスト列は現れてはならない。
    const forbiddenInSelect = BLACKLIST_KEYS.filter(
      (k) => k !== 'participation_fee' && k !== 'participation_costs',
    )
    for (const forbidden of forbiddenInSelect) {
      expect(cols).not.toContain(forbidden)
    }
  })
})
