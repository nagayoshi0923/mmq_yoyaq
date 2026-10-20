// coupon_usages ↔ reservations は外部キーが 2 本あるため、埋め込みで外部キー名を明示しているかを確かめる（PGRST201 の再発防止）
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_COUPON_USAGE_SELECT, ADMIN_CUSTOMER_USAGE_SELECT, COUPON_USAGE_RESERVATION_FK,
  customerUsageSelect, usageReservationEmbed,
} from './usageSelects'

/** reservations を外部キー名なしで埋め込んでいる箇所（`reservations (`・`reservations:reservation_id(` など） */
const UNHINTED_RESERVATIONS = /(^|[\s,(:])reservations\s*(:\s*reservation_id\s*)?(!inner\s*)?\(/m
const UNHINTED_COUPON_USAGES = /(^|[\s,(:])coupon_usages\s*(!inner\s*)?\(/m

describe('使用履歴の select 文字列', () => {
  it('予約の埋め込みに coupon_usages_reservation_id_fkey を付ける', () => {
    expect(COUPON_USAGE_RESERVATION_FK).toBe('coupon_usages_reservation_id_fkey')
    for (const select of [customerUsageSelect(true), customerUsageSelect(false), ADMIN_CUSTOMER_USAGE_SELECT, ADMIN_COUPON_USAGE_SELECT]) {
      expect(select).toContain('reservations!coupon_usages_reservation_id_fkey')
      expect(select).not.toMatch(UNHINTED_RESERVATIONS)
    }
  })
  it('返却キーは従来どおり reservations（画面・型を変えない）', () => {
    expect(usageReservationEmbed('id')).toBe('reservations:reservations!coupon_usages_reservation_id_fkey(id)')
    expect(usageReservationEmbed('id', { inner: true })).toBe('reservations:reservations!coupon_usages_reservation_id_fkey!inner(id)')
  })
  it('お客様一覧: 来店確認の列は新しい DB のときだけ読む', () => {
    expect(customerUsageSelect(true)).toContain('redeemed_at')
    expect(customerUsageSelect(false)).not.toContain('redeemed')
    expect(customerUsageSelect(false)).toContain('stores ( name, short_name )')
  })
  it('お客様一覧: 公演当日の判定に使う公演の日付・開始時刻を、外部キー名を付けて読む（20261020220000）', () => {
    for (const select of [customerUsageSelect(true), customerUsageSelect(false)]) {
      expect(select).toContain('schedule_events!reservations_schedule_event_id_fkey ( date, start_time )')
    }
  })
})

describe('API・画面のコードに外部キー名なしの埋め込みが残っていない', () => {
  const roots = ['api', 'src']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
    }
  }
  roots.forEach(walk)

  it('coupon_usages を読むファイルで reservations を素の名前で埋め込まない', () => {
    const offenders = files.filter(file => {
      const text = readFileSync(file, 'utf8')
      return /from\(['"`]coupon_usages['"`]\)/.test(text) && UNHINTED_RESERVATIONS.test(text)
    })
    expect(offenders).toEqual([])
  })
  it('reservations を読むファイルで coupon_usages を素の名前で埋め込まない', () => {
    const offenders = files.filter(file => {
      const text = readFileSync(file, 'utf8')
      return /from\(['"`]reservations['"`]\)/.test(text) && UNHINTED_COUPON_USAGES.test(text)
    })
    expect(offenders).toEqual([])
  })
})
