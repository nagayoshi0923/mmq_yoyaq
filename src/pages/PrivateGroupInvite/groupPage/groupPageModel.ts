/**
 * 貸切グループページ（刷新 段階 1）の組み立て。純粋な関数だけを置く。
 * 仕様の正本: docs/product-spec/グループページ刷新_2026-10.md
 *
 * 「いまの状態」の箱のラベル・色・説明文はマイページの貸切カード（privateBookingModel.ts）と同じ判定を使う。
 */
import { formatJstMonthDay } from '@/utils/jstDate'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'
import type { DateResponse, PrivateGroup } from '@/types'
import {
  decideGroupAction,
  groupDescription,
  labelOf,
  toneOf,
  type CastingProgress,
  type GroupDescriptionInput,
  type NextActionKind,
  type PrivateBookingTone,
} from '@/pages/MyPage/components/PrivateBookingCards/privateBookingModel'
import { toMemberRows, type PrivateGroupMemberRow } from '@/pages/MyPage/components/PrivateBookingCards/privateGroupSummary'
import { handoverWaitingLabel, type PrivateGroupHandoverInfo } from '@/pages/MyPage/components/PrivateBookingCards/privateGroupHandover'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'

// ─── タブ ──────────────────────────────────────────────

export type GroupTab = 'overview' | 'dates' | 'members' | 'chat' | 'memories'

export const GROUP_TABS: ReadonlyArray<{ id: GroupTab; label: string }> = [
  { id: 'overview', label: '概要' },
  { id: 'dates', label: '日程' },
  { id: 'members', label: 'メンバー' },
  { id: 'chat', label: 'チャット' },
]

/** 公演後（段階 4）のタブ。日程は出さず、概要の中身は思い出タブの「公演の記録」に畳む */
export const AFTER_TABS: ReadonlyArray<{ id: GroupTab; label: string }> = [
  { id: 'memories', label: '思い出' },
  { id: 'members', label: 'メンバー' },
  { id: 'chat', label: 'チャット' },
]

export function groupTabsFor(ended: boolean): ReadonlyArray<{ id: GroupTab; label: string }> {
  return ended ? AFTER_TABS : GROUP_TABS
}

/**
 * 公演が終わったか（確定した公演の終了時刻〔無ければ開始時刻〕を過ぎた、または予約が完了扱い）。
 * 日付と時刻は日本時間として読む。
 */
export function isPerformanceEnded(
  performance: { date: string; start_time?: string | null; end_time?: string | null } | null | undefined,
  reservationStatus: string | null | undefined,
  now: Date,
): boolean {
  if (!performance?.date) return false
  if (reservationStatus === 'completed') return true
  const time = (performance.end_time || performance.start_time || '23:59').slice(0, 5)
  const at = new Date(`${performance.date}T${time}:00+09:00`)
  return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime()
}

/** 「11/7(土) 14:00 高田馬場店」 */
export function performanceLabel(performance: { date: string; start_time?: string | null; store_name?: string | null }): string {
  const day = formatJstMonthDay(performance.date, true)
  return [day, (performance.start_time ?? '').slice(0, 5), performance.store_name ?? ''].filter(Boolean).join(' ')
}

/**
 * URL の ?tab= を読む。旧い値（マイページ・通知の ?tab=schedule、旧「管理」タブ）も受ける。
 * survey は専用画面（SurveyScreen）。分からない値は null（状態で決める）。
 */
export function parseGroupTab(raw: string | null | undefined): GroupTab | 'survey' | null {
  switch (raw) {
    case 'overview':
    case 'dates':
    case 'members':
    case 'chat':
    case 'memories':
    case 'survey':
      return raw
    case 'schedule':
      return 'dates'
    case 'manage':
      return 'members'
    default:
      return null
  }
}

/** ?tab= が無いときの初期タブ。公演後は思い出、確定後は概要、それ以外は日程（チャットに未読があっても自動では開かない） */
export function defaultGroupTab(phase: PrivateBookingPhase, ended = false): GroupTab {
  if (ended) return 'memories'
  return phase === 'confirmed' ? 'overview' : 'dates'
}

