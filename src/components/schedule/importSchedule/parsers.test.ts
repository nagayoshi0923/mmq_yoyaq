import { describe, expect, it } from 'vitest'
import { isQuote, parseTsvLines, parseTsvCells, parseTimeFromTitle, parseDate } from './parsers'

describe('isQuote', () => {
  it('ASCII引用符と日本語引用符を引用符と判定する', () => {
    expect(isQuote('"')).toBe(true)
    expect(isQuote('「')).toBe(true)
    expect(isQuote('」')).toBe(true)
    expect(isQuote('『')).toBe(true)
    expect(isQuote('』')).toBe(true)
  })
  it('通常文字は引用符でない', () => {
    expect(isQuote('a')).toBe(false)
    expect(isQuote('\t')).toBe(false)
    expect(isQuote('\n')).toBe(false)
  })
})

describe('parseTsvLines', () => {
  it('改行で行分割する', () => {
    expect(parseTsvLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })
  it('引用符内の改行では分割しない', () => {
    expect(parseTsvLines('a\n「b\nc」\nd')).toEqual(['a', '「b\nc」', 'd'])
  })
  it('末尾の空行は結果に含めない', () => {
    expect(parseTsvLines('a\n')).toEqual(['a'])
  })
})

describe('parseTsvCells', () => {
  it('タブでセル分割しトリムする', () => {
    expect(parseTsvCells('a\t b \tc')).toEqual(['a', 'b', 'c'])
  })
  it('引用符内のタブでは分割しない（引用符自体は除去・内部タブは保持）', () => {
    expect(parseTsvCells('「a\tb」\tc')).toEqual(['a\tb', 'c'])
  })
  it('セル内改行は空白に置換する', () => {
    expect(parseTsvCells('a\nb\tc')).toEqual(['a b', 'c'])
  })
})

describe('parseTimeFromTitle', () => {
  it('整数時刻を HH:MM に変換する', () => {
    expect(parseTimeFromTitle('シナリオ名(13-17)')).toEqual({ start: '13:00', end: '17:00' })
  })
  it('小数時刻（.5=30分）を変換する', () => {
    expect(parseTimeFromTitle('テスト(9.5-12)')).toEqual({ start: '09:30', end: '12:00' })
  })
  it('時刻表記がなければ null', () => {
    expect(parseTimeFromTitle('時刻なしタイトル')).toBeNull()
  })
})

describe('parseDate', () => {
  it('M/D を指定年付き YYYY-MM-DD に変換しゼロ埋めする', () => {
    expect(parseDate('5/2', 2026)).toBe('2026-05-02')
    expect(parseDate('12/31', 2026)).toBe('2026-12-31')
  })
  it('スラッシュが無い/形式不正なら空文字', () => {
    expect(parseDate('20260502', 2026)).toBe('')
    expect(parseDate('5/2/3', 2026)).toBe('')
    expect(parseDate('5/', 2026)).toBe('')
    expect(parseDate('', 2026)).toBe('')
  })
})
