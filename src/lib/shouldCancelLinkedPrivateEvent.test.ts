import { describe, expect, it } from 'vitest'
import { shouldCancelLinkedPrivateEvent } from './shouldCancelLinkedPrivateEvent'

const privateEvent = { category: 'private', is_private_booking: true, is_cancelled: false }
const flaggedPrivate = { category: 'open', is_private_booking: true, is_cancelled: false }
const openEvent = { category: 'open', is_private_booking: false, is_cancelled: false }

describe('shouldCancelLinkedPrivateEvent', () => {
  it('店舗の却下なら貸切公演を中止する', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: true,
      isCustomerSelfCancel: false,
      event: privateEvent,
      remainingActiveReservationCount: 1,
    })).toBe(true)
  })

  it('顧客が予約サイトから貸切をキャンセルし、有効予約が残らなければ中止する', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: false,
      isCustomerSelfCancel: true,
      event: privateEvent,
      remainingActiveReservationCount: 0,
    })).toBe(true)
  })

  it('is_private_booking だけの貸切も顧客キャンセルで中止する', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: false,
      isCustomerSelfCancel: true,
      event: flaggedPrivate,
      remainingActiveReservationCount: 0,
    })).toBe(true)
  })

  it('顧客キャンセルでも他に有効予約が残っていれば枠は残す', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: false,
      isCustomerSelfCancel: true,
      event: privateEvent,
      remainingActiveReservationCount: 1,
    })).toBe(false)
  })

  it('オープン公演は顧客キャンセルしても中止しない', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: false,
      isCustomerSelfCancel: true,
      event: openEvent,
      remainingActiveReservationCount: 0,
    })).toBe(false)
  })

  it('スタッフが予約だけ消す操作では枠を残す', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: false,
      isCustomerSelfCancel: false,
      event: privateEvent,
      remainingActiveReservationCount: 0,
    })).toBe(false)
  })

  it('中止済み・公演なしは触らない', () => {
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: true,
      isCustomerSelfCancel: true,
      event: { ...privateEvent, is_cancelled: true },
      remainingActiveReservationCount: 0,
    })).toBe(false)
    expect(shouldCancelLinkedPrivateEvent({
      cancelPrivateEventRequested: true,
      isCustomerSelfCancel: true,
      event: null,
      remainingActiveReservationCount: 0,
    })).toBe(false)
  })
})