/** いま出すタブ。公演後は概要・日程を思い出に、公演前は思い出を初期タブに読み替える */
export function resolveGroupTab(tab: GroupTab | null, phase: PrivateBookingPhase, ended: boolean): GroupTab {
  const fallback = defaultGroupTab(phase, ended)
  if (!tab) return fallback
  if (ended && (tab === 'overview' || tab === 'dates')) return 'memories'
  if (!ended && tab === 'memories') return fallback
  return tab
}

// ─── 日程の回答表 ───────────────────────────────────────

export interface AnswerColumn {
  memberId: string
  name: string
  role: PrivateGroupMemberRow['role']
  isMe: boolean
  /** 全候補日に回答済みか */
  answeredAll: boolean
}

export interface AnswerRow {
  id: string
  date: string
  /** 「10/30(金)」 */
  dateLabel: string
  /** 「午後」 */
  slotLabel: string
  /** 「13:00」 */
  startTime: string
  rejected: boolean
  /** メンバー id → 回答（未回答は null） */
  cells: Record<string, DateResponse | null>
  ok: number
  maybe: number
  ng: number
}

export interface AnswerTable {
  columns: AnswerColumn[]
  rows: AnswerRow[]
  /** 最も集まっている行（○ を 2 点・△ を 1 点で数え、同点は日付の早い方）。○△ が 1 つも無ければ null */
  bestRowId: string | null
  /** 全候補日に回答済みの人数 */
  respondedCount: number
  memberCount: number
}

type TableGroup = Pick<PrivateGroup, 'members' | 'candidate_dates'>

/** 候補日 × メンバーの回答表。列は自分を先頭に、あとは主催者・参加順 */
export function buildAnswerTable(group: TableGroup, myMemberId: string | null): AnswerTable {
  const memberRows = toMemberRows(group)
  const ordered = [
    ...memberRows.filter(m => m.id === myMemberId),
    ...memberRows.filter(m => m.id !== myMemberId),
  ]
  const columns: AnswerColumn[] = ordered.map(m => ({
    memberId: m.id,
    name: m.name,
    role: m.role,
    isMe: m.id === myMemberId,
    answeredAll: m.total > 0 && m.answered >= m.total,
  }))
  const memberIds = new Set(columns.map(c => c.memberId))
  const responseOf = (memberId: string, candidateId: string, fromCandidate: Array<{ member_id: string; response: DateResponse }> | undefined | null): DateResponse | null => {
    const r = fromCandidate?.find(x => x.member_id === memberId)
    if (r) return r.response
    const member = group.members?.find(m => m.id === memberId)
    return member?.date_responses?.find(x => x.candidate_date_id === candidateId)?.response ?? null
  }
  const rows: AnswerRow[] = [...(group.candidate_dates ?? [])]
    .sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)))
    .map(cd => {
      const cells: Record<string, DateResponse | null> = {}
      let ok = 0
      let maybe = 0
      let ng = 0
      for (const id of memberIds) {
        const v = responseOf(id, cd.id, cd.responses)
        cells[id] = v
        if (v === 'ok') ok++
        else if (v === 'maybe') maybe++
        else if (v === 'ng') ng++
      }
      return {
        id: cd.id,
        date: cd.date,
        dateLabel: formatJstMonthDay(cd.date, true),
        slotLabel: candidateTimeSlotFromDb(cd.time_slot),
        startTime: (cd.start_time ?? '').slice(0, 5),
        rejected: cd.status === 'rejected',
        cells,
        ok,
        maybe,
        ng,
      }
    })
  let bestRowId: string | null = null
  let bestScore = 0
  for (const row of rows) {
    if (row.rejected) continue
    const score = row.ok * 2 + row.maybe
    if (score > bestScore) {
      bestScore = score
      bestRowId = row.id
    }
  }
  return {
    columns,
    rows,
    bestRowId,
    respondedCount: columns.filter(c => c.answeredAll).length,
    memberCount: columns.length,
  }
}

/** 自分のセルを押したときの次の回答（○ → △ → × → ○。未回答は ○ から） */
export function nextResponse(current: DateResponse | null | undefined): DateResponse {
  if (current === 'ok') return 'maybe'
  if (current === 'maybe') return 'ng'
  return 'ok'
}

