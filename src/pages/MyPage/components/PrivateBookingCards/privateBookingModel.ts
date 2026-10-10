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
import type { CalendarEventInput } from '@/lib/calendarEvent'
import type { Reservation } from '@/types'
import type { PrivateGroupMemberRow, PrivateGroupSummary } from './privateGroupSummary'
import { privateBookingPhase, type PrivateBookingPhase } from './privateBookingMenu'
import { formatHandoverDeadline, handoverWaitingLabel, type PrivateGroupHandoverInfo } from './privateGroupHandover'

type ScheduleEventMap = Record<string, { date: string; start_time: string; category?: string; is_private_booking?: boolean | null }>

/** 次にやること（カードのヘッダー左のラベル）。並びは判定の優先順。グループ画面の「いまの状態」の箱でも使う */
export type NextActionKind =
  | 'accept_transfer'
  // 配役（日程確定後。2026-10-11 社長決定: 操作の入口は「いまの状態」の箱とマイページのカード）
  | 'choose_casting'
  | 'pick_character'
  | 'confirm_casting'
  | 'answer_survey'
  | 'pick_dates'
  | 'answer_dates'
  | 'proceed_booking'
  | 'waiting_store'
  | 'waiting_organizer'
  | 'upcoming'
  | 'ended'

const NEXT_ACTION_LABELS: Record<Exclude<NextActionKind, 'upcoming'>, string> = {
  // 段階 3（主催者の引き継ぎ）。新主催者（宛先）のカード
  accept_transfer: '主催者の引き継ぎに同意する',
  choose_casting: '配役の決め方を選ぶ',
  pick_character: 'やりたいキャラクターを選ぶ',
  confirm_casting: '配役を確定する',
  answer_survey: '事前配役アンケートに回答する',
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
  choose_casting: 'action',
  pick_character: 'action',
  confirm_casting: 'action',
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

/** カードの色（改善案: 要対応=紫・確定/アンケート=緑・店舗の返事待ち=琥珀・相手待ち/終了=灰） */
export type PrivateBookingTone = 'purple' | 'green' | 'amber' | 'gray'

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
  /** 進み具合のチップ列を出すか（引き継ぎ・確定後の通常カード・終了では出さない） */
  showProgress: boolean
  tone: PrivateBookingTone
  /** 主ボタンの色（引き継ぎ依頼中で枠が灰でも、次にやることの色のまま） */
  primaryTone: PrivateBookingTone
  /** 確定・終了は小さい 1 行カード（作品名・日時・ボタン 1 つ） */
  compact: boolean
  /** ヘッダー右の人数（4/6名）。分からなければ null */
  headcount: string | null
  /** 作品名の下の日時・会場（確定済みのとき）。無ければ null */
  whenWhere: string | null
  description: string
  /** カード全体を押したときの行き先 */
  href: string
  /** 主ボタン（次にやること）。行動が無いときは null。inPlace があればマイページ上のダイアログで開く */
  primary: { label: string; href: string; inPlace?: 'dates' | 'answer' | 'survey' } | null
  /** 副ボタン */
  secondary: { label: string; href: string }
  /** 並べ替え用: 公演日（確定・終了）または作成日時 */
  sortKey: string
  /** 「操作」メニュー用 */
  menu: PrivateBookingMenuSource
  /** 進行中の主催者の引き継ぎ依頼（自分が依頼した・頼まれているとき） */
  handover: PrivateGroupHandoverInfo | null
  /** 確定した（まだ終わっていない）貸切の「カレンダーに登録」「地図を開く」の材料。それ以外は null */
  calendar: PrivateBookingCalendar | null
}

/** pageUrl は画面の中のパス（カードで絶対 URL にする） */
export interface PrivateBookingCalendar {
  event: CalendarEventInput
  address: string | null
}

/** 店舗 id → 名前・住所（マイページで読んだ店舗） */
export type StoreAddressMap = Record<string, { name: string; address?: string | null }>

function storeAddressOf(stores: StoreAddressMap | undefined, storeId: string | null | undefined, storeName: string | null | undefined): string | null {
  if (!stores) return null
  const byId = storeId ? stores[storeId] : undefined
  const store = byId ?? (storeName ? Object.values(stores).find(s => s.name === storeName) : undefined)
  return store?.address?.trim() || null
}

