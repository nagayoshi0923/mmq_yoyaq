// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPerStoreSlotsForDate, type BusinessHoursSettingRow } from './privateGroupCandidateSlots'
import { isJapaneseHoliday } from '@/utils/japaneseHolidays'

const db = new PGlite()
beforeAll(async () => {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  await db.exec(readFileSync('supabase/rpcs/private_booking_store_day_slots.sql', 'utf8'))
}, 30_000)
afterAll(async () => { await db.close() })
const open: NonNullable<BusinessHoursSettingRow['opening_hours']>[string] = { is_open: true, open_time: '09:30', close_time: '22:30', available_slots: ['afternoon'], slot_start_times: { afternoon: '14:30' } }
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const base: BusinessHoursSettingRow = {
  store_id: 'fixture', opening_hours: Object.fromEntries(days.map(day => [day, open])),
}
const cases: { name: string; row: BusinessHoursSettingRow | undefined }[] = [
  { name: '行なし', row: undefined },
  { name: '営業時間未設定', row: { ...base, opening_hours: null } },
  { name: '空設定', row: { ...base, opening_hours: {} } },
  { name: '旧データの開店時刻', row: base },
  { name: '大文字の曜日', row: { ...base, opening_hours: { MONDAY: open, SUNDAY: open } } },
  { name: '休日の曜日へのフォールバック', row: { ...base, opening_hours: { monday: open, sunday: { is_open: false } } } },
  { name: '全休業', row: { ...base, opening_hours: { sunday: { is_open: false } } } },
  { name: 'null配列', row: { ...base, holidays: null, special_open_days: null, special_closed_days: null } },
  { name: '明示朝開始', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { ...open, slot_start_times: { morning: '11:00', afternoon: '15:00', evening: '20:00' } }])) } },
  { name: '営業時間だけ', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { is_open: true }])) } },
  { name: '早い閉店', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { ...open, close_time: '18:00' }])) } },
  { name: '深夜閉店は23時まで', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { ...open, close_time: '23:59' }])) } },
]
const dates = ['2026-09-27', '2026-09-28', '2026-10-03', '2026-10-12']
for (const date of dates) {
  cases.push(
    { name: `特別営業${date}`, row: { ...base, opening_hours: { monday: open }, special_open_days: [{ date }] } },
    { name: `特別休業${date}`, row: { ...base, special_closed_days: [{ date }] } },
    { name: `休日${date}`, row: { ...base, holidays: [date] } },
    { name: `営業と休業重複${date}`, row: { ...base, special_open_days: [{ date }], special_closed_days: [{ date }] } },
  )
}
describe('保存側の営業枠と既存画面の一致', () => {
  for (const fixture of cases) {
    it(fixture.name, async () => {
      for (const date of dates) for (const allow of [false, true]) for (const custom of [false, true]) {
        const expected = getPerStoreSlotsForDate(date, fixture.row, () => custom, { allowSyntheticWhenMissingRow: allow }) ?? []
        const { rows } = await db.query<{ slot_key: string; start_minutes: number; end_minutes: number; closing_minutes: number }>(
          'SELECT * FROM private_booking_store_day_slots($1,$2,$3,$4)',
          [date, fixture.row ? JSON.stringify(fixture.row) : null, custom || isJapaneseHoliday(date), allow],
        )
        expect(rows.map(row => ({ key: row.slot_key, startMin: row.start_minutes, endMin: row.end_minutes, dayEndMin: row.closing_minutes })), `${date} missing=${allow} custom=${custom}`).toEqual(expected)
      }
    })
  }
  it('ブラウザから内部ヘルパーを直接呼べない', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query("SELECT * FROM private_booking_store_day_slots('2026-09-28',NULL,false,true)")).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('RESET ROLE') }
  })
})
