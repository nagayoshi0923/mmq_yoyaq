import { describe, expect, it } from 'vitest'
import {
  buildSummaryMessage, normalizeCheckResult, planEventNotifications, resolveCheckType,
  summaryEventsForOrganization, summaryKindLabel, summaryResultLabel, type EventDetail,
} from '../../supabase/functions/_shared/performance-check-judgment'

const ev = (over: Partial<EventDetail>): EventDetail => ({
  event_id: 'e1', date: '2026-10-05', start_time: '14:00:00', scenario: '作品A', store_name: '馬場',
  current_participants: 4, max_participants: 6, result: 'confirmed', category: 'open', organization_id: 'org1', gms: [], ...over,
})
// 日本時間の h 時ちょうど
const jst = (h: number) => new Date(Date.UTC(2026, 9, 4, (h + 24 - 9) % 24))

describe('判定の種類の決定', () => {
  it('指定があればそのまま使う', () => {
    expect(resolveCheckType('recruitment_deadline', jst(10))).toMatchObject({ checkType: 'recruitment_deadline', defaulted: false })
    expect(resolveCheckType('day_before_preview', jst(10))).toMatchObject({ checkType: 'day_before_preview', defaulted: false })
  })
  it('指定が無い・不正なら日本時間で決める（21時=予告、23時〜0時台=前日判断、他=4時間前）', () => {
    expect(resolveCheckType(undefined, jst(21))).toMatchObject({ checkType: 'day_before_preview', defaulted: true, jstHour: 21 })
    expect(resolveCheckType('bogus', jst(23)).checkType).toBe('day_before')
    expect(resolveCheckType('', jst(0)).checkType).toBe('day_before')
    expect(resolveCheckType(undefined, jst(1)).checkType).toBe('four_hours_before')
    expect(resolveCheckType(undefined, jst(22)).checkType).toBe('four_hours_before')
  })
})

describe('判定結果の集計', () => {
  it('配列の先頭行を読み、欠けた値は0・空にする', () => {
    expect(normalizeCheckResult([{ events_checked: 3, events_extended: 1, details: [ev({})] }], true))
      .toEqual({ events_checked: 3, events_confirmed: 0, events_extended: 1, events_cancelled: 0, details: [ev({})] })
    expect(normalizeCheckResult(null, true)).toEqual({ events_checked: 0, events_confirmed: 0, events_extended: 0, events_cancelled: 0, details: [] })
  })
  it('4時間前判断では延長件数を持たない', () => {
    expect(normalizeCheckResult({ events_checked: 1, events_extended: 9 }, false)).not.toHaveProperty('events_extended')
  })
})

describe('公演ごとの案内', () => {
  it('中止・延長・開催決定を振り分け、個別期限つきと開催が決まっている区分は出さない', () => {
    const plan = planEventNotifications([
      ev({ event_id: 'c', result: 'cancelled' }),
      ev({ event_id: 'x', result: 'extended' }),
      ev({ event_id: 'o', result: 'confirmed', category: 'open' }),
      ev({ event_id: 'p', result: 'confirmed', category: 'private' }),
      ev({ event_id: 'r', result: 'cancelled', recruitment_deadline: '2026-10-05T03:30:00Z' }),
      ev({ event_id: 'u', result: 'unknown' }),
    ])
    expect(plan.map(p => `${p.kind}:${p.event.event_id}`)).toEqual(['cancelled:c', 'extended:x', 'confirmed:o'])
  })
})

describe('業務連絡', () => {
  it('見出しと結果の札', () => {
    expect(summaryKindLabel('four_hours_before', true)).toBe('予告')
    expect(summaryKindLabel('recruitment_deadline', false)).toBe('開催・追加募集の判断')
    expect(summaryKindLabel('four_hours_before', false)).toBe('開催判断')
    expect(summaryKindLabel('day_before', false)).toBe('中止判断')
    expect(summaryResultLabel({ result: 'confirmed', category: 'gmtest' })).toBe('【開催決定｜GMテスト】')
    expect(summaryResultLabel({ result: 'confirmed', category: 'open' })).toBe('【開催決定】')
    expect(summaryResultLabel({ result: 'extended' })).toBe('【募集延長】')
    expect(summaryResultLabel({ result: 'x' })).toBe('【不明】')
  })
  it('組織ごとに開始時刻順で並べ、本文を作る（GM はメンションに置き換え）', () => {
    const events = summaryEventsForOrganization([
      ev({ event_id: 'b', start_time: '19:00:00', result: 'cancelled', gms: ['えいきち', '花子'] }),
      ev({ event_id: 'other', organization_id: 'org2' }),
      ev({ event_id: 'a', start_time: '13:00:00', scenario: '', store_name: '' }),
    ], 'org1')
    expect(events.map(e => e.event_id)).toEqual(['a', 'b'])
    expect(buildSummaryMessage({
      orgEvents: events, gmMentionMap: { えいきち: '<@1>' }, kindLabel: '中止判断', isPreview: false,
      targetDate: '10/5', executedAt: '10/4 23:59',
    })).toBe([
      '📋 **10/5 中止判断**', '',
      '判定: 2件 | 開催決定: 1件 | 募集延長: 0件 | 中止: 1件', '',
      '【開催決定】 13:00 **未設定** (4/6名)',
      '【中止】 19:00 **作品A** (4/6名) @馬場 GM: <@1>, 花子', '',
      '_実行時刻: 10/4 23:59_',
    ].join('\n'))
  })
  it('予告は見出しの下に説明を足す', () => {
    const text = buildSummaryMessage({ orgEvents: [], gmMentionMap: {}, kindLabel: '予告', isPreview: true, targetDate: '10/5', executedAt: '10/4 21:00' })
    expect(text.split('\n').slice(0, 2)).toEqual(['📋 **10/5 予告**', '23:59 の中止判断と同じ計算です。まだ公演は変えていません。'])
  })
})
