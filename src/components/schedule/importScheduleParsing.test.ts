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

import { detectImportVenueColumn, dropDuplicateImportCells, importTimeSlotColumns, mergePreviewEdits, rawImportScenarioText } from './importScheduleParsing'

describe('スケジュール取り込みの列と重複', () => {
  it('店舗の列は 3 列目か 4 列目、時間帯の列はその次から 2 列ずつ', () => {
    expect(detectImportVenueColumn(['10/5', '月', '馬場', 'x'], ['馬場'])).toEqual({ venueIdx: 2, venue: '馬場' })
    expect(detectImportVenueColumn(['10/5', '月', '担当', '馬場'], ['馬場'])).toEqual({ venueIdx: 3, venue: '馬場' })
    expect(detectImportVenueColumn(['10/5', '月', 'タイトル'], ['馬場'])).toBeNull()
    expect(importTimeSlotColumns(2).map(c => [c.titleIdx, c.gmIdx, c.slotName])).toEqual([[3, 4, '朝'], [5, 6, '昼'], [7, 8, '夜']])
    expect(importTimeSlotColumns(3).map(c => [c.titleIdx, c.gmIdx])).toEqual([[4, 5], [6, 7], [8, 9]])
  })
  it('照合前の元のシナリオ名', () => {
    expect(rawImportScenarioText('貸・シノポロ(14-18)🈵')).toBe('シノポロ')
    expect(rawImportScenarioText('募・作品A※要予約')).toBe('作品A')
  })
  it('下見で直した値を反映し、同じセルの 2 件目以降は外して知らせる', () => {
    const merged = mergePreviewEdits([{ notes: '元' }, { notes: '元' }], [{ scenario: 'A', gms: ['松井'], category: 'open' }, undefined])
    expect(merged[0]).toMatchObject({ scenario: 'A', gms: ['松井'], category: 'open', notes: '元' })
    expect(merged[1]).toEqual({ notes: '元' })
    const { filteredEvents, duplicatesInImport } = dropDuplicateImportCells([
      { date: '2026-10-05', store_id: 's1', start_time: '19:00', scenario: 'A', venue: '馬場' },
      { date: '2026-10-05', store_id: 's1', start_time: '19:30', scenario: 'B', venue: '馬場' },
      { date: '2026-10-05', store_id: 's1', start_time: '19:00', scenario: 'C', venue: '馬場', is_cancelled: true },
    ])
    expect(filteredEvents.map(e => e.scenario)).toEqual(['A', 'C'])
    expect(duplicatesInImport).toHaveLength(1)
    expect(duplicatesInImport[0]).toContain('「B」をスキップ（「A」が既にあります）')
  })
})
