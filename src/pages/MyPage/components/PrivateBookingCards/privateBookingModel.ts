/**
 * マイページ「予約」タブの貸切カードの組み立て（1 貸切 = 1 カード）。
 * 仕様の正本: docs/product-spec/マイページ改修_2026-10.md
 *
 * グループ（private_groups）と申込・予約（reservations）を
 * group.reservation_id / reservation.private_group_id で結んで 1 枚にする。
 * グループの無い旧い貸切予約は予約だけで 1 枚にする。
 */
import { RESERVATION_SOURCE } from '@/lib/constants'
import { formatJstMonthDay } from '@/utils/jstDate'
import type { Reservation } from '@/types'
import type { PrivateGroupSummary } from './privateGroupSummary'

type ScheduleEventMap = Record<string, { date: string; start_time: string; category?: string; is_private_booking?: boolean | null }>

/** 次にやること（カードのヘッダー左のラベル）。並びは判定の優先順 */
type NextActionKind =
  | 'accept_transfer'
  | 'answer_survey'
  | 'pick_dates'
  | 'answer_dates'
  | 'proceed_booking'
  | 'waiting_store'
  | 'waiting_organizer'
  | 'upcoming'
  | 'ended'

const NEXT_ACTION_LABELS: Record<Exclude<NextActionKind, 'upcoming'>, string> = {
  // 段階 3（主催者の引き継ぎ）で使う。段階 1 ではラベル定義のみ
  accept_transfer: '主催者の引き継ぎに同意する',
  answer_survey: 'アンケートに回答する',
  pick_dates: '候補日を決める',
  answer_dates: '日程に回答する',
  proceed_booking: '申込に進む',
  waiting_store: '店舗の返事待ち',
  waiting_organizer: '主催者の準備待ち',
  ended: '終了',
}

/** カードを置く節（上から表示順） */
export type PrivateBookingSection = 'action' | 'waiting_store' | 'waiting_organizer' | 'confirmed' | 'ended'

const SECTION_BY_ACTION: Record<NextActionKind, PrivateBookingSection> = {
  accept_transfer: 'action',
  answer_survey: 'action',
  pick_dates: 'action',
  answer_dates: 'action',
  proceed_booking: 'action',
  waiting_store: 'waiting_store',
  waiting_organizer: 'waiting_organizer',
  upcoming: 'confirmed',
  ended: 'ended',
}

const PRE_CONFIRM_STEPS = ['招待', '候補日', '回答', '申込', '確定'] as const
const POST_CONFIRM_STEPS = ['確定', 'アンケート', '当日'] as const

interface PrivateBookingProgress {
  steps: readonly string[]
  /** 今いる段の番号。これより前は済み。steps.length なら全部済み */
  current: number
}

export interface PrivateBookingItem {
  key: string
  groupId: string | null
  reservationId: string | null
  title: string
  imageUrl: string | null
  isOrganizer: boolean
  /** ヘッダー右（あなたが主催／○○さんが主催） */
  hostLabel: string
  action: NextActionKind
  /** ヘッダー左のラベル */
  label: string
  section: PrivateBookingSection
  progress: PrivateBookingProgress
  description: string
  /** カード全体を押したときの行き先 */
  href: string
  /** 主ボタン（次にやること）。行動が無いときは null */
  primary: { label: string; href: string } | null
  /** 副ボタン */
  secondary: { label: string; href: string }
  /** 並べ替え用: 公演日（確定・終了）または作成日時 */
  sortKey: string
}

const ACTIVE_PENDING_STATUSES = ['pending', 'pending_gm', 'gm_confirmed', 'pending_store']
const CONFIRMED_STATUSES = ['confirmed', 'checked_in', 'completed']

/** 貸切の予約か（一般公演サブタブから外す判定） */
export function isPrivateReservation(reservation: Reservation, scheduleEvents: ScheduleEventMap): boolean {
  if (reservation.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE) return true
  if (reservation.private_group_id) return true
  const event = reservation.schedule_event_id ? scheduleEvents[reservation.schedule_event_id] : undefined
  return event?.category === 'private' || event?.is_private_booking === true
}