export const RESPONSE_MARK: Record<DateResponse, string> = { ok: '○', maybe: '△', ng: '×' }

/** 「10/30(金) 午後」 */
export function rowShortLabel(row: Pick<AnswerRow, 'dateLabel' | 'slotLabel'>): string {
  return `${row.dateLabel} ${row.slotLabel}`
}

/** 「○2・△1」（0 件の印は出さない） */
export function rowTally(row: Pick<AnswerRow, 'ok' | 'maybe' | 'ng'>, sep = '・'): string {
  return [row.ok ? `○${row.ok}` : '', row.maybe ? `△${row.maybe}` : '', row.ng ? `×${row.ng}` : ''].filter(Boolean).join(sep)
}

/** 未回答（全候補日に答えていない）の人。自分は除く */
export function unansweredMembers(table: AnswerTable): AnswerColumn[] {
  return table.columns.filter(c => !c.isMe && !c.answeredAll)
}


// ─── いまの状態の箱 ─────────────────────────────────────

/** 箱のボタンが押されたときにすること（画面側で処理する） */
export type StatusActionKind =
  | 'add_dates'
  | 'edit_dates'
  | 'book'
  | 'answer'
  | 'send_invite'
  | 'view_booking'
  | 'survey'
  | 'handover'
  | 'share_photos'
  | 'feedback'
  | 'next_group'
  // 配役（日程確定後）: 決め方のシートを開く／その場で決め方を保存／キャラクターを選ぶ・確定のシートを開く／未選択の人に知らせる
  | 'casting_method'
  | 'casting_survey'
  | 'casting_self'
  | 'casting_pick'
  | 'casting_confirm'
  | 'casting_remind'

export interface StatusAction {
  kind: StatusActionKind
  label: string
  /** book のとき、申込シートで先に選んでおく候補日 */
  candidateId?: string
}

export interface GroupStatusView {
  action: NextActionKind
  tone: PrivateBookingTone
  /** 主ボタンの色（引き継ぎ依頼中で箱が灰でも、次にやることの色のまま） */
  primaryTone: PrivateBookingTone
  /** チップ（次にやること）。マイページのカードと同じ文言 */
  chip: string
  /** チップの右の補足（「3人中 2人が回答済み」「10/9 申込」） */
  sub: string | null
  /** 本文（最も集まっている候補日があればその 1 文、無ければマイページのカードと同じ説明文） */
  body: string
  primary: StatusAction | null
  secondary: StatusAction[]
  /** チャットタブで出す 1 行版 */
  oneLine: string
  /** チャットタブの 1 行を押したときの操作（無ければ概要・日程へ）と右端の文言 */
  barAction?: StatusAction
  barLabel?: string
}

export interface GroupStatusInput {
  status: string
  phase: PrivateBookingPhase
  isOrganizer: boolean
  organizerName: string | null
  memberCount: number
  table: AnswerTable
  myMemberId: string | null
  confirmed: { date: string; start_time: string | null; store_name: string | null } | null
  /** 申込日時（返事待ちの補足に使う） */
  requestedAt: string | null
  surveyPending: boolean
  handover: PrivateGroupHandoverInfo | null
  /** 候補日の追加・申込ができる（店舗への申込前） */
  canMutateSchedule: boolean
  todayYmd: string
  /** 公演が終わった（終了時刻を過ぎた・完了扱い）。公演後の思い出（段階 4）の箱になる */
  ended?: boolean
  /** 公演の記録（開催日時・店舗）。公演後の箱の補足に使う */
  performance?: { date: string; start_time: string | null; store_name: string | null } | null
  /** 「同じメンバーで次の貸切」を出す（会員だけ） */
  canStartNext?: boolean
  /** 配役の進み具合（確定後・キャラクターのいる作品だけ） */
  casting?: CastingProgress | null
}

/** 確定後の状態名に合わせてグループの status を補う（予約の状態でグループ行の更新遅れを補う） */
function effectiveStatus(status: string, phase: PrivateBookingPhase): string {
  if (phase === 'confirmed') return 'confirmed'
  if (phase === 'requested') return 'booking_requested'
  return status
}

