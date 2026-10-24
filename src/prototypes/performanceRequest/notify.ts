/**
 * 「公演追加のお知らせ」（作品ページのベル）と、開催リクエストをした人への通知の試作。
 *
 * 試作の決まり:
 * - 通知を作るのは、公演が「公開され、かつ予約受付できる」状態になったときだけ。下書きでは作らない。
 * - 同じ人 × 同じ公演は 1 回だけ（dedupe の鍵 = performance_added:{利用者}:{公演}）。
 *   公演の更新・再公開でも、リクエストとベルの両方に登録していても、2 通目は作らない。
 *   本番の通知（user_notifications.metadata.dedupe_key の一意索引）と同じ考え方。
 * - 希望の条件に合うときだけ「ご希望に近い公演」と書く。合わないときは「新しい公演が追加されました」。
 *   どちらも「確定」とは書かない。予約の確定・席の確保ではなく、別に予約が必要なことを文に入れる。
 * - 通知の行き先は同じ origin の相対パスだけ。ログインが要るときは /login?redirect=<相対パス>（authReturn.ts と同じ方式）。
 * - 実際には送らない。作った通知はこのブラウザの localStorage にだけ入る（storage.ts）。
 */
import { buildAuthUrl, normalizeReturnTo } from '@/lib/authReturn'
import type { ProtoPerformance, ProtoScenario, ProtoStore } from './fixtures'
import { WEEKDAY_LABELS, monthOf, weekdayOf, type PerformanceRequest } from './model'

export interface PerformanceSubscription {
  id: string
  userId: string
  scenarioId: string
  organizationId: string
  /** 空 = この組織のすべての店舗 */
  storeIds: string[]
  createdAt: string
}

export type NotificationSource = 'request' | 'bell'
export type NotificationVariant = 'near_request' | 'new_performance'

export interface ProtoNotification {
  id: string
  userId: string
  /** 重複を防ぐ鍵（利用者 × 公演） */
  dedupeKey: string
  kind: 'performance_added'
  variant: NotificationVariant
  sources: NotificationSource[]
  scenarioId: string
  performanceId: string
  storeId: string
  date: string
  startTime: string
  title: string
  message: string
  /** 同じ origin の相対パス */
  link: string
  createdAt: string
  /** 既読（通知一覧で開いた・既読にした）。ポップアップを閉じても既読にはしない */
  readAt: string | null
  /** ポップアップで表示した時刻（どのタブでも 1 回） */
  popupShownAt: string | null
  /** ポップアップを閉じた時刻。閉じたものは次の訪問で繰り返し出さない（一覧には残る） */
  popupDismissedAt: string | null
}

export const PERFORMANCE_ADDED_NOT_RESERVATION =
  'お席の確保・予約の確定ではありません。ご参加には公演ページから別途ご予約が必要です。'

export function dedupeKeyFor(userId: string, performanceId: string): string {
  return `performance_added:${userId}:${performanceId}`
}

/** 通知を出してよい公演か（公開済み・予約受付中・中止でない・オープン公演） */
export function isNotifiablePerformance(p: ProtoPerformance): boolean {
  return p.isPublished && p.isReservationEnabled && !p.isCancelled && p.category === 'open'
}

/** 開催リクエストの条件（店舗・時期・曜日・日付）に合う公演か */
export function performanceMatchesRequest(p: ProtoPerformance, r: PerformanceRequest): boolean {
  if (p.scenarioId !== r.scenarioId) return false
  if (r.storeIds.length > 0 && !r.storeIds.includes(p.storeId)) return false
  if (r.dates.includes(p.date)) return true
  const monthOk = r.period.kind === 'anytime' || r.period.months.includes(monthOf(p.date))
  const weekdayOk = r.weekdays.length === 0 || r.weekdays.includes(weekdayOf(p.date))
  return monthOk && weekdayOk
}

/** ベル（公演追加のお知らせ）の対象か（作品・組織・店舗の絞り込み） */
export function performanceMatchesSubscription(p: ProtoPerformance, s: PerformanceSubscription, organizationId: string): boolean {
  if (p.scenarioId !== s.scenarioId) return false
  if (s.organizationId !== organizationId) return false
  return s.storeIds.length === 0 || s.storeIds.includes(p.storeId)
}