/** カードの「操作」メニューに渡す材料 */
export interface PrivateBookingMenuSource {
  inviteCode: string | null
  organizationId: string | null
  reservationNumber: string | null
  phase: PrivateBookingPhase
  memberCount: number
  candidateDates: number
  confirmedDate: string | null
  hasSurvey: boolean
  hasUnansweredDates: boolean
  myMemberId: string | null
  members: PrivateGroupMemberRow[]
  /** 自分が依頼中の主催者の引き継ぎ（「依頼を取り消す」・メンバー管理シートの表示に使う） */
  handover: PrivateGroupHandoverInfo | null
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

/** 2026年11月7日(土) 14:00〜 店舗名 */
function fullDateLabel(date: string, time: string | null | undefined, store: string | null | undefined): string | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const md = formatJstMonthDay(date, true)
  const withYear = `${m[1]}年${md.replace(/^(\d+)\/(\d+)/, (_, mo: string, d: string) => `${Number(mo)}月${Number(d)}日`)}`
  return [withYear, time ? `${time.slice(0, 5)}〜` : null, store || null].filter(Boolean).join(' ')
}

/** 色（グループ画面の「いまの状態」の箱と共通） */
export function toneOf(action: NextActionKind, handoverRequested: boolean): PrivateBookingTone {
  if (handoverRequested) return 'gray'
  switch (action) {
    case 'answer_survey':
    case 'choose_casting':
    case 'pick_character':
    case 'confirm_casting':
    case 'upcoming':
      return 'green'
    case 'waiting_store':
      return 'amber'
    case 'waiting_organizer':
    case 'ended':
      return 'gray'
    default:
      return 'purple'
  }
}

function hostLabelOf(isOrganizer: boolean, organizerName: string | null): string {
  if (isOrganizer) return 'あなたが主催'
  return organizerName ? `${organizerName}さんが主催` : 'メンバーとして参加'
}

interface GroupDecision {
  action: NextActionKind
  progress: PrivateBookingProgress
}

/**
 * 配役の進み具合（日程確定後・キャラクターのいる作品だけ）。マイページはグループの読み取り結果と
 * DB の private_group_casting_status（確定済みか）から、グループ画面は同じ関数の結果から組み立てる。
 */
export interface CastingProgress {
  /** 決め方（未選択は null） */
  method: 'survey' | 'self' | null
  /** 決め方を選ぶ必要がある（事前配役アンケートが使える作品） */
  needsChoice: boolean
  /** 最後に決め方を選び直した後に配役が確定した */
  confirmed: boolean
  /** 自分がやりたいキャラクターを選んだ */
  myPicked: boolean
  /** 希望を出した人数／参加人数 */
  picked: number
  total: number
}

/** 判定に使うグループの項目（グループ画面は読み取り結果から組み立てて渡す） */
export type GroupActionInput = Pick<PrivateGroupSummary, 'status' | 'schedule' | 'candidate_dates_count' | 'all_members_responded' | 'is_organizer' | 'my_unanswered_count'>

/** グループの「次にやること」と進み具合（優先順は NextActionKind の並び）。マイページのカードとグループ画面で共通 */
export function decideGroupAction(
  group: GroupActionInput,
  options: { todayYmd: string; surveyPending: boolean; transferPending?: boolean; ended?: boolean; casting?: CastingProgress | null },
): GroupDecision {
  // 引き継ぎの同意待ちは最優先。進み具合はいまの状態のまま見せる
  if (options.transferPending) {
    return { action: 'accept_transfer', progress: decideGroupAction(group, { ...options, transferPending: false }).progress }
  }
  const pre = (current: number): PrivateBookingProgress => ({ steps: PRE_CONFIRM_STEPS, current })
  const post = (current: number): PrivateBookingProgress => ({ steps: POST_CONFIRM_STEPS, current })
  if (group.status === 'confirmed') {
    const date = group.schedule?.date
    // グループ画面は終了時刻まで見て ended を渡す（公演後の思い出、段階 4）。マイページは日付で判定
    if (options.ended || (date && date < options.todayYmd)) return { action: 'ended', progress: post(POST_CONFIRM_STEPS.length) }
    const casting = options.casting
    if (casting && !casting.confirmed) {
      if (casting.method === null && casting.needsChoice && group.is_organizer) return { action: 'choose_casting', progress: post(1) }
      if (casting.method === 'self' && !casting.myPicked) return { action: 'pick_character', progress: post(1) }
      if (casting.method === 'self' && group.is_organizer) return { action: 'confirm_casting', progress: post(1) }
    }
    if (options.surveyPending) return { action: 'answer_survey', progress: post(1) }
    return { action: 'upcoming', progress: post(2) }
  }
  // 申込中は「4 申込」を今の段として見せる（店舗の確定で 5 へ）
  if (group.status === 'booking_requested') return { action: 'waiting_store', progress: pre(3) }
  // gathering / date_adjusting
  const candidates = group.candidate_dates_count
  const datesProgress = pre(candidates === 0 ? 1 : group.all_members_responded ? 3 : 2)
  if (group.is_organizer) {
    return { action: candidates === 0 ? 'pick_dates' : 'proceed_booking', progress: datesProgress }
  }
  if (candidates > 0 && group.my_unanswered_count > 0) return { action: 'answer_dates', progress: datesProgress }
  return { action: 'waiting_organizer', progress: datesProgress }
}

