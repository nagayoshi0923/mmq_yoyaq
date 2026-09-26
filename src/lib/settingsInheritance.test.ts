import { describe, expect, it } from 'vitest'
import {
  omitInheritedSettings, resolveInheritedSetting, resolveSetting,
  type SettingLayers,
} from '../../supabase/functions/_shared/settings-inheritance'

describe('設定の継承', () => {
  const layers: SettingLayers = {
    organization: { deadline: 14 }, store: { deadline: 10 },
    scenario: { deadline: 7 }, performance: { deadline: 3 },
  }
  it('公演、シナリオ、店舗、組織共通の順で採用する', () => {
    expect(resolveSetting('deadline', 30, layers)).toEqual({ value: 3, source: 'performance' })
    expect(resolveSetting('deadline', 30, { ...layers, performance: null })).toEqual({ value: 7, source: 'scenario' })
    expect(resolveSetting('deadline', 30, { organization: layers.organization, store: layers.store })).toEqual({ value: 10, source: 'store' })
    expect(resolveSetting('deadline', 30, { organization: layers.organization })).toEqual({ value: 14, source: 'organization' })
  })
  it.each([0, false, '', []])('明示値 %j を未設定として扱わない', value => {
    expect(resolveSetting('value', 'default', { organization: { value: 'common' }, scenario: { value } }))
      .toEqual({ value, source: 'scenario' })
  })
  it('null と未指定だけが共通を継承する', () => {
    expect(resolveSetting('deadline', 30, { ...layers, performance: { deadline: null }, scenario: { deadline: undefined } }))
      .toEqual({ value: 10, source: 'store' })
    expect(resolveSetting('unknown', false, layers)).toEqual({ value: false, source: 'default' })
  })
  it('料率や日程の配列を結合せず、上書きした配列をそのまま使う', () => {
    const fees = [{ hours_before: 24, fee_percentage: 50 }]
    const custom = [{ hours_before: 48, fee_percentage: 100 }]
    expect(resolveSetting('fees', [], { organization: { fees }, scenario: { fees: custom } }).value).toEqual(custom)
    expect(fees).toEqual([{ hours_before: 24, fee_percentage: 50 }])
  })
  it('継承に戻す場合は編集中より下位の値を候補に含めない', () => {
    expect(resolveInheritedSetting('deadline', 30, layers, 'scenario')).toEqual({ value: 10, source: 'store' })
    expect(resolveInheritedSetting('deadline', 30, layers, 'organization')).toEqual({ value: 30, source: 'default' })
  })
  it('組織・店舗だけの項目にシナリオや公演の値を適用しない', () => {
    expect(resolveSetting('deadline', 30, layers, ['organization', 'store'])).toEqual({ value: 10, source: 'store' })
  })
  it('共通へ戻した項目以外の既存値を保持する', () => {
    const existing = { enabled: false, deadline: 0, label: '店舗案内' }
    expect(omitInheritedSettings(existing, ['deadline'])).toEqual({ enabled: false, label: '店舗案内' })
    expect(existing.deadline).toBe(0)
  })
  it('prototype の値を設定として拾わない', () => {
    expect(resolveSetting('constructor', 'default', { organization: {} })).toEqual({ value: 'default', source: 'default' })
  })
})

// DBと画面の標準値が異なると「共通に戻す」で表示と予約条件がずれる。
import { readFileSync } from 'node:fs'
import { SETTING_DEFAULTS } from '../../supabase/functions/_shared/setting-defaults'
it('DB標準値と画面標準値が全項目で一致する', () => {
  const sql = readFileSync('supabase/rpcs/get_operating_setting_default.sql', 'utf8')
  const literal = sql.match(/SELECT '(.*)'::jsonb->p_key;/)?.[1]
  expect(literal).toBeDefined()
  expect(JSON.parse(literal!.replace(/''/g, "'"))).toEqual(SETTING_DEFAULTS)
})
