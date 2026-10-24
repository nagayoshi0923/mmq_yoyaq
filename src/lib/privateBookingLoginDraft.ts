/**
 * 作品ページの貸切タブで選んだ候補日時・店舗を、ログインの間だけ同じタブに預ける（QW-20261023-001）。
 *
 * 決まり:
 * - 「貸切リクエスト」を未ログインで押したときに預け、ログインして同じ作品ページに戻ったら 1 回だけ取り出して消す。
 * - 戻り先（どの作品か）は URL の ?redirect= が正。ここに預けるのは画面の中の選択だけ（日付・時間帯・店舗 ID）。
 *   氏名・電話などの個人情報は預けない。
 * - 古い預かり（30 分を超えたもの・別の作品のもの・形が崩れたもの）は使わずに消す。
 * - sessionStorage が使えない環境（プライベートモード等）では何もしない（URL での戻りはそのまま効く）。
 */

export const PRIVATE_BOOKING_LOGIN_DRAFT_KEY = 'privateBookingLoginDraft'
/** 預かりの有効時間（ログインに手間取っても間に合う長さ。それより古い選択は空き状況が変わっている前提で捨てる） */
export const PRIVATE_BOOKING_LOGIN_DRAFT_MAX_AGE_MS = 30 * 60 * 1000
/** 貸切リクエストで選べる候補の上限（usePrivateBooking の MAX_SELECTIONS と同じ） */
const MAX_TIME_SLOTS = 6

export type PrivateBookingDraftSlot = {
  date: string
  slot: { label: string; startTime: string; endTime: string }
}

export type PrivateBookingLoginDraft = {
  /** 預けた作品ページのパス（クエリなし） */
  pathname: string
  timeSlots: PrivateBookingDraftSlot[]
  storeIds: string[]
  /** 戻ったら貸切リクエストの確認画面をそのまま開く */
  openRequest: boolean
  savedAt: number
}

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const HM = /^\d{2}:\d{2}(:\d{2})?$/

function isSlot(value: unknown): value is PrivateBookingDraftSlot {
  if (!value || typeof value !== 'object') return false
  const v = value as { date?: unknown; slot?: { label?: unknown; startTime?: unknown; endTime?: unknown } }
  return typeof v.date === 'string' && YMD.test(v.date)
    && !!v.slot && typeof v.slot.label === 'string' && v.slot.label.length <= 20
    && typeof v.slot.startTime === 'string' && HM.test(v.slot.startTime)
    && typeof v.slot.endTime === 'string' && HM.test(v.slot.endTime)
}

function parse(raw: string | null): PrivateBookingLoginDraft | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<PrivateBookingLoginDraft>
    if (typeof v.pathname !== 'string' || !v.pathname.startsWith('/') || v.pathname.startsWith('//')) return null
    if (typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt)) return null
    if (!Array.isArray(v.timeSlots) || v.timeSlots.length > MAX_TIME_SLOTS || !v.timeSlots.every(isSlot)) return null
    if (!Array.isArray(v.storeIds) || v.storeIds.length > 50 || !v.storeIds.every(id => typeof id === 'string' && id.length <= 64)) return null
    return {
      pathname: v.pathname,
      timeSlots: v.timeSlots.map(ts => ({ date: ts.date, slot: { label: ts.slot.label, startTime: ts.slot.startTime, endTime: ts.slot.endTime } })),
      storeIds: [...v.storeIds],
      openRequest: v.openRequest === true,
      savedAt: v.savedAt,
    }
  } catch {
    return null
  }
}

/** ログインへ出る前に選択を預ける（同じ作品で押し直したら上書き） */
export function savePrivateBookingLoginDraft(
  draft: Omit<PrivateBookingLoginDraft, 'savedAt'>,
  now: number = Date.now(),
): void {
  const s = storage()
  if (!s) return
  const value: PrivateBookingLoginDraft = {
    pathname: draft.pathname,
    timeSlots: draft.timeSlots.slice(0, MAX_TIME_SLOTS).map(ts => ({
      date: ts.date,
      slot: { label: ts.slot.label, startTime: ts.slot.startTime, endTime: ts.slot.endTime },
    })),
    storeIds: [...draft.storeIds],
    openRequest: draft.openRequest,
    savedAt: now,
  }
  if (!parse(JSON.stringify(value))) return
  try {
    s.setItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY, JSON.stringify(value))
  } catch {
    // 容量超過など。預けられなくても URL での戻りは効く
  }
}

/**
 * 今の作品ページ向けの預かりを取り出して消す。別の作品・古い・壊れた預かりは消して null。
 * 取り出しは 1 回きり（再読み込み・戻るで同じ選択や確認画面が何度も開かないように）。
 */
export function takePrivateBookingLoginDraft(
  currentPathname: string,
  now: number = Date.now(),
): PrivateBookingLoginDraft | null {
  const s = storage()
  if (!s) return null
  const draft = parse(s.getItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY))
  s.removeItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)
  if (!draft) return null
  if (draft.pathname !== currentPathname) return null
  if (now - draft.savedAt > PRIVATE_BOOKING_LOGIN_DRAFT_MAX_AGE_MS || now < draft.savedAt) return null
  return draft
}

export function discardPrivateBookingLoginDraft(): void {
  storage()?.removeItem(PRIVATE_BOOKING_LOGIN_DRAFT_KEY)
}