/** 1 行の説明文（マイページのカードとグループ画面の「いまの状態」の箱で共通） */
export type GroupDescriptionInput = GroupActionInput & Pick<PrivateGroupSummary, 'handover' | 'organizer_name' | 'member_count'>

export function groupDescription(group: GroupDescriptionInput, action: NextActionKind, casting: CastingProgress | null = null): string {
  const handover = group.handover
  if (handover && !handover.isRecipient) {
    return `${handover.toName}さんに主催者の引き継ぎを依頼中です（期限 ${formatHandoverDeadline(handover.expiresAt)}）。同意されるまであなたが主催者です`
  }
  const c = group.candidate_dates_count
  const host = group.organizer_name ? `${group.organizer_name}さん` : '主催者'
  const when = group.schedule ? dateLabel(group.schedule.date, group.schedule.start_time) : ''
  const store = group.schedule?.store_name ? ` ${group.schedule.store_name}` : ''
  switch (action) {
    case 'accept_transfer':
      return handover
        ? `${handover.fromName}さんからの依頼です。引き継ぐと、あなたが申込者（店舗への連絡先・キャンセル料の負担者）になります。期限 ${formatHandoverDeadline(handover.expiresAt)}`
        : '主催者の引き継ぎを頼まれています。内容を確認して同意してください'
    case 'choose_casting':
      return 'キャラクターの配役をどう決めますか。あとから変えられます。'
    case 'pick_character':
      return '自分たちで配役を決めます。やりたいキャラクターを 1 つ選んでください（主催者が最後に調整します）。'
    case 'confirm_casting':
      return casting && casting.total > 0 && casting.picked >= casting.total
        ? '全員の希望が出ました。重なりを調整して配役を確定してください。'
        : `やりたいキャラクターの希望 ${casting?.picked ?? 0}/${casting?.total ?? group.member_count}。そろわなくても主催者が配役を確定できます。`
    case 'answer_survey':
      return `${when}${store}で開催。事前配役アンケートに回答してください`
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

/** ラベルの文言（マイページのカードとグループ画面で共通） */
export function labelOf(action: NextActionKind, date: string | null | undefined): string {
  if (action === 'upcoming') return date ? `${formatJstMonthDay(date, true)} 開催` : '日程確定'
  return NEXT_ACTION_LABELS[action]
}

function primaryOf(action: NextActionKind, base: string): PrivateBookingItem['primary'] {
  switch (action) {
    case 'accept_transfer':
      return { label: '内容を確認して同意する', href: `${base}?sheet=handover` }
    case 'pick_dates':
      return { label: NEXT_ACTION_LABELS[action], href: base, inPlace: 'dates' }
    case 'proceed_booking':
      return { label: NEXT_ACTION_LABELS[action], href: base }
    case 'answer_survey':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?tab=survey`, inPlace: 'survey' }
    case 'choose_casting':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?sheet=casting-method` }
    case 'pick_character':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?sheet=casting-pick` }
    case 'confirm_casting':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?sheet=casting-confirm` }
    case 'answer_dates':
      return { label: NEXT_ACTION_LABELS[action], href: `${base}?tab=schedule`, inPlace: 'answer' }
    default:
      return null
  }
}

