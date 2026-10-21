// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPerStoreSlotsForDate, type BusinessHoursSettingRow } from './privateGroupCandidateSlots'
import { getPublicPrivateBookingSlotOptions } from './publicPrivateBookingSlots'
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
  // 札幌店の平日（2026-10-20）: 朝を無効にした曜日は朝を返さない。土日は朝も有効
  { name: '平日朝を無効', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, ['saturday', 'sunday'].includes(day)
    ? { is_open: true, open_time: '09:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'] as ('morning' | 'afternoon' | 'evening')[], slot_start_times: { morning: '10:00', afternoon: '14:00', evening: '19:00' } }
    : { is_open: true, open_time: '13:00', close_time: '23:00', available_slots: ['afternoon', 'evening'] as ('morning' | 'afternoon' | 'evening')[], slot_start_times: { morning: '10:00', afternoon: '13:00', evening: '19:00' } }])) } },
  // issue #1200（2026-10-21）: 平日 開店 13:00 でも朝を有効にした店舗（クインズワルツの店舗と同じ）は朝 10:00 を返す。開店時刻は枠の可否を決めない
  { name: '平日開店13時で朝を有効', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, ['saturday', 'sunday'].includes(day)
    ? { is_open: true, open_time: '09:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'] as ('morning' | 'afternoon' | 'evening')[] }
    : { is_open: true, open_time: '13:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'] as ('morning' | 'afternoon' | 'evening')[], slot_start_times: { morning: '10:00', afternoon: '13:00', evening: '19:00' } }])) } },
  // 作品の開始時刻（I11）を反映した後の形: 昼 12:00 は開店 13:00 より前でも返す
  { name: '昼の開始が開店前', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { is_open: true, open_time: '13:00', close_time: '23:00', available_slots: ['afternoon', 'evening'] as ('morning' | 'afternoon' | 'evening')[], slot_start_times: { morning: '10:00', afternoon: '12:00', evening: '19:00' } }])) } },
  { name: '有効な枠が空', row: { ...base, opening_hours: Object.fromEntries(days.map(day => [day, { ...open, available_slots: [] }])) } },
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
        // 公開トップの入口（respectConfiguredHours）も同じ枠・同じ開始時刻。違いは枠の終わりを閉店時刻で切ることだけ
        // （DB でも営業中の範囲は閉店までなので、閉店以降に始まる枠は closed になる）。2026-10-21 issue #1200
        // 例外: 有効な枠が空の配列の曜日は、入口では枠なし（DB は 3 枠とも有効。未整理の食い違いとして残す）
        if (fixture.name === '有効な枠が空') continue
        const entry = getPerStoreSlotsForDate(date, fixture.row, () => custom, { allowSyntheticWhenMissingRow: allow, respectConfiguredHours: true }) ?? []
        expect(entry, `入口 ${date} missing=${allow} custom=${custom}`).toEqual(rows
          .map(row => ({ key: row.slot_key, startMin: row.start_minutes, endMin: Math.min(row.end_minutes, row.closing_minutes), dayEndMin: row.closing_minutes }))
          .filter(row => row.startMin < row.endMin))
      }
    })
  }
  // issue #1203: 公開入口が作品選択へ渡す店舗は、渡す店舗の数で DB が合成するか（p_allow_missing = 1 店だけ）を決めても、同じ枠を受け付ける
  it('公開入口が渡す店舗は、DB でも同じ枠を持つ（営業設定なしの店が複数でも食い違わない）', async () => {
    const none = (id: string): BusinessHoursSettingRow => ({ store_id: id, opening_hours: null })
    const sapporo = { ...cases.find(c => c.name === '平日朝を無効')!.row!, store_id: 'sapporo' }
    const sets: BusinessHoursSettingRow[][] = [[none('n1')], [none('n1'), none('n2')], [none('n1'), sapporo], [none('n1'), none('n2'), sapporo], [sapporo]]
    for (const date of ['2030-01-08', '2030-01-12']) for (const rows of sets) for (const slot of ['morning', 'afternoon', 'evening'] as const) {
      const hours = new Map(rows.map(r => [r.store_id, r]))
      const passed = getPublicPrivateBookingSlotOptions(date, slot, rows.map(r => r.store_id), hours, [], [], () => false).map(o => o.storeId)
      for (const storeId of passed) {
        const { rows: dbRows } = await db.query<{ slot_key: string }>('SELECT slot_key FROM private_booking_store_day_slots($1,$2,$3,$4)',
          [date, hours.get(storeId)?.opening_hours ? JSON.stringify(hours.get(storeId)) : null, isJapaneseHoliday(date), passed.length === 1])
        expect(dbRows.map(r => r.slot_key), `${date} ${slot} ${rows.map(r => r.store_id).join(',')} → ${passed.join(',')}`).toContain(slot)
      }
      if (rows.filter(r => !r.opening_hours).length > 1 && !rows.some(r => r.opening_hours)) expect(passed, `${date} ${slot} 未設定のみ複数`).toEqual([])
    }
  })
  it('ブラウザから内部ヘルパーを直接呼べない', async () => {
    await db.exec('SET ROLE authenticated')
    try {
      await expect(db.query("SELECT * FROM private_booking_store_day_slots('2026-09-28',NULL,false,true)")).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('RESET ROLE') }
  })
})
