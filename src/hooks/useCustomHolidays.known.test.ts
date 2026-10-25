import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { knownCustomHoliday } from './useCustomHolidays'

describe('料金に使う独自休日の判定', () => {
  it('読み込み中・読み込めなかったときは null、読めたら判定関数', () => {
    const fn = (d: string) => d === '2026-10-21'
    expect(knownCustomHoliday({ isLoading: true, error: null, isCustomHoliday: fn })).toBeNull()
    expect(knownCustomHoliday({ isLoading: false, error: '休日設定を取得できません。', isCustomHoliday: fn })).toBeNull()
    expect(knownCustomHoliday({ isLoading: false, error: null, isCustomHoliday: fn })).toBe(fn)
  })
})
