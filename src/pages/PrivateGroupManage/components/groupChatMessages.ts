/**
 * 貸切グループのチャットのメッセージの読み方（GroupChat.tsx から規則を変えずに切り出した純粋な関数）。
 */
import { getJstParts } from '@/utils/jstDate'
import type { PrivateGroupMessage } from '@/types'

export interface SystemMessage {
  type: 'system'
  action: 'candidate_dates_added' | 'schedule_confirmed' | 'pre_reading_notice' | 'survey_notice' | 'group_created' | 'member_joined' | 'member_removed' | 'booking_requested' | 'booking_rejected' | 'booking_cancelled' | 'individual_notice' | 'performance_cancelled' | 'staff_message' | 'character_assignment' | 'character_method_selected' | 'organizer_handover' | 'date_answer_reminder' | 'next_group_created'
  count?: number
  dates?: Array<{ date: string; time_slot: string }>
  confirmedDate?: string
  confirmedTimeSlot?: string
  storeName?: string
  message?: string
  organizerName?: string
  targetCount?: number | null
  memberName?: string
  memberId?: string
  candidateCount?: number
  // 設定可能なメッセージ文言
  title?: string
  body?: string
  note?: string
  rejectionReason?: string
  // 個別お知らせ用
  target_member_id?: string
  target_member_name?: string
  target_user_id?: string
  /** 主催者の引き継ぎ（段階 3）の依頼 id。宛先本人への個別お知らせに「確認する」を出す */
  handover_request_id?: string
  /** organizer_handover の結果（accepted / declined / cancelled / expired） */
  result?: string
  // 配役結果用
  assignments?: Record<string, string>
  /** date_answer_reminder（未回答の人に知らせる）の宛先の名前 */
  names?: string[]
  /** next_group_created（同じメンバーで次の貸切、段階 4）の新しいグループの招待コードと作品名 */
  inviteCode?: string
  scenarioTitle?: string
}

/** 日付の見出し（今日・昨日・○月○日） */
export function formatChatDate(dateStr: string, today: Date = new Date()): string {
  const date = new Date(dateStr)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return '今日'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨日'
  } else {
    const p = getJstParts(dateStr)
    return p ? `${Number(p.mo)}月${Number(p.d)}日` : ''
  }
}

