import { describe, expect, it } from 'vitest'
import { businessHoursSaveFields, getDefaultOpeningHours, mergeWithDefaults, normalizeBusinessHoursData } from './storeBusinessHours'

describe('店舗営業時間の保存と再読込', () => {
  it('特別営業日・休業日の備考を保存して再表示する', () => {
    const form = normalizeBusinessHoursData('store', null)
    form.special_open_days = [{ date: '2026-09-22', note: '臨時営業' }]
    form.special_closed_days = [{ date: '2026-09-23', note: '設備点検' }]
    const saved = businessHoursSaveFields(form)
    expect(saved.holidays).toEqual(['2026-09-23'])
    const reloaded = normalizeBusinessHoursData('store', saved)
    expect(reloaded.special_open_days).toEqual(form.special_open_days)
    expect(reloaded.special_closed_days).toEqual(form.special_closed_days)
  })
  it('旧holidaysだけの休業日と備考付き休業日を欠落なく引き継ぐ', () => {
    const form = normalizeBusinessHoursData('store', {
      holidays: ['2026-09-23', '2026-09-24'],
      special_closed_days: [{ date: '2026-09-23', note: '点検' }],
    })
    expect(form.special_closed_days).toEqual([{ date: '2026-09-23', note: '点検' }, { date: '2026-09-24', note: '' }])
    expect(businessHoursSaveFields(form).holidays).toEqual(['2026-09-23', '2026-09-24'])
  })
  it('休業日を削除したら旧holidaysからも除去し再読込で復活しない', () => {
    const form = normalizeBusinessHoursData('store', { holidays: ['2026-09-23'] })
    form.special_closed_days = []
    const saved = businessHoursSaveFields(form)
    expect(saved.holidays).toEqual([])
    expect(normalizeBusinessHoursData('store', saved).special_closed_days).toEqual([])
  })
  it('休業・受付枠なし・設定済みの開始時刻を既定値に戻さない', () => {
    const hours = getDefaultOpeningHours()
    hours.monday.is_open = false
    hours.monday.available_slots = []
    hours.monday.slot_start_times = { morning: '09:30', afternoon: '15:00', evening: '20:00' }
    expect(mergeWithDefaults(hours).monday).toEqual(hours.monday)
  })
  it('曜日や別フォームへ配列・時刻の変更が漏れない', () => {
    const first = getDefaultOpeningHours()
    first.monday.available_slots.push('morning')
    first.monday.slot_start_times!.afternoon = '16:00'
    expect(first.tuesday.available_slots).toEqual(['afternoon', 'evening'])
    expect(getDefaultOpeningHours().monday.slot_start_times!.afternoon).toBe('13:00')
  })
  it('新規店舗の曜日別既定値を維持し他店舗の識別子を保存項目に含めない', () => {
    const form = normalizeBusinessHoursData('new-store', null)
    expect(form.store_id).toBe('new-store')
    const fields = businessHoursSaveFields(form)
    expect(fields.opening_hours.saturday.available_slots).toEqual(['morning', 'afternoon', 'evening'])
    expect(fields).not.toHaveProperty('store_id')
    expect(fields).not.toHaveProperty('id')
  })
})
