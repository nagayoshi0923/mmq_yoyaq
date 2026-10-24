/**
 * 試作の保存先。**このブラウザの localStorage の中だけ**に保存する。
 * サーバー・DB・他の端末・他のお客様には一切送らない。ブラウザのデータを消すと消える。
 * 同じブラウザの別のタブとは、storage イベントで同じ内容を見る（複数タブの試験に使う）。
 */
import type { PerformanceRequest, RequestStatus } from './model'
import type { PerformanceSubscription, ProtoNotification } from './notify'

export const PROTO_STORAGE_KEY = 'mmqProto.performanceRequest.v1'
export const PROTO_STORAGE_SCOPE_LABEL = 'このブラウザの中だけ'
const CHANGE_EVENT = 'mmq-proto-performance-request-change'

export interface ProtoState {
  /** お客様が試作の画面から送ったリクエスト（架空のお客様分は fixtures にある） */
  requests: PerformanceRequest[]
  subscriptions: PerformanceSubscription[]
  notifications: ProtoNotification[]
  /** 管理のサイドパネルで切り替えた状態（作品ごと） */
  statuses: Record<string, RequestStatus>
  settings: {
    /** 「MMQ を開いたときのお知らせを出さない」 */
    popupDisabled: boolean
  }
}

export function emptyProtoState(): ProtoState {
  return { requests: [], subscriptions: [], notifications: [], statuses: {}, settings: { popupDisabled: false } }
}

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readProtoState(storage: Storage | null = defaultStorage()): ProtoState {
  if (!storage) return emptyProtoState()
  try {
    const raw = storage.getItem(PROTO_STORAGE_KEY)
    if (!raw) return emptyProtoState()
    const parsed = JSON.parse(raw) as Partial<ProtoState>
    const base = emptyProtoState()
    return {
      requests: Array.isArray(parsed.requests) ? parsed.requests : base.requests,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : base.subscriptions,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : base.notifications,
      statuses: parsed.statuses && typeof parsed.statuses === 'object' ? parsed.statuses : base.statuses,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return emptyProtoState()
  }
}

export function writeProtoState(next: ProtoState, storage: Storage | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.setItem(PROTO_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 保存できない（プライベートモード等）。試作なので画面の表示だけ続ける
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function updateProtoState(fn: (prev: ProtoState) => ProtoState, storage: Storage | null = defaultStorage()): ProtoState {
  const next = fn(readProtoState(storage))
  writeProtoState(next, storage)
  return next
}

/** 同じタブの書き込みと、別のタブの書き込み（storage イベント）を受け取る */
export function subscribeProtoState(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === PROTO_STORAGE_KEY) listener() }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function resetProtoState(storage: Storage | null = defaultStorage()): void {
  writeProtoState(emptyProtoState(), storage)
}
