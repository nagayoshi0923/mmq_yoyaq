import { describe, expect, it } from 'vitest'
import {
  getReminderDayMessage,
  getReminderTargetDateJst,
  isHardcodedTomorrowMessageMismatched,
} from './reminderSchedule'

/** JST の壁時計時刻を UTC Date にする（テスト用） */
function jst(y: number, m: number, d: number, h = 9, min = 0): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00+09:00`)
}

describe('getReminderTargetDateJst (#389)', () => {
  it('水曜朝 + days_before:3 → 土曜（報告された送信）', () => {
    // 2026-08-05 は水曜。3日後は 2026-08-08 土曜
    expect(getReminderTargetDateJst(3, jst(2026, 8, 5, 9))).toBe('2026-08-08')
  })

  it('水曜朝 + days_before:1 → 木曜（前日のみ運用）', () => {
    expect(getReminderTargetDateJst(1, jst(2026, 8, 5, 9))).toBe('2026-08-06')
  })

  it('金曜朝 + days_before:1 → 土曜（土曜公演の正しい前日リマインド）', () => {
    expect(getReminderTargetDateJst(1, jst(2026, 8, 7, 9))).toBe('2026-08-08')
  })

  it('JST 18:00（UTC 09:00 cron）でも 3日前は同じ土曜', () => {
    expect(getReminderTargetDateJst(3, jst(2026, 8, 5, 18))).toBe('2026-08-08')
  })

  it('日付境界付近（JST 00:30）でもずれない', () => {
    expect(getReminderTargetDateJst(1, jst(2026, 8, 5, 0, 30))).toBe('2026-08-06')
  })
})

describe('getReminderDayMessage', () => {
  it('1日前は「明日の」', () => {
    expect(getReminderDayMessage(1)).toContain('明日の')
  })

  it('3日前は「3日後の」であり「明日の」ではない', () => {
    const msg = getReminderDayMessage(3)
    expect(msg).toContain('3日後の')
    expect(msg).not.toContain('明日の')
  })
})

describe('isHardcodedTomorrowMessageMismatched (#389 文面矛盾)', () => {
  const storedTemplate = '{customer_name} 様\n\n明日の公演についてリマインドいたします。\n'

  it('days_before:3 で「明日の」直書きテンプレは矛盾', () => {
    expect(isHardcodedTomorrowMessageMismatched(storedTemplate, 3)).toBe(true)
  })

  it('days_before:1（前日のみ）なら矛盾しない', () => {
    expect(isHardcodedTomorrowMessageMismatched(storedTemplate, 1)).toBe(false)
  })
})