function fromGroup(
  group: PrivateGroupSummary,
  options: { todayYmd: string; surveyPending: boolean; castingConfirmed: boolean; fallbackImage: string | null; linked: Reservation | undefined; stores?: StoreAddressMap },
): PrivateBookingItem {
  const casting = castingProgressOf(group.casting, options.castingConfirmed)
  const { action, progress } = decideGroupAction(group, { ...options, casting, transferPending: group.handover?.isRecipient === true })
  const base = `/group/invite/${group.invite_code}`
  // 元主催者（依頼した人）のカードは、節はそのままでラベルだけ「○○さんの同意待ち」にする
  const requested = group.handover && !group.handover.isRecipient ? group.handover : null
  const max = group.scenario_player_count_max
  const reservationNumber = options.linked && options.linked.status !== 'cancelled' ? options.linked.reservation_number ?? null : null
  const schedule = group.schedule
  const address = storeAddressOf(options.stores, schedule?.store_id, schedule?.store_name)
  const calendar: PrivateBookingCalendar | null = group.status === 'confirmed' && action !== 'ended' && schedule?.date && schedule.start_time
    ? {
      event: {
        scenarioTitle: group.scenario_title || '貸切公演',
        kind: 'private',
        date: schedule.date,
        startTime: schedule.start_time,
        endTime: schedule.end_time ?? null,
        storeName: schedule.store_name,
        address,
        reservationNumber,
        pageUrl: base,
      },
      address,
    }
    : null
  return {
    key: `group:${group.id}`,
    groupId: group.id,
    reservationId: group.reservation_id ?? (options.linked && options.linked.status !== 'cancelled' ? options.linked.id : null),
    title: group.scenario_title || 'シナリオ未設定',
    imageUrl: group.scenario_image || options.fallbackImage,
    isOrganizer: group.is_organizer,
    hostLabel: hostLabelOf(group.is_organizer, group.organizer_name),
    action,
    label: requested ? handoverWaitingLabel(requested) : labelOf(action, group.schedule?.date),
    section: SECTION_BY_ACTION[action],
    progress,
    showProgress: !group.handover && action !== 'upcoming' && action !== 'ended',
    tone: toneOf(action, requested !== null),
    primaryTone: toneOf(action, false),
    compact: action === 'upcoming' || action === 'ended',
    headcount: max ? `${group.member_count}/${max}名` : `${group.member_count}名`,
    whenWhere: group.status === 'confirmed' && group.schedule
      ? fullDateLabel(group.schedule.date, group.schedule.start_time, group.schedule.store_name)
      : null,
    description: groupDescription(group, action),
    href: base,
    primary: primaryOf(action, base),
    secondary: { label: 'グループを開く', href: base },
    sortKey: group.schedule?.date ?? group.created_at,
    menu: {
      inviteCode: group.invite_code,
      organizationId: group.organization_id,
      reservationNumber,
      phase: privateBookingPhase(group.status, options.linked?.status),
      memberCount: group.member_count,
      candidateDates: group.candidate_dates_count,
      confirmedDate: group.schedule?.date ?? null,
      hasSurvey: group.survey_enabled,
      hasUnansweredDates: group.my_unanswered_count > 0,
      myMemberId: group.my_member_id,
      members: group.members,
      handover: requested,
    },
    handover: group.handover,
    calendar,
  }
}