/** 同じ日のメッセージをまとめる（届いた順のまま） */
export function groupMessagesByDate(messages: PrivateGroupMessage[]): { date: string; messages: PrivateGroupMessage[] }[] {
  const groups: { date: string; messages: PrivateGroupMessage[] }[] = []
  let currentDate = ''

  for (const msg of messages) {
    const msgDate = new Date(msg.created_at).toDateString()
    if (msgDate !== currentDate) {
      currentDate = msgDate
      groups.push({ date: msg.created_at, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }

  return groups
}

/** システムメッセージかどうか判定（DB/クライアントで string または object のどちらでも来うる） */
export function parseSystemMessage(message: string | Record<string, unknown> | null | undefined): SystemMessage | null {
  if (message == null) return null
  try {
    let parsed: unknown
    if (typeof message === 'string') {
      const t = message.trim()
      if (!t.startsWith('{')) return null
      parsed = JSON.parse(t)
    } else if (typeof message === 'object') {
      parsed = message
    } else {
      return null
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'type' in parsed &&
      (parsed as { type: unknown }).type === 'system'
    ) {
      return parsed as SystemMessage
    }
  } catch {
    // 通常のテキストメッセージ
  }
  return null
}

/** 主催者の引き継ぎ依頼のうち、結果（成立・お断り・取り消し・期限切れ）の記録がチャットにあるものの id */
export function closedHandoverRequestIds(messages: PrivateGroupMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const msg of messages) {
    const system = parseSystemMessage(msg.message)
    if (system?.action === 'organizer_handover' && system.handover_request_id) ids.add(system.handover_request_id)
  }
  return ids
}

// ─── 自動のお知らせを灰色の 1 行にまとめる（グループページ刷新 段階 1） ───

/** 候補日追加のお知らせの 1 件。その後に外された（取り下げた）候補日は deleted */
export interface CandidateNoticeDate {
  date: string
  time_slot: string
  deleted: boolean
}

interface CurrentCandidate {
  id: string
  date: string
  time_slot: string
  status?: string | null
  responses?: Array<{ member_id: string }> | null
}

/** お知らせの time_slot（午前／午後／夜）と DB の time_slot（午前／午後／夜間）をそろえる */
function sameSlot(a: string, b: string): boolean {
  const n = (s: string) => (s === '夜間' ? '夜' : s)
  return n(a) === n(b)
}

function findCandidate(d: { date: string; time_slot: string }, current: ReadonlyArray<CurrentCandidate>): CurrentCandidate | undefined {
  return current.find(c => c.date === d.date && sameSlot(c.time_slot, d.time_slot))
}

/** お知らせに載った候補日に「その後外された」印を付ける。current が null（まだ読めていない）なら全部ありとして扱う */
export function markDeletedCandidates(
  dates: ReadonlyArray<{ date: string; time_slot: string }> | undefined,
  current: ReadonlyArray<CurrentCandidate> | null,
): CandidateNoticeDate[] {
  return (dates ?? []).map(d => ({ date: d.date, time_slot: d.time_slot, deleted: current ? !findCandidate(d, current) : false }))
}

/** 候補日追加のお知らせを「日程に回答」のカードで残すか（自分が未回答の、まだある候補日が含まれるとき） */
export function candidateNoticeNeedsAnswer(
  dates: ReadonlyArray<{ date: string; time_slot: string }> | undefined,
  current: ReadonlyArray<CurrentCandidate> | null,
  myMemberId: string | null,
  answering: boolean,
): boolean {
  if (!answering || !current || !myMemberId) return false
  return (dates ?? []).some(d => {
    const c = findCandidate(d, current)
    return Boolean(c && c.status !== 'rejected' && !c.responses?.some(r => r.member_id === myMemberId))
  })
}

export interface NoticeLineContext {
  getMemberName: (memberId: string | null) => string
  current: ReadonlyArray<CurrentCandidate> | null
  myMemberId: string | null
  /** 日程の回答を受け付けている（店舗への申込前） */
  answering: boolean
}

/**
 * 自動のお知らせ（参加した・外れた・候補日が追加された・作成・申込・引き継ぎの結果）を 1 行の文にする。
 * カードで残すもの（日程の回答が要る候補日追加・日程確定・却下・取消・店舗からのお知らせ・アンケート等）は null。
 */
export function noticeLineText(systemMsg: SystemMessage, authorMemberId: string | null, ctx: NoticeLineContext): string | null {
  switch (systemMsg.action) {
    case 'member_joined': {
      const name = systemMsg.memberId ? ctx.getMemberName(systemMsg.memberId) : (systemMsg.memberName || '退出したメンバー')
      return `${name}さんが参加`
    }
    case 'member_removed':
      return `${systemMsg.memberName || 'メンバー'}さんが外れました`
    case 'group_created':
      return systemMsg.title || 'グループを作成しました'
    case 'booking_requested':
      return systemMsg.title || '店舗に申し込みました'
    case 'organizer_handover':
      return systemMsg.title || '主催者の引き継ぎ'
    case 'date_answer_reminder': {
      const names = (systemMsg.names ?? []).map(n => `${n}さん`).join('、')
      return `${ctx.getMemberName(authorMemberId)}さんから ${names || '未回答の人'} へ: 日程の回答をお願いします`
    }
    case 'candidate_dates_added': {
      if (candidateNoticeNeedsAnswer(systemMsg.dates, ctx.current, ctx.myMemberId, ctx.answering)) return null
      const dates = markDeletedCandidates(systemMsg.dates, ctx.current)
      const count = systemMsg.count ?? dates.length
      const deleted = dates.filter(d => d.deleted).length
      const note = deleted === 0 ? '' : deleted >= dates.length ? '（その後削除）' : `（うち ${deleted} 件は削除済み）`
      return `${ctx.getMemberName(authorMemberId)}さんが候補日を ${count} 件追加${note}`
    }
    default:
      return null
  }
}

export type ChatEntry =
  | { kind: 'line'; key: string; texts: string[] }
  | { kind: 'message'; message: PrivateGroupMessage }

/** 続けて並ぶ 1 行のお知らせを 1 つにまとめる（届いた順のまま） */
export function chunkChatEntries(messages: PrivateGroupMessage[], lineOf: (msg: PrivateGroupMessage) => string | null): ChatEntry[] {
  const entries: ChatEntry[] = []
  for (const message of messages) {
    const text = lineOf(message)
    const last = entries[entries.length - 1]
    if (text === null) entries.push({ kind: 'message', message })
    else if (last?.kind === 'line') last.texts.push(text)
    else entries.push({ kind: 'line', key: `line-${message.id}`, texts: [text] })
  }
  return entries
}

/** GroupChat 用: メッセージ → 1 行の文（カードで出すものは null） */
export function noticeLineResolver(args: {
  getMemberName: (memberId: string | null) => string
  current: ReadonlyArray<CurrentCandidate> | null
  status: string | null | undefined
  myMemberId: string | null
}): (msg: PrivateGroupMessage) => string | null {
  const ctx: NoticeLineContext = {
    getMemberName: args.getMemberName,
    current: args.current,
    myMemberId: args.myMemberId,
    answering: args.status === 'gathering' || args.status === 'date_adjusting',
  }
  return msg => {
    // 本人が削除した発言は灰色の 1 行（段階 2）
    if (msg.deleted_at) return 'メッセージを削除しました'
    const system = parseSystemMessage(msg.message)
    return system ? noticeLineText(system, msg.member_id, ctx) : null
  }
}
