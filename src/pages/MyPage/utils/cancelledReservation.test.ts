import { expect, it } from 'vitest'
import type { Reservation } from '@/types'
import { cancelledDateReplacement, classifyCancellation } from './cancelledReservation'

it('取り下げ・店舗都合・お客様都合を理由で分け、分からないものは「キャンセル」', () => {
  expect(classifyCancellation('お客様による貸切申込の取り下げ')).toBe('withdrawn')
  expect(classifyCancellation('貸切リクエストを却下しました')).toBe('store')
  expect(classifyCancellation('人数未達による公演中止（前日判定）')).toBe('store')
  expect(classifyCancellation('誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。')).toBe('store')
  expect(classifyCancellation('お客様によるキャンセル')).toBe('customer')
  expect(classifyCancellation('追加募集の開催判断待ちによる無料辞退（キャンセル料0円）')).toBe('customer')
  expect(classifyCancellation(null)).toBe('customer')
})

const r = (o: Partial<Reservation>) => ({ id: 'r', status: 'cancelled', schedule_event_id: null, candidate_datetimes: { candidates: [{}, {}] }, ...o }) as unknown as Reservation

it('貸切の申込中の取り下げ・却下は候補日を日付として出さない', () => {
  expect(cancelledDateReplacement(r({ cancellation_reason: 'お客様による貸切申込の取り下げ' }), true)).toBe('候補日 2 件で申込中だったもの')
  expect(cancelledDateReplacement(r({ cancellation_reason: '貸切リクエストを却下しました', schedule_event_id: 'e' }), true)).toBe('候補日 2 件で申込中だったもの')
  expect(cancelledDateReplacement(r({ cancellation_reason: 'x', candidate_datetimes: null }), true)).toBe('日程確定前の申込')
})

it('確定後にキャンセルした貸切と一般公演は日付を出す', () => {
  expect(cancelledDateReplacement(r({ cancellation_reason: 'お客様によるキャンセル', schedule_event_id: 'e' }), true)).toBeNull()
  expect(cancelledDateReplacement(r({ cancellation_reason: 'お客様によるキャンセル' }), false)).toBeNull()
})
