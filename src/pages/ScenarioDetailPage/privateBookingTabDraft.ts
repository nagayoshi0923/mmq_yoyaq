/**
 * 作品ページの貸切タブで選んでいる候補日時・店舗・表示月を、同じタブの中だけで預かる（B29、2026-10-29 社長承認）。
 * 候補を 6 件選んでログインの入口へ進み、ブラウザの「戻る」で作品ページへ戻ると、候補 0 件・表示月が今月に戻っていた。
 *
 * 決まり:
 * - 預け先はタブ内（sessionStorage）。組織・作品が同じで、利用者が同じときだけ戻す（別の作品・組織・利用者へ流用しない）。
 *   例外: 未ログインで預けた選択は、同じタブでログインした利用者に引き継ぐ（ログインの前後で続ける）。
 *   ログイン済みの利用者の預かりは、別の利用者・ログアウト後（未ログイン）には戻さない
 * - 30 分を超えた預かり・形が崩れた預かりは使わずに消す。今日より前の候補日は戻さない（空き・受付範囲は画面の既存の再確認に通す）
 * - 申込を送ったら消す（送った候補を戻さない）
 * - 氏名・電話などの個人情報は預けない
 * - ログイン成功後に 1 回だけ戻す仕組み（PR #1224 の privateBookingLoginDraft）とは別の鍵。ここはログインしないで戻った場合も含めた画面の続き
 */

export const PRIVATE_BOOKING_TAB_DRAFT_KEY = 'privateBookingTabDraft'
export const PRIVATE_BOOKING_TAB_DRAFT_MAX_AGE_MS = 30 * 60 * 1000
const MAX_TIME_SLOTS = 6

export type PrivateBookingTabDraftSlot = { date: string; slot: { label: string; startTime: string; endTime: string } }

export interface PrivateBookingTabDraft {
  /** `${organizationId}:${scenarioMasterId}` */
  scope: string
  /** 預けた利用者（未ログインは anon） */
  owner: string
  tab: 'private' | 'schedule'
  timeSlots: PrivateBookingTabDraftSlot[]
  storeIds: string[]
  /** 表示していた月（YYYY-MM） */
  month: string
  savedAt: number
}

export function privateBookingTabDraftScope(organizationId: string, scenarioMasterId: string): string {
  return `${organizationId}:${scenarioMasterId}`
}

export function privateBookingTabDraftOwner(userId: string | null | undefined): string {
  return userId || 'anon'
}

function storage(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const YM = /^\d{4}-\d{2}$/
const HM = /^\d{2}:\d{2}(:\d{2})?$/

function isSlot(value: unknown): value is PrivateBookingTabDraftSlot {
  if (!value || typeof value !== 'object') return false
  const v = value as { date?: unknown; slot?: { label?: unknown; startTime?: unknown; endTime?: unknown } }
  return typeof v.date === 'string' && YMD.test(v.date)
    && !!v.slot && typeof v.slot.label === 'string' && v.slot.label.length <= 20
    && typeof v.slot.startTime === 'string' && HM.test(v.slot.startTime)
    && typeof v.slot.endTime === 'string' && HM.test(v.slot.endTime)
}

function parse(raw: string | null): PrivateBookingTabDraft | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<PrivateBookingTabDraft>
    if (typeof v.scope !== 'string' || v.scope.length > 200) return null
    if (typeof v.owner !== 'string' || v.owner.length > 64) return null
    if (v.tab !== 'private' && v.tab !== 'schedule') return null
    if (typeof v.month !== 'string' || !YM.test(v.month)) return null
    if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return null
    if (!Array.isArray(v.timeSlots) || v.timeSlots.length > MAX_TIME_SLOTS || !v.timeSlots.every(isSlot)) return null
    if (!Array.isArray(v.storeIds) || v.storeIds.length > 50 || !v.storeIds.every((id) => typeof id === 'string' && id.length <= 64)) return null
    return {
      scope: v.scope, owner: v.owner, tab: v.tab, month: v.month, savedAt: v.savedAt,
      timeSlots: v.timeSlots.map((t) => ({ date: t.date, slot: { label: t.slot.label, startTime: t.slot.startTime, endTime: t.slot.endTime } })),
      storeIds: [...v.storeIds],
    }
  } catch {
    return null
  }
}

export function savePrivateBookingTabDraft(draft: Omit<PrivateBookingTabDraft, 'savedAt'>, now: number = Date.now()): void {
  const s = storage()
  if (!s) return
  const value: PrivateBookingTabDraft = { ...draft, timeSlots: draft.timeSlots.slice(0, MAX_TIME_SLOTS), savedAt: now }
  if (!parse(JSON.stringify(value))) return
  try { s.setItem(PRIVATE_BOOKING_TAB_DRAFT_KEY, JSON.stringify(value)) } catch { /* 容量超過など。預けられなくても画面は使える */ }
}

/**
 * この組織・作品・利用者の預かりを読む（消さない。戻るたびに同じ続きを出す）。別の範囲・古い・壊れた預かりは消して null。
 * 今日より前の候補日は除く
 */
export function readPrivateBookingTabDraft(scope: string, owner: string, todayYmd: string, now: number = Date.now()): PrivateBookingTabDraft | null {
  const s = storage()
  if (!s) return null
  const draft = parse(s.getItem(PRIVATE_BOOKING_TAB_DRAFT_KEY))
  if (!draft) { s.removeItem(PRIVATE_BOOKING_TAB_DRAFT_KEY); return null }
  if (draft.scope !== scope) return null
  // 別の利用者の預かりは使わない（未ログインで預けたものだけ、ログインした利用者へ引き継ぐ）
  if (draft.owner !== owner && draft.owner !== 'anon') return null
  if (now - draft.savedAt > PRIVATE_BOOKING_TAB_DRAFT_MAX_AGE_MS || now < draft.savedAt) { s.removeItem(PRIVATE_BOOKING_TAB_DRAFT_KEY); return null }
  return { ...draft, timeSlots: draft.timeSlots.filter((t) => t.date >= todayYmd) }
}

export function clearPrivateBookingTabDraft(): void {
  storage()?.removeItem(PRIVATE_BOOKING_TAB_DRAFT_KEY)
}
