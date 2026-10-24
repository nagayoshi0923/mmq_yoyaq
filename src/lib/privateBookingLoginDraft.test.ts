// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  PRIVATE_BOOKING_LOGIN_DRAFT_KEY,
  PRIVATE_BOOKING_LOGIN_DRAFT_MAX_AGE_MS,
  savePrivateBookingLoginDraft,
  takePrivateBookingLoginDraft,
} from './privateBookingLoginDraft'

const PATH = '/queens-waltz/scenario/usagi'
const slots = [
  { date: '2026-11-03', slot: { label: '午後', startTime: '14:00', endTime: '18:00' } },
  { date: '2026-11-08', slot: { label: '夜', startTime: '19:00', endTime: '23:00' } },
]

describe('ログインの間だけ貸切の選択を預ける（QW-20261023-001）', () => {
  afterEach(() => sessionStorage.clear())

  it('同じ作品に戻ったら 1 回だけ取り出せる（再読み込みでは出ない）', () => {
    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots, storeIds: ['s1', 's2'], openRequest: true }, 1000)
    const draft = takePrivateBookingLoginDraft(PATH, 2000)
    expect(draft).toMatchObject({ pathname: PATH, timeSlots: slots, storeIds: ['s1', 's2'], openRequest: true })
    expect(takePrivateBookingLoginDraft(PATH, 2001)).toBeNull()
  })

  it('別の作品・30 分より古い・壊れた預かりは使わずに消す', () => {
    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots, storeIds: [], openRequest: true }, 0)
    expect(takePrivateBookingLoginDraft('/queens-waltz/scenario/other', 1)).toBeNull()
    expect(sessionStorage.getItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)).toBeNull()

    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots, storeIds: [], openRequest: true }, 0)
    expect(takePrivateBookingLoginDraft(PATH, PRIVATE_BOOKING_LOGIN_DRAFT_MAX_AGE_MS + 1)).toBeNull()

    sessionStorage.setItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY, '{"pathname":"//evil","timeSlots":[],"storeIds":[],"savedAt":0}')
    expect(takePrivateBookingLoginDraft('//evil', 1)).toBeNull()
    sessionStorage.setItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY, 'not json')
    expect(takePrivateBookingLoginDraft(PATH, 1)).toBeNull()
  })

  it('押し直したら新しい選択で上書きする（二重押しでも 1 件）', () => {
    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots.slice(0, 1), storeIds: ['s1'], openRequest: true }, 10)
    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots, storeIds: ['s2'], openRequest: true }, 20)
    expect(takePrivateBookingLoginDraft(PATH, 30)?.storeIds).toEqual(['s2'])
  })

  it('候補日時と店舗 ID 以外は預けない', () => {
    savePrivateBookingLoginDraft({ pathname: PATH, timeSlots: slots, storeIds: ['s1'], openRequest: true }, 10)
    const raw = JSON.parse(sessionStorage.getItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)!)
    expect(Object.keys(raw).sort()).toEqual(['openRequest', 'pathname', 'savedAt', 'storeIds', 'timeSlots'])
  })
})