export function performancePath(performanceId: string): string {
  return `/prototype/performance-request/event/${encodeURIComponent(performanceId)}`
}

/** 未ログインで通知を押したとき: ログイン後にその公演へ戻る URL（相対パスだけ。外の URL は捨てる） */
export function loginUrlForNotification(link: string): string {
  return buildAuthUrl('login', normalizeReturnTo(link))
}

export function formatWhen(date: string, startTime: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}月${d}日(${WEEKDAY_LABELS[weekdayOf(date)]}) ${startTime}〜`
}

export function buildNotificationText(variant: NotificationVariant, scenario: ProtoScenario, store: ProtoStore, p: ProtoPerformance) {
  const when = formatWhen(p.date, p.startTime)
  const title = variant === 'near_request' ? 'ご希望に近い公演が公開されました' : '新しい公演が追加されました'
  const lead = variant === 'near_request'
    ? `開催リクエストの条件に近い「${scenario.title}」の公演が公開されました。`
    : `「${scenario.title}」の公演が追加されました。`
  return { title, message: `${lead}${when} ${store.name}。${PERFORMANCE_ADDED_NOT_RESERVATION}` }
}

export interface PlanInput {
  performance: ProtoPerformance
  organizationId: string
  requests: PerformanceRequest[]
  subscriptions: PerformanceSubscription[]
  existing: ProtoNotification[]
  scenarios: ProtoScenario[]
  stores: ProtoStore[]
  now: string
}

/**
 * 公演が公開されたときに作る通知を決める（純粋な計算。送らない・保存しない）。
 * 戻り値は新しく作る分だけ。既にある鍵・下書き・対象外は含まない。
 */
export function planPerformanceNotifications(input: PlanInput): ProtoNotification[] {
  const { performance: p, organizationId } = input
  if (!isNotifiablePerformance(p)) return []
  const scenario = input.scenarios.find((s) => s.id === p.scenarioId)
  const store = input.stores.find((s) => s.id === p.storeId)
  if (!scenario || !store) return []

  const byUser = new Map<string, { sources: Set<NotificationSource>; near: boolean }>()
  const touch = (userId: string) => {
    let entry = byUser.get(userId)
    if (!entry) { entry = { sources: new Set(), near: false }; byUser.set(userId, entry) }
    return entry
  }
  for (const r of input.requests) {
    if (r.scenarioId !== p.scenarioId) continue
    // リクエストした店舗のどれかで開く公演だけ知らせる（店舗の希望を無視して送らない）
    if (r.storeIds.length > 0 && !r.storeIds.includes(p.storeId)) continue
    const entry = touch(r.userId)
    entry.sources.add('request')
    if (performanceMatchesRequest(p, r)) entry.near = true
  }
  for (const s of input.subscriptions) {
    if (!performanceMatchesSubscription(p, s, organizationId)) continue
    touch(s.userId).sources.add('bell')
  }

  const existingKeys = new Set(input.existing.map((n) => n.dedupeKey))
  const created: ProtoNotification[] = []
  for (const [userId, entry] of byUser) {
    const dedupeKey = dedupeKeyFor(userId, p.id)
    if (existingKeys.has(dedupeKey)) continue
    existingKeys.add(dedupeKey)
    const variant: NotificationVariant = entry.near ? 'near_request' : 'new_performance'
    const text = buildNotificationText(variant, scenario, store, p)
    created.push({
      id: `proto-ntf-${userId}-${p.id}`,
      userId,
      dedupeKey,
      kind: 'performance_added',
      variant,
      sources: [...entry.sources].sort(),
      scenarioId: p.scenarioId,
      performanceId: p.id,
      storeId: p.storeId,
      date: p.date,
      startTime: p.startTime,
      title: text.title,
      message: text.message,
      link: performancePath(p.id),
      createdAt: input.now,
      readAt: null,
      popupShownAt: null,
      popupDismissedAt: null,
    })
  }
  return created
}

/** ポップアップに出してよい通知（本人・未読・まだ表示も閉じもしていない・公演追加の通知だけ） */
export function popupCandidates(notifications: ProtoNotification[], userId: string): ProtoNotification[] {
  return notifications
    .filter((n) => n.userId === userId && n.kind === 'performance_added' && !n.readAt && !n.popupShownAt && !n.popupDismissedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
}
