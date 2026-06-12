/**
 * eventOperationUtils のユニットテスト
 *
 * checkTimeOverlap は公演の二重予約・間隔不足を防ぐ最重要ロジック。
 * 仕様: 公演間には標準60分（PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES）の
 * 設営・撤収インターバルが必要。シナリオの extra_preparation_time が加算される。
 *
 * 実行: npm run test:unit
 */
import { describe, it, expect } from 'vitest'
import {
  timeToMinutes,
  calcEndTime,
  checkTimeOverlap,
  getEventTimeSlot,
} from '../eventOperationUtils'

describe('timeToMinutes', () => {
  it('HH:MM 形式を分に変換する', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:05')).toBe(545)
    expect(timeToMinutes('14:30')).toBe(870)
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  it('HH:MM:SS 形式でも秒を無視して変換する', () => {
    expect(timeToMinutes('14:30:00')).toBe(870)
  })
})

describe('calcEndTime', () => {
  it('開始時刻 + 所要時間（分）から終了時刻を計算する', () => {
    expect(calcEndTime('10:00', 240)).toBe('14:00')
    expect(calcEndTime('19:00', 180)).toBe('22:00')
    expect(calcEndTime('09:30', 90)).toBe('11:00')
  })

  it('深夜越えは 24 時間表記のまま返す（現行仕様）', () => {
    // 22:30 開始 + 120分 → 「24:30」。日付繰り越しはしない
    expect(calcEndTime('22:30', 120)).toBe('24:30')
  })
})

describe('checkTimeOverlap（標準インターバル60分）', () => {
  it('時間が直接重なる場合は overlap', () => {
    // 10:00-14:00 と 13:00-17:00 → 重複
    const r = checkTimeOverlap('10:00', '14:00', '13:00', '17:00')
    expect(r.overlap).toBe(true)
    expect(r.reason).toBe('時間が重複')
  })

  it('完全に同一の時間帯は overlap', () => {
    expect(checkTimeOverlap('10:00', '14:00', '10:00', '14:00').overlap).toBe(true)
  })

  it('間隔がちょうど60分なら OK（境界値）', () => {
    // 既存 10:00-14:00 → 新規 15:00 開始（間隔60分ちょうど）
    expect(checkTimeOverlap('10:00', '14:00', '15:00', '19:00').overlap).toBe(false)
  })

  it('間隔が59分なら間隔不足', () => {
    const r = checkTimeOverlap('10:00', '14:00', '14:59', '19:00')
    expect(r.overlap).toBe(true)
    expect(r.reason).toContain('間隔不足')
    expect(r.reason).toContain('60分')
  })

  it('順序が逆（新規が先・既存が後）でも間隔チェックされる', () => {
    // 新規 10:00-14:00 → 既存 14:30 開始（間隔30分 < 60分）
    const r = checkTimeOverlap('14:30', '19:00', '10:00', '14:00')
    expect(r.overlap).toBe(true)
    expect(r.reason).toContain('間隔不足')
  })

  it('十分に離れていれば OK', () => {
    expect(checkTimeOverlap('10:00', '12:00', '18:00', '22:00').overlap).toBe(false)
  })
})

describe('checkTimeOverlap（extra_preparation_time 加算）', () => {
  it('新規公演の追加準備30分 → 必要間隔90分。60分間隔では不足', () => {
    // 既存 10:00-14:00 → 新規 15:00 開始（間隔60分）だが新規の準備+30分
    const r = checkTimeOverlap('10:00', '14:00', '15:00', '19:00', 0, 30)
    expect(r.overlap).toBe(true)
    expect(r.reason).toContain('90分')
  })

  it('新規公演の追加準備30分でも90分空いていれば OK', () => {
    expect(checkTimeOverlap('10:00', '14:00', '15:30', '19:00', 0, 30).overlap).toBe(false)
  })

  it('既存公演側の追加準備は「新規→既存」の順のときに効く', () => {
    // 新規 10:00-14:00 → 既存 15:00 開始。既存の準備+30分 → 必要90分 > 実際60分
    const r = checkTimeOverlap('15:00', '19:00', '10:00', '14:00', 30, 0)
    expect(r.overlap).toBe(true)
    expect(r.reason).toContain('90分')
  })
})

describe('getEventTimeSlot', () => {
  it('保存された時間帯（日本語）を最優先する', () => {
    expect(getEventTimeSlot({ start_time: '19:00', time_slot: '朝' })).toBe('morning')
    expect(getEventTimeSlot({ start_time: '09:00', time_slot: '夜' })).toBe('evening')
  })

  it('保存値がなければ開始時刻から判定（〜11時=朝 / 12〜17時=昼 / 18時〜=夜）', () => {
    expect(getEventTimeSlot({ start_time: '09:00', time_slot: null })).toBe('morning')
    expect(getEventTimeSlot({ start_time: '11:59', time_slot: null })).toBe('morning')
    expect(getEventTimeSlot({ start_time: '12:00', time_slot: null })).toBe('afternoon')
    expect(getEventTimeSlot({ start_time: '17:00', time_slot: null })).toBe('afternoon')
    expect(getEventTimeSlot({ start_time: '18:00', time_slot: null })).toBe('evening')
  })

  it('不明な保存値は無視して開始時刻にフォールバック', () => {
    expect(getEventTimeSlot({ start_time: '13:00', time_slot: '謎の値' })).toBe('afternoon')
  })
})
