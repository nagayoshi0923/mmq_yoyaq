import { describe, expect, it } from 'vitest'
import {
  determineImportCategory, extractImportNotes, extractImportReservationInfo, extractImportScenarioName,
  isImportCancelled, parseImportGmNames, parseImportGmNamesWithMapping,
} from './importScheduleParsing'

const noMatch = () => null

describe('スケジュール取り込みの読み取り規則', () => {
  it('カテゴリ: 先頭の記号と中身で判定する', () => {
    expect(determineImportCategory('貸・シノポロ 後藤様')).toBe('private')
    expect(determineImportCategory('募・女皇の書架')).toBe('open')
    expect(determineImportCategory('出張 道化')).toBe('offsite')
    expect(determineImportCategory('GMテスト作品A')).toBe('gmtest')
    expect(determineImportCategory('テスプ・作品B')).toBe('testplay')
    expect(determineImportCategory('場所貸し')).toBe('venue_rental')
    expect(determineImportCategory('全体MTG')).toBe('mtg')
    expect(determineImportCategory('作品C 田中様')).toBe('private')
    expect(determineImportCategory('作品D')).toBe('open')
  })

  it('シナリオ名: 記号・時間・お客様名・価格を外し、照合できればその作品名', () => {
    expect(extractImportScenarioName('女皇の書架(14.5-18)ガッ経由', noMatch)).toBe('女皇の書架')
    expect(extractImportScenarioName('貸・シノポロ 後藤茜様', noMatch)).toBe('シノポロ')
    expect(extractImportScenarioName('募・作品A✅🈵', noMatch)).toBe('作品A')
    expect(extractImportScenarioName('全体MTG', noMatch)).toBe('MTG（マネージャーミーティング）')
    expect(extractImportScenarioName('', noMatch)).toBe('')
    expect(extractImportScenarioName('じょこうのしょか', (t) => t === 'じょこうのしょか' ? '女皇の書架' : null)).toBe('女皇の書架')
  })

  it('予約情報・注記・中止の印', () => {
    expect(extractImportReservationInfo('シノポロ 後藤様 30000円')).toBe('シノポロ 後藤様 / 30000円')
    expect(extractImportReservationInfo('作品A')).toBeUndefined()
    expect(extractImportNotes('作品A✅🈳3 ※要予約 指定')).toBe('※要予約 指定 / 告知済み / 空き3 / GM指定')
    expect(extractImportNotes('作品A')).toBeUndefined()
    expect(isImportCancelled('作品A🙅')).toBe(true)
    expect(isImportCancelled('作品A')).toBe(false)
  })

  it('GM 名: 括弧・印を外し、変更の矢印は後ろを使い、照合した名前に直す', () => {
    const match = (n: string) => (n === 'がっ' ? 'がっちゃん' : null)
    expect(parseImportGmNames('松井(サブ)、がっ', match)).toEqual(['松井', 'がっちゃん'])
    expect(parseImportGmNames('A→B/C✅', noMatch)).toEqual(['B', 'C'])
    expect(parseImportGmNames('  ', noMatch)).toEqual([])
    expect(parseImportGmNamesWithMapping('がっ,えいきち', match)).toEqual({ gms: ['がっちゃん', 'えいきち'], mappings: [{ from: 'がっ', to: 'がっちゃん' }] })
  })
})
