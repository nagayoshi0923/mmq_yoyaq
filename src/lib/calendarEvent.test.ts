import { describe, expect, it } from 'vitest'
import {
  buildIcs, calendarEventDescription, calendarEventTimes, calendarEventTitle, googleCalendarUrl, icsFileName, mapSearchUrl, meetingTimeOf,
  type CalendarEventInput,
} from './calendarEvent'

const base: CalendarEventInput = {
  scenarioTitle: '告別詩',
  kind: 'private',
  date: '2026-11-01',
  startTime: '14:00:00',
  endTime: '17:30:00',
  storeName: '馬場店',
  address: '東京都新宿区高田馬場1-2-3, 4F',
  reservationNumber: 'PB-20261101-0001',
  pageUrl: 'https://mmq.game/group/invite/ABC123',
}

describe('calendarEvent', () => {
  it('題名は作品名＋貸切／公演', () => {
    expect(calendarEventTitle(base)).toBe('告別詩（貸切）')
    expect(calendarEventTitle({ scenarioTitle: '告別詩', kind: 'open' })).toBe('告別詩（公演）')
  })

  it('JST の時刻を UTC に直す（端末の時間帯に左右されない）', () => {
    expect(calendarEventTimes(base)).toEqual({ start: '20261101T050000Z', end: '20261101T083000Z' })
  })

  it('終了時刻が無ければ 開演＋所要時間、それも無ければ 3 時間', () => {
    expect(calendarEventTimes({ ...base, endTime: null, durationMinutes: 150 })?.end).toBe('20261101T073000Z')
    expect(calendarEventTimes({ ...base, endTime: null })?.end).toBe('20261101T080000Z')
  })

  it('午前 9 時前の開演は UTC で前日になる・日をまたぐ公演は翌日に終わる', () => {
    expect(calendarEventTimes({ ...base, startTime: '08:30', endTime: '11:00' })).toEqual({ start: '20261031T233000Z', end: '20261101T020000Z' })
    expect(calendarEventTimes({ ...base, startTime: '22:00', endTime: '01:00' })).toEqual({ start: '20261101T130000Z', end: '20261101T160000Z' })
  })

  it('日付・時刻が読めなければ null', () => {
    expect(calendarEventTimes({ ...base, date: '' })).toBeNull()
    expect(googleCalendarUrl({ ...base, startTime: '' })).toBeNull()
    expect(buildIcs({ ...base, startTime: 'x' })).toBeNull()
  })

  it('集合は開演 10 分前', () => {
    expect(meetingTimeOf('14:00')).toBe('13:50')
    expect(meetingTimeOf('00:05')).toBe('23:55')
    expect(meetingTimeOf(null)).toBeNull()
  })

  it('説明に予約番号・集合・ページ・変更の案内', () => {
    expect(calendarEventDescription(base)).toBe([
      '予約番号: PB-20261101-0001',
      '集合: 13:50（開演 10 分前）',
      'グループページ: https://mmq.game/group/invite/ABC123',
      '変更やキャンセルはマイページから',
    ].join('\n'))
    expect(calendarEventDescription({ ...base, kind: 'open', reservationNumber: null, pageUrl: 'https://mmq.game/mypage/reservation/r1' }))
      .toBe('集合: 13:50（開演 10 分前）\n予約詳細: https://mmq.game/mypage/reservation/r1\n変更やキャンセルはマイページから')
  })

  it('Google カレンダーの URL', () => {
    const url = new URL(googleCalendarUrl(base)!)
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('告別詩（貸切）')
    expect(url.searchParams.get('dates')).toBe('20261101T050000Z/20261101T083000Z')
    expect(url.searchParams.get('location')).toBe('馬場店 東京都新宿区高田馬場1-2-3, 4F')
    expect(url.searchParams.get('ctz')).toBe('Asia/Tokyo')
    expect(url.searchParams.get('details')).toContain('予約番号: PB-20261101-0001')
  })

  it('.ics の中身（UTC・文字の逃がし・CRLF・75 バイトで折り返し）', () => {
    const ics = buildIcs(base, new Date(Date.UTC(2026, 9, 11, 3, 0, 0)))!
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    expect(ics).toContain('DTSTART:20261101T050000Z\r\n')
    expect(ics).toContain('DTEND:20261101T083000Z\r\n')
    expect(ics).toContain('DTSTAMP:20261011T030000Z\r\n')
    expect(ics).toContain('UID:mmq-PB-20261101-0001@mmq.game\r\n')
    expect(ics).toContain('SUMMARY:告別詩（貸切）\r\n')
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('LOCATION:馬場店 東京都新宿区高田馬場1-2-3\\, 4F\r\n')
    expect(unfolded).toContain('DESCRIPTION:予約番号: PB-20261101-0001\\n集合: 13:50（開演 10 分前）\\nグループページ: https://mmq.game/group/invite/ABC123\\n変更やキャンセルはマイページから\r\n')
    const encoder = new TextEncoder()
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
  })

  it('.ics では ; , \\ と改行を逃がす', () => {
    const ics = buildIcs({ ...base, storeName: 'A;B', address: 'C\\D' })!.replace(/\r\n /g, '')
    expect(ics).toContain('LOCATION:A\\;B C\\\\D\r\n')
  })

  it('ファイル名は mmq-<予約番号>.ics', () => {
    expect(icsFileName('PB-20261101-0001')).toBe('mmq-PB-20261101-0001.ics')
    expect(icsFileName(null)).toBe('mmq-event.ics')
    expect(icsFileName('../x y')).toBe('mmq-xy.ics')
  })

  it('地図: 店舗の地図 URL を優先、無ければ住所で検索', () => {
    expect(mapSearchUrl('東京都新宿区 1-2', 'https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc')
    expect(mapSearchUrl('東京都新宿区 1-2', 'javascript:alert(1)')).toBe('https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%96%B0%E5%AE%BF%E5%8C%BA%201-2')
    expect(mapSearchUrl('  ')).toBeNull()
    expect(mapSearchUrl(null)).toBeNull()
  })
})
