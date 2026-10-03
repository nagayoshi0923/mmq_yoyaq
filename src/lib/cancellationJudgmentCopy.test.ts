import { describe, expect, it } from 'vitest'
import { buildJudgmentRules, formatMinutesBeforeStart, formatMissingCondition } from './cancellationJudgmentCopy'

describe('中止判定のルールの文面（#714）', () => {
  it('時刻の表し方', () => {
    expect(formatMinutesBeforeStart(240)).toBe('公演開始の4時間前')
    expect(formatMinutesBeforeStart(90)).toBe('公演開始の1時間30分前')
    expect(formatMinutesBeforeStart(45)).toBe('公演開始の45分前')
    expect(formatMinutesBeforeStart(1440)).toBe('公演開始の24時間前')
  })

  it('追加募集の条件（割合・人数）', () => {
    expect(formatMissingCondition('percent', 50)).toBe('最低開催人数まで、不足が最低開催人数の50%以内の場合')
    expect(formatMissingCondition('count', 2)).toBe('最低開催人数まであと2人以内の場合')
  })

  it('追加募集ありの設定では、開催確定・追加募集・中止・期限の4つ', () => {
    const rules = buildJudgmentRules({ judgment_minutes: 240, extension_enabled: true, target_mode: 'percent', target_value: 50, extension_deadline_minutes: 90 })
    expect(rules.map(r => `${r.timing}｜${r.condition}→${r.result}`)).toEqual([
      '公演開始の4時間前（開催判断）｜最低開催人数に達している場合→開催確定',
      '公演開始の4時間前（開催判断）｜最低開催人数まで、不足が最低開催人数の50%以内の場合→公演開始の1時間30分前まで追加募集',
      '公演開始の4時間前（開催判断）｜上記以外で最低開催人数に満たない場合→中止',
      '公演開始の1時間30分前（追加募集の期限）｜最低開催人数に満たない場合→中止（達した場合は開催確定）',
    ])
  })

  it('追加募集なしの設定では、開催確定と中止の2つ', () => {
    const rules = buildJudgmentRules({ judgment_minutes: 240, extension_enabled: false, target_mode: 'count', target_value: 2, extension_deadline_minutes: 90 })
    expect(rules.map(r => r.result)).toEqual(['開催確定', '中止'])
  })
})