function cleanPrivateTitle(title?: string | null): string {
  return (title ?? '')
    .replace(/【貸切希望】|【貸切】/g, '')
    .replace(/（候補\d+件）/g, '')
    .replace(/\s*[-－ー–]\s*\d{4}年\d{1,2}月\d{1,2}日[（(][日月火水木金土][)）]/g, '')
    .trim()
}

function dateLabel(date: string, time?: string | null): string {
  const md = formatJstMonthDay(date, true)
  return time ? `${md} ${time.slice(0, 5)}〜` : md
}

function candidateCountOf(reservation: Reservation): number {
  const cd = reservation.candidate_datetimes as { candidates?: unknown[] } | null | undefined
  return Array.isArray(cd?.candidates) ? cd!.candidates!.length : 0
}

function reservationSchedule(reservation: Reservation, scheduleEvents: ScheduleEventMap): { date: string; time: string | null } {
  const event = reservation.schedule_event_id ? scheduleEvents[reservation.schedule_event_id] : undefined
  if (event) return { date: event.date, time: event.start_time?.slice(0, 5) ?? null }
  const raw = reservation.requested_datetime ?? ''
  return { date: raw.slice(0, 10), time: raw.match(/T(\d{2}:\d{2})/)?.[1] ?? null }
}

function hostLabelOf(isOrganizer: boolean, organizerName: string | null): string {
  if (isOrganizer) return 'あなたが主催'
  return organizerName ? `${organizerName}さんが主催` : 'メンバーとして参加'
}

interface GroupDecision {
  action: NextActionKind
  progress: PrivateBookingProgress
}

/** グループの「次にやること」と進み具合（優先順は NextActionKind の並び） */
export function decideGroupAction(
  group: PrivateGroupSummary,
  options: { todayYmd: string; surveyPending: boolean; transferPending?: boolean },
): GroupDecision {
  const pre = (current: number): PrivateBookingProgress => ({ steps: PRE_CONFIRM_STEPS, current })
  const post = (current: number): PrivateBookingProgress => ({ steps: POST_CONFIRM_STEPS, current })
  if (options.transferPending) {
    return { action: 'accept_transfer', progress: group.status === 'confirmed' ? post(1) : pre(1) }
  }
  if (group.status === 'confirmed') {
    const date = group.schedule?.date
    if (date && date < options.todayYmd) return { action: 'ended', progress: post(POST_CONFIRM_STEPS.length) }
    if (options.surveyPending) return { action: 'answer_survey', progress: post(1) }
    return { action: 'upcoming', progress: post(2) }
  }
  if (group.status === 'booking_requested') return { action: 'waiting_store', progress: pre(4) }
  // gathering / date_adjusting
  const candidates = group.candidate_dates_count
  const datesProgress = pre(candidates === 0 ? 1 : group.all_members_responded ? 3 : 2)
  if (group.is_organizer) {
    return { action: candidates === 0 ? 'pick_dates' : 'proceed_booking', progress: datesProgress }
  }
  if (candidates > 0 && group.my_unanswered_count > 0) return { action: 'answer_dates', progress: datesProgress }
  return { action: 'waiting_organizer', progress: datesProgress }
}