export function buildGroupStatus(input: GroupStatusInput): GroupStatusView {
  const { table, isOrganizer, confirmed } = input
  const activeRows = table.rows.filter(r => !r.rejected)
  const me = table.columns.find(c => c.isMe)
  const myUnanswered = me ? activeRows.filter(r => r.cells[me.memberId] == null).length : 0
  const summary: GroupDescriptionInput = {
    status: effectiveStatus(input.status, input.phase),
    schedule: confirmed ? { date: confirmed.date, start_time: confirmed.start_time, store_name: confirmed.store_name } : null,
    candidate_dates_count: activeRows.length,
    all_members_responded: activeRows.length > 0 && table.respondedCount >= table.memberCount && table.memberCount > 0,
    is_organizer: isOrganizer,
    my_unanswered_count: myUnanswered,
    handover: input.handover,
    organizer_name: input.organizerName,
    member_count: input.memberCount,
  }
  const { action } = decideGroupAction(summary, {
    todayYmd: input.todayYmd,
    surveyPending: input.surveyPending,
    transferPending: input.handover?.isRecipient === true,
    ended: input.ended === true,
    casting: input.casting ?? null,
  })
  const requested = input.handover && !input.handover.isRecipient ? input.handover : null
  const chip = requested ? handoverWaitingLabel(requested) : labelOf(action, summary.schedule?.date)
  const best = table.bestRowId ? activeRows.find(r => r.id === table.bestRowId) ?? null : null
  const bestLine = best
    ? `候補日 ${activeRows.length} 件のうち ${rowShortLabel(best)} が最も集まっています（${rowTally(best)}）。`
    : null
  const answeredSub = activeRows.length > 0 ? `${table.memberCount}人中 ${table.respondedCount}人が回答済み` : null
  const description = groupDescription(summary, action, input.casting ?? null)
  const invite: StatusAction = { kind: 'send_invite', label: '招待リンクを送る' }

  let sub: string | null = null
  let highlight: string | null = null
  let primary: StatusAction | null = null
  let secondary: StatusAction[] = []
  let oneLine = chip
  let barAction: StatusAction | undefined
  let barLabel: string | undefined
  const picked = input.casting ? `希望 ${input.casting.picked}/${input.casting.total}` : null

  switch (action) {
    case 'accept_transfer':
      primary = { kind: 'handover', label: '内容を確認して同意する' }
      break
    case 'answer_survey':
      primary = { kind: 'survey', label: 'アンケートに回答する' }
      oneLine = `${chip}・${description}`
      barAction = primary
      barLabel = '回答する ›'
      break
    case 'choose_casting':
      sub = input.performance ? performanceLabel(input.performance) : null
      primary = { kind: 'casting_survey', label: '事前配役アンケートで希望を伝える' }
      secondary = [{ kind: 'casting_self', label: '自分たちで決める' }]
      barAction = { kind: 'casting_method', label: chip }
      barLabel = '選ぶ ›'
      break
    case 'pick_character':
      sub = input.casting ? `希望を出した人 ${input.casting.picked}/${input.casting.total}` : null
      primary = { kind: 'casting_pick', label: 'キャラクターを選ぶ' }
      oneLine = [chip, picked].filter(Boolean).join('・')
      barAction = primary
      barLabel = '選ぶ ›'
      break
    case 'confirm_casting': {
      const all = input.casting ? input.casting.picked >= input.casting.total : false
      sub = picked ? `${picked}${all ? ' そろいました' : ''}` : null
      primary = { kind: 'casting_confirm', label: '配役を確定する' }
      if (!all) secondary = [{ kind: 'casting_remind', label: '未回答の人に知らせる' }]
      oneLine = [chip, picked].filter(Boolean).join('・')
      barAction = primary
      barLabel = '確定する ›'
      break
    }
    case 'pick_dates':
      if (input.canMutateSchedule) primary = { kind: 'add_dates', label: '候補日を追加' }
      secondary = [invite]
      oneLine = `${chip}・候補日はまだありません`
      break
    case 'proceed_booking':
      sub = answeredSub
      highlight = bestLine
      if (input.canMutateSchedule) {
        primary = best
          ? { kind: 'book', label: `${rowShortLabel(best)} で店舗に申し込む`, candidateId: best.id }
          : { kind: 'book', label: '申込に進む' }
        secondary = [{ kind: 'edit_dates', label: '候補日を編集' }, invite]
      } else {
        secondary = [invite]
      }
      oneLine = [chip, answeredSub, best ? `${rowShortLabel(best)}が有力` : null].filter(Boolean).join('・')
      break
    case 'answer_dates':
      sub = answeredSub
      highlight = bestLine
      primary = { kind: 'answer', label: '日程に回答する' }
      secondary = [invite]
      oneLine = [chip, answeredSub, best ? `${rowShortLabel(best)}が有力` : null].filter(Boolean).join('・')
      break
    case 'waiting_organizer':
      sub = answeredSub
      highlight = bestLine
      secondary = [invite]
      oneLine = [chip, best ? `${rowShortLabel(best)}が有力` : null].filter(Boolean).join('・')
      break
    case 'waiting_store':
      sub = input.requestedAt ? `${formatJstMonthDay(input.requestedAt)} 申込` : null
      secondary = [{ kind: 'view_booking', label: '申込内容を見る' }]
      oneLine = [chip, sub].filter(Boolean).join('・')
      break
    case 'upcoming':
      oneLine = `${chip}・${description}`
      break
    case 'ended':
      if (input.ended) return endedStatus(input)
      oneLine = `${chip}・${description}`
      break
  }

  return {
    action,
    tone: toneOf(action, requested !== null),
    primaryTone: toneOf(action, false),
    chip,
    sub,
    body: highlight ?? description,
    primary,
    secondary,
    oneLine,
    barAction,
    barLabel,
  }
}

