/**
 * 公演の中止判定（check-performance-cancellation）の判断部分。DB・通信に触れない純粋な関数だけを置く。
 * 判定そのもの（開催・追加募集・中止）は DB の check_performances_day_before /
 * check_performances_with_recruitment_deadlines が行い、ここはその結果の扱いを決める（整備 3）。
 */

export type CheckType = 'day_before' | 'day_before_preview' | 'four_hours_before' | 'recruitment_deadline'

export const PREVIEW_CHECK_TYPE = 'day_before_preview'
const ALLOWED_CHECK_TYPES = new Set<string>(['day_before', PREVIEW_CHECK_TYPE, 'four_hours_before', 'recruitment_deadline'])

export interface EventDetail {
  judgment_deadline?: string | null
  recruitment_deadline?: string | null
  event_id: string
  date: string
  start_time: string
  scenario: string
  store_name: string
  current_participants: number
  max_participants: number
  min_required?: number
  half_required?: number
  result: string
  category?: string
  organization_id: string
  gms: string[]
}

export interface CheckResult {
  events_checked: number
  events_confirmed: number
  events_extended?: number
  events_cancelled: number
  details: EventDetail[]
}

/** 開催決定の案内を出さない区分（貸切・テストなど、もともと開催が決まっているもの） */
export const ALWAYS_HOLD_CATEGORIES = new Set([
  'private',
  'gmtest',
  'testplay',
  'offsite',
  'venue_rental',
  'venue_rental_free',
  'package',
  'mtg',
])

export function categoryShortName(category: string | undefined): string {
  switch (category) {
    case 'private': return '貸切'
    case 'gmtest': return 'GMテスト'
    case 'testplay': return 'テスト'
    case 'offsite': return '出張'
    case 'venue_rental':
    case 'venue_rental_free': return '会場レンタル'
    case 'package': return 'パッケージ'
    case 'mtg': return 'MTG'
    case 'open': return 'オープン'
    default: return ''
  }
}

/**
 * 判定の種類を決める。指定が無い・不正なら日本時間の時刻で決める
 * （21時台=予告、23時〜0時台=前日の中止判断、それ以外=4時間前判断）。
 */
export function resolveCheckType(requested: unknown, now: Date): { checkType: CheckType; defaulted: boolean; jstHour: number } {
  const jstHour = (now.getUTCHours() + 9) % 24
  if (typeof requested === 'string' && ALLOWED_CHECK_TYPES.has(requested)) {
    return { checkType: requested as CheckType, defaulted: false, jstHour }
  }
  const checkType: CheckType = jstHour === 21 ? PREVIEW_CHECK_TYPE
    : (jstHour >= 23 || jstHour < 1) ? 'day_before'
    : 'four_hours_before'
  return { checkType, defaulted: true, jstHour }
}

/** DB の判定関数の戻り（配列または1行）を集計の形にそろえる。延長件数は前日判断の関数だけが返す */
export function normalizeCheckResult(data: unknown, withExtended: boolean): CheckResult {
  const row = (Array.isArray(data) ? data[0] : data) as Partial<CheckResult> | null | undefined
  const result: CheckResult = {
    events_checked: row?.events_checked ?? 0,
    events_confirmed: row?.events_confirmed ?? 0,
    events_cancelled: row?.events_cancelled ?? 0,
    details: row?.details ?? [],
  }
  if (withExtended) {
    return {
      events_checked: result.events_checked,
      events_confirmed: result.events_confirmed,
      events_extended: row?.events_extended ?? 0,
      events_cancelled: result.events_cancelled,
      details: result.details,
    }
  }
  return result
}

export type EventNotificationKind = 'cancelled' | 'extended' | 'confirmed'

/**
 * 公演ごとに出す案内を決める。個別期限（追加募集）の最終案内は DB の送信待ち表が担うので、ここでは出さない。
 * 開催決定の案内は、もともと開催が決まっている区分には出さない。
 */
export function planEventNotifications(details: EventDetail[]): { kind: EventNotificationKind; event: EventDetail }[] {
  const plan: { kind: EventNotificationKind; event: EventDetail }[] = []
  for (const event of details) {
    if (event.recruitment_deadline) continue
    if (event.result === 'cancelled') plan.push({ kind: 'cancelled', event })
    else if (event.result === 'extended') plan.push({ kind: 'extended', event })
    else if (event.result === 'confirmed' && !ALWAYS_HOLD_CATEGORIES.has(event.category || '')) plan.push({ kind: 'confirmed', event })
  }
  return plan
}

/** 業務連絡の見出しに出す判定の名前 */
export function summaryKindLabel(checkType: string, isPreview: boolean): string {
  return isPreview ? '予告' : checkType === 'recruitment_deadline' ? '開催・追加募集の判断' : checkType === 'four_hours_before' ? '開催判断' : '中止判断'
}

/** 業務連絡の各行の先頭に付ける結果の札 */
export function summaryResultLabel(event: Pick<EventDetail, 'result' | 'category'>): string {
  if (event.result === 'cancelled') return '【中止】'
  if (event.result === 'extended') return '【募集延長】'
  if (event.result === 'confirmed') {
    const cat = categoryShortName(event.category)
    return cat && event.category !== 'open' ? `【開催決定｜${cat}】` : '【開催決定】'
  }
  return '【不明】'
}

/** 組織ごとの業務連絡に載せる公演（開始時刻順） */
export function summaryEventsForOrganization(details: EventDetail[], organizationId: string): EventDetail[] {
  return details
    .filter(e => e.organization_id === organizationId)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
}

/**
 * 業務連絡の本文。GM 名は Discord のメンションに置き換える（対応が無ければ名前のまま）。
 * targetDate・executedAt は表示用の文字列（例: 10/5、10/4 23:59）。
 */
export function buildSummaryMessage(input: {
  orgEvents: EventDetail[]
  gmMentionMap: Record<string, string>
  kindLabel: string
  isPreview: boolean
  targetDate: string
  executedAt: string
}): string {
  const { orgEvents, gmMentionMap, kindLabel, isPreview, targetDate, executedAt } = input
  const formatGMs = (gms: string[] | undefined): string => {
    if (!gms || gms.length === 0) return ''
    return gms.map(gm => gmMentionMap[gm] || gm).join(', ')
  }
  const lines: string[] = []
  if (isPreview) {
    lines.push(`📋 **${targetDate} 予告**`)
    lines.push('23:59 の中止判断と同じ計算です。まだ公演は変えていません。')
  } else {
    lines.push(`📋 **${targetDate} ${kindLabel}**`)
  }
  lines.push('')
  lines.push([
    `判定: ${orgEvents.length}件`,
    `開催決定: ${orgEvents.filter(e => e.result === 'confirmed').length}件`,
    `募集延長: ${orgEvents.filter(e => e.result === 'extended').length}件`,
    `中止: ${orgEvents.filter(e => e.result === 'cancelled').length}件`,
  ].join(' | '))
  lines.push('')
  for (const event of orgEvents) {
    const time = event.start_time?.slice(0, 5) || '??:??'
    const scenario = event.scenario || '未設定'
    const participants = `${event.current_participants}/${event.max_participants}名`
    const gms = formatGMs(event.gms)
    const store = event.store_name || ''
    let line = `${summaryResultLabel(event)} ${time} **${scenario}** (${participants})`
    if (store) line += ` @${store}`
    if (gms) line += ` GM: ${gms}`
    lines.push(line)
  }
  lines.push('')
  lines.push(`_実行時刻: ${executedAt}_`)
  return lines.join('\n')
}