function groupDescription(group: PrivateGroupSummary, action: NextActionKind): string {
  const c = group.candidate_dates_count
  const host = group.organizer_name ? `${group.organizer_name}さん` : '主催者'
  const when = group.schedule ? dateLabel(group.schedule.date, group.schedule.start_time) : ''
  const store = group.schedule?.store_name ? ` ${group.schedule.store_name}` : ''
  switch (action) {
    case 'accept_transfer':
      return '主催者の引き継ぎを頼まれています。内容を確認して同意してください'
    case 'answer_survey':
      return `${when}${store}で開催。公演前アンケートに回答してください`
    case 'pick_dates':
      return `候補日を登録すると、メンバーが都合を回答できます（参加 ${group.member_count} 人）`
    case 'answer_dates':
      return `候補日 ${c} 件のうち ${group.my_unanswered_count} 件が未回答です。都合を回答してください`
    case 'proceed_booking':
      return group.all_members_responded
        ? `全員の回答がそろいました。候補日 ${c} 件で店舗へ申し込めます`
        : `候補日 ${c} 件・参加 ${group.member_count} 人。回答を確かめて店舗へ申し込みましょう`
    case 'waiting_store':
      return c > 0
        ? `候補日 ${c} 件で申込中。店舗が日程を確定すると連絡が届きます`
        : '申込中。店舗が日程を確定すると連絡が届きます'
    case 'waiting_organizer':
      return c === 0 ? `${host}が候補日を準備しています` : `回答済みです。${host}が店舗へ申し込むのを待っています`
    case 'upcoming':
      return when ? `${when}${store}・参加 ${group.member_count} 人` : `日程が確定しました・参加 ${group.member_count} 人`
    case 'ended':
      return group.schedule ? `${formatJstMonthDay(group.schedule.date, true)}に開催しました` : '開催済みです'
  }
}

function labelOf(action: NextActionKind, date: string | null | undefined): string {
  if (action === 'upcoming') return date ? `${formatJstMonthDay(date, true)} 開催` : '日程確定'
  return NEXT_ACTION_LABELS[action]
}

function primaryOf(action: NextActionKind, base: string): PrivateBookingItem['primary'] {
  switch (action) {
    case 'accept_transfer':
    case 'pick_dates':
    case 'proceed_booking':
      return { label: NEXT_ACTION_LABELS[action], href: base }
    case 'answer_survey':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?tab=survey` }
    case 'answer_dates':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?tab=schedule` }
    default:
      return null
  }
}

function fromGroup(
  group: PrivateGroupSummary,
  options: { todayYmd: string; surveyPending: boolean; fallbackImage: string | null },
): PrivateBookingItem {
  const { action, progress } = decideGroupAction(group, options)
  const base = `/group/invite/${group.invite_code}`
  return {
    key: `group:${group.id}`,
    groupId: group.id,
    reservationId: group.reservation_id ?? null,
    title: group.scenario_title || 'シナリオ未設定',
    imageUrl: group.scenario_image || options.fallbackImage,
    isOrganizer: group.is_organizer,
    hostLabel: hostLabelOf(group.is_organizer, group.organizer_name),
    action,
    label: labelOf(action, group.schedule?.date),
    section: SECTION_BY_ACTION[action],
    progress,
    description: groupDescription(group, action),
    href: base,
    primary: primaryOf(action, base),
    secondary: { label: 'グループを開く', href: base },
    sortKey: group.schedule?.date ?? group.created_at,
  }
}

