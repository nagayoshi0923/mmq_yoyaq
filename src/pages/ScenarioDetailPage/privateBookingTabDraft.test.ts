// @vitest-environment jsdom
// B29: 貸切タブの選択の預かり（同じ組織・作品・利用者だけ、未ログインの預かりはログインした人へ引き継ぐ、30 分・形・過去日）
import { beforeEach, describe, expect, it } from 'vitest'
import { PRIVATE_BOOKING_TAB_DRAFT_KEY, PRIVATE_BOOKING_TAB_DRAFT_MAX_AGE_MS, readPrivateBookingTabDraft, savePrivateBookingTabDraft } from './privateBookingTabDraft'

const slot = (date: string) => ({ date, slot: { label: '夜', startTime: '19:00', endTime: '22:00' } })
const base = { scope: 'org-1:sm1', owner: 'anon', tab: 'private' as const, timeSlots: [slot('2026-11-10'), slot('2026-11-11')], storeIds: ['st1'], month: '2026-11' }
const NOW = Date.parse('2026-10-29T12:00:00+09:00')
beforeEach(() => sessionStorage.clear())

describe('貸切タブの選択の預かり', () => {
  it('同じ組織・作品・利用者なら読める（読んでも消えない＝戻るたびに同じ続き）', () => {
    savePrivateBookingTabDraft(base, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)?.timeSlots).toHaveLength(2)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)).not.toBeNull()
  })
  it('別の作品・別の組織では使わない', () => {
    savePrivateBookingTabDraft(base, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm2', 'anon', '2026-10-29', NOW)).toBeNull()
    expect(readPrivateBookingTabDraft('org-2:sm1', 'anon', '2026-10-29', NOW)).toBeNull()
  })
  it('未ログインの預かりはログインした利用者へ引き継ぐ。ログイン済みの利用者の預かりは別の利用者・未ログインには使わない', () => {
    savePrivateBookingTabDraft(base, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'user-x', '2026-10-29', NOW)).not.toBeNull()
    savePrivateBookingTabDraft({ ...base, owner: 'user-x' }, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'user-y', '2026-10-29', NOW)).toBeNull()
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)).toBeNull()
    expect(readPrivateBookingTabDraft('org-1:sm1', 'user-x', '2026-10-29', NOW)).not.toBeNull()
  })
  it('30 分を超えた預かりは使わずに消す', () => {
    savePrivateBookingTabDraft(base, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW + PRIVATE_BOOKING_TAB_DRAFT_MAX_AGE_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)).toBeNull()
  })
  it('形が崩れた預かりは使わずに消す。7 件以上・不正な日付は預けない', () => {
    sessionStorage.setItem(PRIVATE_BOOKING_TAB_DRAFT_KEY, '{"scope":1}')
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)).toBeNull()
    expect(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)).toBeNull()
    savePrivateBookingTabDraft({ ...base, timeSlots: [{ date: '11/10', slot: base.timeSlots[0].slot }] }, NOW)
    expect(sessionStorage.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)).toBeNull()
    savePrivateBookingTabDraft({ ...base, timeSlots: Array.from({ length: 8 }, (_, i) => slot(`2026-11-${10 + i}`)) }, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)?.timeSlots).toHaveLength(6)
  })
  it('今日より前の候補日は戻さない', () => {
    savePrivateBookingTabDraft({ ...base, timeSlots: [slot('2026-10-28'), slot('2026-11-10')] }, NOW)
    expect(readPrivateBookingTabDraft('org-1:sm1', 'anon', '2026-10-29', NOW)?.timeSlots.map((t) => t.date)).toEqual(['2026-11-10'])
  })
})
