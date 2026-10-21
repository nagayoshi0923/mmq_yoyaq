import { describe, expect, it } from 'vitest'
import { isStorePlayableForScenario, playableStoresForScenario } from './scenarioStoreHint'

// DB の判定（private_booking_slot_store_fit / private_booking_candidate_slot_availability）と同じ条件（2026-10-15 Codex staging 点検）
describe('isStorePlayableForScenario', () => {
  const regular = { id: 'baba', ownership_type: 'owned', is_temporary: false, status: 'active' }
  const temporary = { id: 'tmp1', ownership_type: 'owned', is_temporary: true, status: 'active' }
  const office = { id: 'office', ownership_type: 'office', is_temporary: false, status: 'active' }
  const inactive = { id: 'closed', ownership_type: 'owned', is_temporary: false, status: 'inactive' }

  it('上演店舗の指定が無ければ臨時会場を除く（画面に出して DB で弾かれる食い違いを防ぐ）', () => {
    expect(isStorePlayableForScenario(regular, [])).toBe(true)
    expect(isStorePlayableForScenario(temporary, [])).toBe(false)
    expect(isStorePlayableForScenario(temporary, null)).toBe(false)
  })
  it('上演店舗の指定に含まれる臨時会場は受け付ける', () => {
    expect(isStorePlayableForScenario(temporary, ['tmp1'])).toBe(true)
    expect(isStorePlayableForScenario(regular, ['tmp1'])).toBe(false)
  })
  it('オフィス・稼働中でない店舗は常に除く', () => {
    expect(isStorePlayableForScenario(office, [])).toBe(false)
    expect(isStorePlayableForScenario(office, ['office'])).toBe(false)
    expect(isStorePlayableForScenario(inactive, [])).toBe(false)
  })
  it('状態の無い一覧（稼働中だけを読んだもの）は稼働中とみなす', () => {
    expect(playableStoresForScenario([{ id: 'a', name: 'A' }, { id: 't', name: 'T', is_temporary: true }], []).map(s => s.id)).toEqual(['a'])
  })
})
