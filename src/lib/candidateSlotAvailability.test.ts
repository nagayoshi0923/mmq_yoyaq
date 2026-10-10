import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { availableSlotsForDate, buildCandidateSlotAvailability } from './candidateSlotAvailability'
import { scenarioStoreHintText, playableStoresForScenario } from './scenarioStoreHint'

describe('buildCandidateSlotAvailability', () => {
  it('DB の結果だけで枠と理由を作る（選べない枠も灰色で出す）', () => {
    const a = buildCandidateSlotAvailability([
      { date: '2026-10-30', time_slot: 'afternoon', available: true, reason: null, start_time: '13:00', end_time: '18:00' },
      { date: '2026-10-30', time_slot: 'evening', available: false, reason: 'conflict', start_time: null, end_time: null },
      { date: '2026-10-31', time_slot: 'evening', available: false, reason: 'no_store_for_scenario', start_time: null, end_time: null },
    ])
    expect(a.slotsByDate['2026-10-30'].map(s => s.label)).toEqual(['午後', '夜'])
    expect(a.unavailableReasons).toEqual({
      '2026-10-30-夜': '他の公演と重なります',
      '2026-10-31-夜': 'この作品を上演できる店舗が希望店舗にありません',
    })
    expect(availableSlotsForDate(a, '2026-10-30')).toEqual([{ key: 'afternoon', label: '午後', startTime: '13:00', endTime: '18:00' }])
  })
})

describe('scenarioStoreHintText', () => {
  const stores = [
    { id: 'office', name: '馬場オフィス', ownership_type: 'office' },
    { id: 'baba', name: '高田馬場店', short_name: '高田馬場' },
    { id: 'tmp1', name: '仮設①', is_temporary: true },
    { id: 'omiya', name: '埼玉大宮店', short_name: '埼玉大宮' },
  ]
  const playable = playableStoresForScenario(stores, ['office', 'baba', 'tmp1'])
  it('オフィスを除いた上演店舗を出す', () => expect(playable.map(s => s.id)).toEqual(['baba', 'tmp1']))
  it('共通が無いときは含めるよう促す', () => {
    expect(scenarioStoreHintText(playable, ['omiya'], stores)).toBe('この作品は 高田馬場・仮設① で上演できます。希望店舗に含めてください。')
  })
  it('一部の希望店舗で上演できないときは、その店舗を示す', () => {
    expect(scenarioStoreHintText(playable, ['baba', 'tmp1', 'omiya'], stores)).toContain('（埼玉大宮では上演できません）')
  })
  it('食い違いが無ければ出さない', () => expect(scenarioStoreHintText(playable, ['baba'], stores)).toBeNull())
})
