import { describe, expect, it } from 'vitest'
import { capacityError, isCapacityConstraintError } from './scheduleCapacity'

describe('公演保存時の定員超過表示', () => {
  it('既存8名の公演に定員7名を保存すると具体的な人数と対処を返す', () => {
    expect(capacityError({ capacity: null, max_participants: null, current_participants: 8 }, 7))
      .toBe('定員7名に対して参加人数が8名になるため保存できません。申込済みの予約とスタッフ参加が重複していないか、予約者一覧を確認してください。')
  })
  it('スタッフ追加による超過も検出する', () => {
    expect(capacityError({ capacity: 7, current_participants: 7 }, undefined, 1)).toContain('8名')
  })
  it('定員と同数なら保存可能', () => {
    expect(capacityError({ capacity: 7, current_participants: 6 }, undefined, 1)).toBeNull()
  })
  it('DB制約と同様にmax_participantsを優先する', () => {
    expect(capacityError({ max_participants: 8, capacity: 7, current_participants: 8 }, 6)).toBeNull()
  })
  it('定員0を未設定として扱わない', () => {
    expect(capacityError({ max_participants: 0, current_participants: 1 }, 8)).toContain('定員0名')
  })
  it('定員未設定で任意の人数制限を追加しない', () => {
    expect(capacityError({ capacity: null, current_participants: 8 })).toBeNull()
  })
  it('競合更新時の人数制約エラーだけを識別する', () => {
    expect(isCapacityConstraintError({ code: '23514', message: 'violates check constraint "schedule_events_participants_check"' })).toBe(true)
    expect(isCapacityConstraintError({ code: '23514', message: 'another_constraint' })).toBe(false)
    expect(isCapacityConstraintError({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