/** グループの無い旧い貸切予約（予約だけで 1 枚） */
function fromReservation(
  reservation: Reservation,
  scheduleEvents: ScheduleEventMap,
  scenarioImages: Record<string, string>,
  todayYmd: string,
  stores?: StoreAddressMap,
): PrivateBookingItem | null {
  const href = `/mypage/reservation/${reservation.id}`
  const schedule = reservationSchedule(reservation, scheduleEvents)
  let action: NextActionKind
  let progress: PrivateBookingProgress
  let description: string
  if (ACTIVE_PENDING_STATUSES.includes(reservation.status)) {
    const c = candidateCountOf(reservation)
    action = 'waiting_store'
    progress = { steps: PRE_CONFIRM_STEPS, current: 3 }
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
  const address = storeAddressOf(stores, reservation.store_id, null)
  const calendar: PrivateBookingCalendar | null = action === 'upcoming' && schedule.date && schedule.time
    ? {
      event: {
        scenarioTitle: cleanPrivateTitle(reservation.title) || '貸切公演',
        kind: 'private',
        date: schedule.date,
        startTime: schedule.time,
        storeName: reservation.store_id ? stores?.[reservation.store_id]?.name ?? null : null,
        address,
        reservationNumber: reservation.reservation_number ?? null,
        pageUrl: href,
      },
      address,
    }
    : null
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
    showProgress: action === 'waiting_store',
    tone: toneOf(action, false),
    primaryTone: toneOf(action, false),
    compact: action === 'upcoming' || action === 'ended',
    headcount: reservation.participant_count ? `${reservation.participant_count}名` : null,
    whenWhere: null,
    description,
    href,
    primary: null,
    secondary: { label: '予約詳細を見る', href },
    sortKey: CONFIRMED_STATUSES.includes(reservation.status) ? schedule.date : reservation.created_at,
    menu: {
      inviteCode: null,
      organizationId: reservation.organization_id ?? null,
      reservationNumber: reservation.reservation_number ?? null,
      phase: privateBookingPhase(null, reservation.status),
      memberCount: 1,
      candidateDates: candidateCountOf(reservation),
      confirmedDate: CONFIRMED_STATUSES.includes(reservation.status) ? schedule.date : null,
      hasSurvey: false,
      hasUnansweredDates: false,
      myMemberId: null,
      members: [],
      handover: null,
    },
    handover: null,
    calendar,
  }
}

export interface PrivateBookingBuildInput {
  groups: PrivateGroupSummary[]
  reservations: Reservation[]
  scheduleEvents: ScheduleEventMap
  scenarioImages: Record<string, string>
  /** グループ id → 自分のアンケートが未回答か */
  surveyPending: Record<string, boolean>
  /** グループ id → 配役が確定済みか（決め方が「自分たちで決める」の確定済み・未来の貸切だけ読む） */
  castingConfirmed?: Record<string, boolean>
  todayYmd: string
  /** 店舗の名前・住所（「地図を開く」・カレンダーの場所に使う。無ければ出さない） */
  stores?: StoreAddressMap
}

export interface PrivateBookingView {
  bySection: Record<PrivateBookingSection, PrivateBookingItem[]>
  /** キャンセル済みサブタブに出す貸切（取り下げ・キャンセル）の件数 */
  cancelledCount: number
}

/** 貸切カードを組み立てて節ごとに並べる */
export function buildPrivateBookingView(input: PrivateBookingBuildInput): PrivateBookingView {
  const { groups, reservations, scheduleEvents, scenarioImages, surveyPending, castingConfirmed = {}, todayYmd, stores } = input
  const privateReservations = reservations.filter(r => isPrivateReservation(r, scheduleEvents))
  const linkedReservationIds = new Set<string>()
  const items: PrivateBookingItem[] = []
  for (const group of groups) {
    if (group.status === 'cancelled') continue
    const linked = privateReservations.find(r => r.id === group.reservation_id || r.private_group_id === group.id)
    if (linked) linkedReservationIds.add(linked.id)
    // グループ側に作品画像が無い旧データは予約の作品画像で補う
    const fallbackImage = linked?.scenario_master_id ? scenarioImages[linked.scenario_master_id] ?? null : null
    items.push(fromGroup(group, { todayYmd, surveyPending: surveyPending[group.id] === true, // 「自分たちで決める」の確定済みかは読み終わるまで確定扱い（要対応に一瞬出さない）
      castingConfirmed: group.casting?.method === 'self' ? castingConfirmed[group.id] !== false : false, fallbackImage, linked, stores }))
  }
  for (const reservation of privateReservations) {
    if (linkedReservationIds.has(reservation.id)) continue
    // グループが一覧に出ている予約は二重に出さない（グループ側の reservation_id が空でも private_group_id で結ぶ）
    if (reservation.private_group_id && groups.some(g => g.id === reservation.private_group_id)) continue
    const item = fromReservation(reservation, scheduleEvents, scenarioImages, todayYmd, stores)
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

/** マイページのグループの要約から配役の進み具合を作る（キャラクターのいない作品は null） */
export function castingProgressOf(casting: PrivateGroupSummary['casting'], confirmed: boolean): CastingProgress | null {
  if (!casting) return null
  return { method: casting.method, needsChoice: casting.surveyEnabled, confirmed, myPicked: casting.myPicked, picked: casting.picked, total: casting.total }
}
