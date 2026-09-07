import { describe, expect, it } from 'vitest'
import {
  buildGmAssignmentReleasedBody,
  formatReleasedDateTime,
  removedGmNames,
} from './gmAssignmentReleasedCopy'

describe('gmAssignmentReleasedCopy', () => {
  it('日時を 8/30(日) 18:00〜21:30 形式にする', () => {
    expect(formatReleasedDateTime('2026-08-30', '18:00:00', '21:30:00')).toBe('8/30(日) 18:00〜21:30')
  })

  it('公演中止の文面に絵文字を出さない', () => {
    const body = buildGmAssignmentReleasedBody({
      kind: 'performance_cancelled',
      date: '2026-08-30',
      startTime: '18:00',
      endTime: '21:30',
      storeName: '高田馬場',
      scenarioTitle: '霧罪',
      reason: 'やむを得ない事情により公演を中止',
    })
    expect(body).toBe(
      [
        '公演が中止になりました。',
        '',
        '公演中止',
        '日時　　8/30(日) 18:00〜21:30',
        '店舗　　高田馬場',
        'シナリオ　霧罪',
        '理由　　やむを得ない事情により公演を中止',
      ].join('\n'),
    )
    expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('貸切店舗キャンセルの文面', () => {
    const body = buildGmAssignmentReleasedBody({
      kind: 'private_cancelled_store',
      date: '2026-08-30',
      startTime: '13:00',
      endTime: '17:00',
      storeName: '大塚',
      scenarioTitle: '雨罪',
      customerName: '山田 太郎',
      reason: '会場都合により開催できません',
    })
    expect(body).toContain('貸切がキャンセルされました。')
    expect(body).toContain('貸切キャンセル（店舗操作）')
    expect(body).toContain('お客様　山田 太郎')
    expect(body).toContain('理由　　会場都合により開催できません')
  })

  it('担当変更は外れた人向けの固定理由', () => {
    const body = buildGmAssignmentReleasedBody({
      kind: 'gm_changed',
      date: '2026-08-30',
      startTime: '18:00',
      endTime: '21:30',
      storeName: '高田馬場',
      scenarioTitle: '霧罪',
    })
    expect(body).toBe(
      [
        '担当が変更になりました。',
        '',
        '担当変更',
        '日時　　8/30(日) 18:00〜21:30',
        '店舗　　高田馬場',
        'シナリオ　霧罪',
        '理由　　店舗操作で解除されました',
      ].join('\n'),
    )
  })

  it('外れたGM名だけを返す', () => {
    expect(removedGmNames(['ソラ', 'レナ'], ['レナ'])).toEqual(['ソラ'])
    expect(removedGmNames(['ソラ'], ['ソラ', 'レナ'])).toEqual([])
    expect(removedGmNames(['ソラ', ''], ['ソラ'])).toEqual([])
  })
})
