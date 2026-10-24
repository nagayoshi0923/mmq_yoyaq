/**
 * ポップアップを割り込ませてはいけない場面の判定（試作）。
 * - 画面が明示的に知らせる場面: 予約・リクエストの入力中、ログイン直後で戻り先へ戻る途中
 * - 既存の判定の再利用: 値の入った入力欄・開いているダイアログ（src/lib/silentAppUpdate.ts の hasUnsavedInput）、
 *   入力の途中のページ（同 isInProgressPath。予約確認・貸切申込・ログイン等）
 */
import { hasUnsavedInput, isInProgressPath } from '@/lib/silentAppUpdate'

export type BusyReason = 'form-input' | 'auth-return'

export const BUSY_REASON_LABEL: Record<BusyReason | 'unsaved-input' | 'in-progress-page', string> = {
  'form-input': '予約・リクエストの入力中',
  'auth-return': 'ログイン直後で戻り先へ戻る途中',
  'unsaved-input': '入力欄に値が入っている／ダイアログが開いている',
  'in-progress-page': '入力の途中のページ',
}

const reasons = new Map<string, BusyReason>()
const listeners = new Set<() => void>()

/** key ごとに「割り込み禁止」を立てる／外す。外したときは待っていたポップアップが出られる */
export function setPrototypeBusy(key: string, reason: BusyReason | null): void {
  const had = reasons.has(key)
  if (reason) reasons.set(key, reason)
  else reasons.delete(key)
  if (had && !reason) for (const l of listeners) l()
}

export function onPrototypeIdle(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getPrototypeBusyReason(root: ParentNode | null = typeof document !== 'undefined' ? document : null, pathname = typeof window !== 'undefined' ? window.location.pathname : '/'): string | null {
  const first = reasons.values().next()
  if (!first.done) return BUSY_REASON_LABEL[first.value]
  if (isInProgressPath(pathname)) return BUSY_REASON_LABEL['in-progress-page']
  if (root && hasUnsavedInput(root)) return BUSY_REASON_LABEL['unsaved-input']
  return null
}

export function __resetPrototypeBusyForTest(): void {
  reasons.clear()
  listeners.clear()
}