/** 公演後（段階 4）の箱: 緑の「開催しました」、写真の共有へ誘う */
function endedStatus(input: GroupStatusInput): GroupStatusView {
  const sub = input.performance ? performanceLabel(input.performance) : null
  const secondary: StatusAction[] = [{ kind: 'feedback', label: '感想を書く' }]
  if (input.canStartNext) secondary.push({ kind: 'next_group', label: '同じメンバーで次の貸切' })
  return {
    action: 'ended',
    tone: 'green',
    primaryTone: 'green',
    chip: '開催しました',
    sub,
    body: 'ご参加ありがとうございました。記念写真をここに残すと、メンバー全員のアルバムにも入ります。',
    primary: { kind: 'share_photos', label: '写真を共有する' },
    secondary,
    oneLine: '開催しました・写真を共有しましょう',
  }
}

/** 「9 枚・いちこ、二郎、るい」（投稿者は新しい順に 3 人まで） */
export function photoSummary(photos: ReadonlyArray<{ memberId: string | null }>, nameOf: (memberId: string | null) => string): string {
  const names: string[] = []
  for (const p of photos) {
    const name = nameOf(p.memberId)
    if (!names.includes(name)) names.push(name)
  }
  const shown = names.slice(0, 3).join('、')
  return `${photos.length} 枚${shown ? `・${shown}${names.length > 3 ? ` ほか ${names.length - 3} 人` : ''}` : ''}`
}

// ─── チャットの未読 ─────────────────────────────────────

/**
 * 最後に見た時刻より新しい、自分以外の発言・お知らせの数。見た記録が無ければ 0（初回に大きな数を出さない）。
 * isLine: 灰色の 1 行の自動お知らせ（参加した・候補日の追加 など）か。数えない（段階 3。カードで残るお知らせは数える）
 */
export function countUnread<M extends { created_at: string; member_id: string | null; deleted_at?: string | null }>(
  messages: ReadonlyArray<M>,
  myMemberId: string | null,
  lastSeenAt: string | null,
  isLine?: (message: M) => boolean,
): number {
  if (!lastSeenAt) return 0
  const seen = new Date(lastSeenAt).getTime()
  return messages.filter(m => m.member_id !== myMemberId && !m.deleted_at && new Date(m.created_at).getTime() > seen && !isLine?.(m)).length
}