/** グループの無い旧い貸切予約（予約だけで 1 枚） */
function fromReservation(
  reservation: Reservation,
  scheduleEvents: ScheduleEventMap,
  scenarioImages: Record<string, string>,
  todayYmd: string,
): PrivateBookingItem | null {
  const href = `/mypage/reservation/${reservation.id}`
  const schedule = reservationSchedule(reservation, scheduleEvents)
  let action: NextActionKind
  let progress: PrivateBookingProgress
  let description: string
  if (ACTIVE_PENDING_STATUSES.includes(reservation.status)) {
    const c = candidateCountOf(reservation)
    action = 'waiting_store'
    progress = { steps: PRE_CONFIRM_STEPS, current: 4 }
    description = c > 0 ? `候補日 ${c} 件で申込中。店舗が日程を確定すると連絡が届きます` : '申込中。店舗が日程を確定すると連絡が届きます'
  } else if (CONFIRMED_STATUSES.includes(reservation.status)) {
    const ended = schedule.date < todayYmd || reservation.status === 'completed'
    action = ended ? 'ended' : 'upcoming'
    progress = { steps: POST_CONFIRM_STEPS, current: ended ? POST_CONFIRM_STEPS.length : 2 }
    description = ended
      ? `${formatJstMonthDay(schedule.date, true)}に開催しました`
      : `${dateLabel(schedule.date, schedule.time)}・${reservation.participant_count}名`
  } else {
    return null
  }
  return {
    key: `reservation:${reservation.id}`,
    groupId: null,
    reservationId: reservation.id,
    title: cleanPrivateTitle(reservation.title) || '貸切公演',
    imageUrl: reservation.scenario_master_id ? scenarioImages[reservation.scenario_master_id] ?? null : null,
    isOrganizer: true,
    hostLabel: hostLabelOf(true, null),
    action,
    label: labelOf(action, schedule.date),
    section: SECTION_BY_ACTION[action],
    progress,
    description,
    href,
    primary: null,
    secondary: { label: '予約詳細を見る', href },
    sortKey: CONFIRMED_STATUSES.includes(reservation.status) ? schedule.date : reservation.created_at,
  }
}

export interface PrivateBookingBuildInput {
  groups: PrivateGroupSummary[]
  reservations: Reservation[]
  scheduleEvents: ScheduleEventMap
  scenarioImages: Record<string, string>
  /** グループ id → 自分のアンケートが未回答か */
  surveyPending: Record<string, boolean>
  todayYmd: string
}

export interface PrivateBookingView {
  bySection: Record<PrivateBookingSection, PrivateBookingItem[]>
  /** キャンセル済みサブタブに出す貸切（取り下げ・キャンセル）の件数 */
  cancelledCount: number
}

/** 貸切カードを組み立てて節ごとに並べる */
export function buildPrivateBookingView(input: PrivateBookingBuildInput): PrivateBookingView {
  const { groups, reservations, scheduleEvents, scenarioImages, surveyPending, todayYmd } = input
  const privateReservations = reservations.filter(r => isPrivateReservation(r, scheduleEvents))
  const linkedReservationIds = new Set<string>()
  const items: PrivateBookingItem[] = []
  for (const group of groups) {
    if (group.status === 'cancelled') continue
    const linked = privateReservations.find(r => r.id === group.reservation_id || r.private_group_id === group.id)
    if (linked) linkedReservationIds.add(linked.id)
    // グループ側に作品画像が無い旧データは予約の作品画像で補う
    const fallbackImage = linked?.scenario_master_id ? scenarioImages[linked.scenario_master_id] ?? null : null
    items.push(fromGroup(group, { todayYmd, surveyPending: surveyPending[group.id] === true, fallbackImage }))
  }
  for (const reservation of privateReservations) {
    if (linkedReservationIds.has(reservation.id)) continue
    // グループが一覧に出ている予約は二重に出さない（グループ側の reservation_id が空でも private_group_id で結ぶ）
    if (reservation.private_group_id && groups.some(g => g.id === reservation.private_group_id)) continue
    const item = fromReservation(reservation, scheduleEvents, scenarioImages, todayYmd)
    if (item) items.push(item)
  }
  const bySection: PrivateBookingView['bySection'] = { action: [], waiting_store: [], waiting_organizer: [], confirmed: [], ended: [] }
  for (const item of items) bySection[item.section].push(item)
  bySection.action.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  bySection.waiting_store.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  bySection.waiting_organizer.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  bySection.confirmed.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  bySection.ended.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  const cancelledCount = privateReservations.filter(r => r.status === 'cancelled').length
  return { bySection, cancelledCount }
}

/** 進行中（要対応・返事待ち・準備待ち・確定）の貸切件数 */
export function countActivePrivateBookings(view: PrivateBookingView): number {
  const s = view.bySection
  return s.action.length + s.waiting_store.length + s.waiting_organizer.length + s.confirmed.length
}
