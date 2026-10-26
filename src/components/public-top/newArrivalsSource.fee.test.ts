// 点検 F05: 店舗トップの新作・作品のカードの「¥N〜」は、日付・時間帯の料金の最安（基本料金ではなく）
import { describe, expect, it } from 'vitest'
import { buildOrgBrowseScenarios } from './newArrivalsSource'

describe('店舗トップの作品カードの料金', () => {
  it('参考の最安（participation_fee_min）を出す。無ければ基本料金', () => {
    const base = { scenario_id: 's1', scenario_title: '架空の作品', key_visual_url: null, genre: [], player_count_min: 4, player_count_max: 6, duration: 120, participation_fee: 4500 }
    const [withMin, withoutMin] = buildOrgBrowseScenarios({
      scenarios: [{ ...base, participation_fee_min: 4100 }, { ...base, scenario_id: 's2' }] as never,
      slug: 'kaku', organizationId: 'org-1', upcoming: new Map(), nextDates: new Map(),
    })
    expect(withMin.card.fee).toBe(4100)
    expect(withoutMin.card.fee).toBe(4500)
  })
})
