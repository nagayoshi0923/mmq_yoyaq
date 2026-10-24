/**
 * 試作の操作。すべて localStorage（このブラウザの中だけ）を書き換えるだけで、実 API・DB・通知の送信には触れない。
 */
import { PROTO_ORGANIZATION, PROTO_REQUESTS, PROTO_SCENARIOS, PROTO_STORES, PROTO_USER_ID, type ProtoPerformance } from './fixtures'
import type { PerformanceRequest, RequestStatus } from './model'
import { planPerformanceNotifications, popupCandidates, type PerformanceSubscription, type ProtoNotification } from './notify'
import { readProtoState, updateProtoState } from './storage'

export function submitRequest(input: Omit<PerformanceRequest, 'id' | 'userId' | 'createdAt'>, now = new Date()): PerformanceRequest {
  const request: PerformanceRequest = {
    ...input,
    id: `proto-local-req-${now.getTime()}`,
    userId: PROTO_USER_ID,
    createdAt: now.toISOString(),
  }
  updateProtoState((prev) => ({ ...prev, requests: [...prev.requests, request] }))
  return request
}

export function findSubscription(scenarioId: string, userId = PROTO_USER_ID): PerformanceSubscription | undefined {
  return readProtoState().subscriptions.find((s) => s.scenarioId === scenarioId && s.userId === userId)
}

export function subscribe(scenarioId: string, storeIds: string[], now = new Date()): void {
  updateProtoState((prev) => ({
    ...prev,
    subscriptions: [
      ...prev.subscriptions.filter((s) => !(s.scenarioId === scenarioId && s.userId === PROTO_USER_ID)),
      { id: `proto-sub-${scenarioId}`, userId: PROTO_USER_ID, scenarioId, organizationId: PROTO_ORGANIZATION.id, storeIds, createdAt: now.toISOString() },
    ],
  }))
}

export function unsubscribe(scenarioId: string): void {
  updateProtoState((prev) => ({
    ...prev,
    subscriptions: prev.subscriptions.filter((s) => !(s.scenarioId === scenarioId && s.userId === PROTO_USER_ID)),
  }))
}

export function setStatus(scenarioId: string, status: RequestStatus): void {
  updateProtoState((prev) => ({ ...prev, statuses: { ...prev.statuses, [scenarioId]: status } }))
}

/** 架空のお客様分（fixtures）と、このブラウザで送った分を合わせた全リクエスト */
export function allRequests(local: PerformanceRequest[]): PerformanceRequest[] {
  return [...PROTO_REQUESTS, ...local]
}

/**
 * 公演の公開を模擬して、通知を作る（このブラウザの中だけ）。実際の送信はしない。
 * 戻り値は新しく作られた通知（下書き・重複・対象外なら空）。
 */
export function simulatePublish(performance: ProtoPerformance, now = new Date()): ProtoNotification[] {
  let created: ProtoNotification[] = []
  updateProtoState((prev) => {
    created = planPerformanceNotifications({
      performance,
      organizationId: PROTO_ORGANIZATION.id,
      requests: allRequests(prev.requests),
      subscriptions: prev.subscriptions,
      existing: prev.notifications,
      scenarios: PROTO_SCENARIOS,
      stores: PROTO_STORES,
      now: now.toISOString(),
    })
    return { ...prev, notifications: [...prev.notifications, ...created] }
  })
  return created
}

export function markRead(ids: string[], now = new Date()): void {
  const set = new Set(ids)
  updateProtoState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((n) => (set.has(n.id) && !n.readAt ? { ...n, readAt: now.toISOString() } : n)),
  }))
}

export function markUnread(id: string): void {
  updateProtoState((prev) => ({ ...prev, notifications: prev.notifications.map((n) => (n.id === id ? { ...n, readAt: null } : n)) }))
}

/** ポップアップを閉じた。既読にはしない（一覧では未読のまま） */
export function dismissPopup(ids: string[], now = new Date()): void {
  const set = new Set(ids)
  updateProtoState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((n) => (set.has(n.id) ? { ...n, popupDismissedAt: n.popupDismissedAt ?? now.toISOString() } : n)),
  }))
}

/** まだ表示していない通知に「表示済み」を付ける。別のタブが先に付けたものは返さない */
export function claimPopup(ids: string[], now = new Date()): string[] {
  const set = new Set(ids)
  const claimed: string[] = []
  updateProtoState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((n) => {
      if (!set.has(n.id) || n.popupShownAt) return n
      claimed.push(n.id)
      return { ...n, popupShownAt: now.toISOString() }
    }),
  }))
  return claimed
}

/** claim したが表示しなかった通知の「表示済み」を外す（閉じた・既読の印は変えない） */
export function releasePopup(ids: string[]): void {
  const set = new Set(ids)
  updateProtoState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((n) => (set.has(n.id) && !n.popupDismissedAt ? { ...n, popupShownAt: null } : n)),
  }))
}

export function popupCandidatesNow(): ProtoNotification[] {
  return popupCandidates(readProtoState().notifications, PROTO_USER_ID)
}

export function setPopupDisabled(disabled: boolean): void {
  updateProtoState((prev) => ({ ...prev, settings: { ...prev.settings, popupDisabled: disabled } }))
}
