import type { TimeSlot } from '../types'

/**
 * 未ログインで「ログインして貸切リクエスト」を押したとき、入力途中の内容をタブ内に預ける（#985）。
 * 画面はログインへ移ると消えるため、URL に無い備考・候補の追加削除・店舗の選び直しが失われていた。
 * 同じ作品・同じ URL へ戻ったときだけ 1 回戻し、戻したら消す。30 分を過ぎたものは使わない。
 */
export const PRIVATE_REQUEST_LOGIN_DRAFT_KEY = 'mmq:private-request-login-draft'
const MAX_AGE_MS = 30 * 60 * 1000

export type PrivateRequestLoginDraft = {
  notes: string
  timeSlots: Array<{ date: string; slot: TimeSlot }>
  storeIds: string[] | null
}

type Stored = PrivateRequestLoginDraft & { scenarioId: string; path: string; savedAt: number }

function storage(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}

export function savePrivateRequestLoginDraft(scenarioId: string, path: string, draft: PrivateRequestLoginDraft): void {
  const value: Stored = { ...draft, scenarioId, path, savedAt: Date.now() }
  try { storage()?.setItem(PRIVATE_REQUEST_LOGIN_DRAFT_KEY, JSON.stringify(value)) } catch { /* 容量・無効化時は預けない */ }
}

export function takePrivateRequestLoginDraft(scenarioId: string, path: string): PrivateRequestLoginDraft | null {
  const s = storage()
  if (!s) return null
  let raw: string | null = null
  try { raw = s.getItem(PRIVATE_REQUEST_LOGIN_DRAFT_KEY) } catch { return null }
  if (!raw) return null
  let parsed: Stored | null = null
  try { parsed = JSON.parse(raw) as Stored } catch { parsed = null }
  if (!parsed || parsed.scenarioId !== scenarioId || parsed.path !== path) return null
  try { s.removeItem(PRIVATE_REQUEST_LOGIN_DRAFT_KEY) } catch { /* 消せなくても期限で使わなくなる */ }
  if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null
  return {
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    timeSlots: Array.isArray(parsed.timeSlots) ? parsed.timeSlots.filter((t) => t && typeof t.date === 'string' && t.slot && typeof t.slot.label === 'string') : [],
    storeIds: Array.isArray(parsed.storeIds) ? parsed.storeIds.filter((id): id is string => typeof id === 'string') : null,
  }
}
