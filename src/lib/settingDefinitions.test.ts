import { describe, expect, it } from 'vitest'
import { isValidSettingValue } from '../../supabase/functions/_shared/setting-definitions'

describe('設定の入力と適用範囲', () => {
  it('0 と無効を保存でき、null で継承に戻せる', () => {
    expect(isValidSettingValue('preparation_minutes', 0, 'organization')).toBe(true)
    expect(isValidSettingValue('reminder_enabled', false, 'scenario')).toBe(true)
    expect(isValidSettingValue('reminder_enabled', null, 'performance')).toBe(true)
    expect(isValidSettingValue('reminder_enabled', 'false', 'store')).toBe(false)
  })
  it('上書き可能でない署名項目や未知の項目を拒否する', () => {
    expect(isValidSettingValue('company_name', '組織名', 'organization')).toBe(true)
    expect(isValidSettingValue('company_name', '作品名', 'scenario')).toBe(false)
    expect(isValidSettingValue('resend_api_key', 'secret', 'organization')).toBe(false)
    expect(isValidSettingValue('constructor', null, 'organization')).toBe(false)
  })
  it('金額に影響する料率は数値範囲と構造を確認する', () => {
    const fee = { hours_before: 24, fee_percentage: 50, description: '前日' }
    expect(isValidSettingValue('cancellation_fees', [fee], 'scenario')).toBe(true)
    expect(isValidSettingValue('cancellation_fees', [], 'scenario')).toBe(true)
    for (const bad of [101, -1, NaN, Infinity, '100']) {
      expect(isValidSettingValue('cancellation_fees', [{ ...fee, fee_percentage: bad }], 'scenario')).toBe(false)
    }
    expect(isValidSettingValue('cancellation_fee_basis', 'unknown', 'performance')).toBe(false)
  })
  it('締切・準備時間は範囲内の整数だけを受け付ける', () => {
    for (const bad of [-1, 1441, 0.5, '60', NaN]) {
      expect(isValidSettingValue('preparation_minutes', bad, 'store')).toBe(false)
    }
    expect(isValidSettingValue('judgment_minutes_before', 0, 'organization')).toBe(false)
  })
  it('リマインドの不正な時刻と日数を拒否する', () => {
    const reminder = { days_before: 1, time: '10:00', enabled: false }
    expect(isValidSettingValue('reminder_schedule', [reminder], 'organization')).toBe(true)
    for (const time of ['24:00', '10:60', '9:00', '']) {
      expect(isValidSettingValue('reminder_schedule', [{ ...reminder, time }], 'organization')).toBe(false)
    }
    expect(isValidSettingValue('reminder_schedule', [{ ...reminder, days_before: -1 }], 'organization')).toBe(false)
  })
  it('アンケートURLはHTTP(S)または明示的な空欄に限る', () => {
    expect(isValidSettingValue('survey_url', 'https://example.com/survey', 'scenario')).toBe(true)
    expect(isValidSettingValue('survey_url', '', 'scenario')).toBe(true)
    expect(isValidSettingValue('survey_url', 'javascript:alert(1)', 'scenario')).toBe(false)
  })
})
