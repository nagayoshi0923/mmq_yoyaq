/**
 * 貸切グループのチャットのメッセージの読み方（GroupChat.tsx から規則を変えずに切り出した純粋な関数）。
 */
import { formatJstMonthDay, getJstParts } from '@/utils/jstDate'
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
  /** date_answer_reminder の内容（無い・dates は日程の回答、survey は事前配役アンケート、casting はやりたいキャラクター） */
  kind?: 'dates' | 'survey' | 'casting'
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

/** 候補日追加のお知らせに自分の回答が要るか（自分が未回答の、まだある候補日が含まれるとき。未読に数える） */
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

/** 自分が未回答の、まだある（取り下げていない）候補日があるか */
function hasUnansweredCandidate(current: ReadonlyArray<CurrentCandidate> | null, myMemberId: string | null): boolean {
  if (!current || !myMemberId) return false
  return current.some(c => c.status !== 'rejected' && !c.responses?.some(r => r.member_id === myMemberId))
}

/** 行の末尾の小さなリンクの行き先（既存の導線: 日程タブ・概要タブ・概要タブの配役欄（?tab=overview#casting）・配役のシート（?sheet=casting-method / casting-pick）・アンケート・引き継ぎの確認・招待・その場で本文を開く） */
export type NoticeLinkTarget = 'dates' | 'overview' | 'casting' | 'casting-method' | 'casting-pick' | 'survey' | 'handover' | 'invite' | 'expand'

/** 自動のお知らせの灰色の 1 行（チャットにはカードを流さない。2026-10-11 社長決定） */
export interface NoticeLine {
  text: string
  /** 行動が要るときだけ、行の末尾に 1 つ */
  link?: { label: string; target: NoticeLinkTarget; requestId?: string; inviteCode?: string }
  /** link.target が expand のとき開いて出す本文（店舗の文面など） */
  detail?: string
  /** 本人にだけ見えるお知らせ（個別お知らせ） */
  personal?: boolean
  /** 未読の赤丸に数える（店舗からの返事・自分に行動が要るもの。以前カードだったもの） */
  notable?: boolean
  /** 自分には見せない（宛先が別の人の個別お知らせ・方法を選び直した後の配役） */
  hidden?: boolean
  /** まとめる単位（同じ種類が短時間に続いたら 1 行に） */
  kind: string
}

export interface NoticeLineContext {
  getMemberName: (memberId: string | null) => string
  current: ReadonlyArray<CurrentCandidate> | null
  myMemberId: string | null
  /** 日程の回答を受け付けている（店舗への申込前） */
  answering: boolean
  /** ログイン中の利用者 id（個別お知らせの宛先の判定。ゲストは null） */
  userId?: string | null
  /** 結果の記録が出た引き継ぎ依頼 id（「確認する」を出さない） */
  closedHandoverIds?: ReadonlySet<string>
  /** 配役方法（未選択・選び直し中は配役の確定を出さない） */
  charAssignmentMethod?: string | null
  /** 組織が決めた「事前読み込み」のお知らせの見出し */
  preReadingTitle?: string
}

/** "2026-11-07" → "11/7(土)" */
function shortDate(date: string | undefined): string {
  return date ? formatJstMonthDay(date, true) : ''
}

/** 個別お知らせが自分宛てか（member_id 一致、またはログイン中の利用者の一致。#275/#278） */
export function isNoticeForMe(systemMsg: SystemMessage, myMemberId: string | null, userId: string | null | undefined): boolean {
  const byMember = Boolean(myMemberId) && systemMsg.target_member_id === myMemberId
  const byUser = Boolean(userId) && Boolean(systemMsg.target_user_id) && systemMsg.target_user_id === userId
  return byMember || byUser
}

/** アンケートのお知らせの本文から「回答期限: 11/5まで」を拾う */
function surveyDeadline(message: string | undefined): string | null {
  const m = message?.match(/回答期限[:：]\s*([0-9]{1,2}\/[0-9]{1,2})\s*まで/)
  return m ? m[1] : null
}

/** 引き継ぎの依頼の本文の先頭「○○さんから」から頼んだ人の名前を拾う */
function handoverFrom(message: string | undefined): string | null {
  const m = message?.match(/^(.+?)さんから/)
  return m ? m[1] : null
}

const expand = (label: string, detail: string | undefined): Pick<NoticeLine, 'link' | 'detail'> =>
  detail && detail.trim() ? { link: { label, target: 'expand' }, detail } : {}

/**
 * 自動のお知らせ（system メッセージ）を灰色の 1 行にする。チャットは人の発言と写真だけを吹き出しにする。
 * 行動が要るものは末尾に小さなリンクを 1 つ（行き先は既存の ?tab= / ?sheet=）。DB の文面・種類は変えない（表示だけ）。
 */
export function noticeLine(systemMsg: SystemMessage, authorMemberId: string | null, ctx: NoticeLineContext): NoticeLine {
  const kind = systemMsg.action
  switch (systemMsg.action) {
    case 'member_joined': {
      const name = systemMsg.memberId ? ctx.getMemberName(systemMsg.memberId) : (systemMsg.memberName || '退出したメンバー')
      return { kind, text: `${name}さんが参加` }
    }
    case 'member_removed':
      return { kind, text: `${systemMsg.memberName || 'メンバー'}さんが外れました` }
    case 'group_created':
      return { kind, text: systemMsg.title || 'グループを作成しました' }
    case 'booking_requested':
      return { kind, text: systemMsg.title || '店舗に申し込みました' }
    case 'organizer_handover':
      return { kind, text: systemMsg.title || '主催者の引き継ぎ' }
    case 'date_answer_reminder': {
      const names = (systemMsg.names ?? []).map(n => `${n}さん`).join('、')
      const by = `（${ctx.getMemberName(authorMemberId)}さんから）`
      // 事前配役アンケート・やりたいキャラクター（配役の PR #1035）は名前が挙がった本人に入口を出す
      const named = Boolean(ctx.myMemberId) && (systemMsg.names ?? []).includes(ctx.getMemberName(ctx.myMemberId))
      if (systemMsg.kind === 'survey') {
        return { kind, text: `${names || '未回答の人'} 事前配役アンケートの回答をお願いします${by}`, ...(named ? { link: { label: '回答する', target: 'survey' as const }, notable: true } : {}) }
      }
      if (systemMsg.kind === 'casting') {
        return { kind, text: `${names || '未回答の人'} やりたいキャラクターを選んでください${by}`, ...(named ? { link: { label: '選ぶ', target: 'casting-pick' as const }, notable: true } : {}) }
      }
      const needs = ctx.answering && hasUnansweredCandidate(ctx.current, ctx.myMemberId)
      return {
        kind,
        text: `${names || '未回答の人'} 日程の回答をお願いします${by}`,
        ...(needs ? { link: { label: '回答する', target: 'dates' as const }, notable: true } : {}),
      }
    }
    case 'candidate_dates_added': {
      const dates = markDeletedCandidates(systemMsg.dates, ctx.current)
      const count = systemMsg.count ?? dates.length
      const deleted = dates.filter(d => d.deleted).length
      const note = deleted === 0 ? '' : deleted >= dates.length ? '（その後削除）' : `（うち ${deleted} 件は削除済み）`
      const needs = candidateNoticeNeedsAnswer(systemMsg.dates, ctx.current, ctx.myMemberId, ctx.answering)
      const remains = ctx.answering && dates.some(d => !d.deleted)
      return {
        kind,
        text: `${ctx.getMemberName(authorMemberId)}さんが候補日を ${count} 件追加${note}`,
        ...(remains ? { link: { label: '日程を見る', target: 'dates' as const } } : {}),
        ...(needs ? { notable: true } : {}),
      }
    }
    case 'schedule_confirmed': {
      const when = [shortDate(systemMsg.confirmedDate), systemMsg.confirmedTimeSlot].filter(Boolean).join(' ')
      return { kind, text: `店舗が日程を確定しました${when ? ` ${when}` : ''}`, link: { label: '概要を見る', target: 'overview' }, notable: true }
    }
    case 'booking_rejected': {
      const detail = [systemMsg.body, systemMsg.rejectionReason].filter(Boolean).join('\n\n')
      return { kind, text: systemMsg.title || '店舗が日程をお受けできませんでした', notable: true, ...(detail ? expand('理由を見る', detail) : { link: { label: '日程を見る', target: 'dates' } }) }
    }
    case 'booking_cancelled':
      return { kind, text: systemMsg.title || '店舗が予約を取り消しました', link: { label: '概要を見る', target: 'overview' }, notable: true }
    case 'pre_reading_notice':
      return { kind, text: ctx.preReadingTitle || '事前読み込みについて', notable: true, ...expand('読む', systemMsg.message) }
    case 'survey_notice': {
      const due = surveyDeadline(systemMsg.message)
      return { kind, text: `事前配役アンケートの回答をお願いします${due ? `（${due} まで）` : ''}`, link: { label: '回答する', target: 'survey' }, notable: true }
    }
    case 'staff_message':
      return {
        kind,
        text: `店舗からのお知らせ${systemMsg.title && systemMsg.title !== '店舗からのお知らせ' ? `「${systemMsg.title}」` : ''}`,
        notable: true,
        ...expand('読む', systemMsg.body ? `${systemMsg.body}\n\n※ 返信は店舗に届きません。ご連絡は「店舗に問い合わせる」からお願いします。` : undefined),
      }
    case 'next_group_created': {
      const code = systemMsg.inviteCode && /^[0-9a-f]{32}$/i.test(systemMsg.inviteCode) ? systemMsg.inviteCode : null
      return {
        kind,
        text: `${systemMsg.title || '次の貸切のお誘い'}${systemMsg.scenarioTitle ? `「${systemMsg.scenarioTitle}」` : ''}`,
        notable: true,
        ...(code ? { link: { label: '参加する', target: 'invite' as const, inviteCode: code } } : {}),
      }
    }
    case 'individual_notice': {
      if (!isNoticeForMe(systemMsg, ctx.myMemberId, ctx.userId)) return { kind, text: '', hidden: true }
      const requestId = systemMsg.handover_request_id
      if (requestId) {
        const from = handoverFrom(systemMsg.message)
        const text = from ? `${from}さんから主催者の引き継ぎの依頼` : (systemMsg.title || '主催者の引き継ぎの依頼')
        if (ctx.closedHandoverIds?.has(requestId)) return { kind, text: `${text}（終わりました）`, personal: true }
        return { kind, text, personal: true, notable: true, link: { label: '確認する', target: 'handover', requestId } }
      }
      return { kind, text: systemMsg.title || 'あなたへのお知らせ', personal: true, notable: true, ...expand('読む', systemMsg.message) }
    }
    case 'character_method_selected':
      return { kind, text: systemMsg.title || '配役方法が選択されました', notable: true, ...expand('詳しく', systemMsg.body) }
    case 'character_assignment':
      if (!ctx.charAssignmentMethod) return { kind, text: '', hidden: true }
      // 配役の操作・結果は概要タブの「配役」欄（チャットには出さない）
      return { kind, text: '配役が確定しました', notable: true, link: { label: '概要', target: 'casting' } }
    default:
      return { kind, text: systemMsg.title || 'お知らせ', notable: true, ...expand('読む', systemMsg.body || systemMsg.message) }
  }
}

export type ChatEntry =
  | { kind: 'line'; key: string; lines: NoticeLine[] }
  | { kind: 'message'; message: PrivateGroupMessage }

/** 同じ種類のお知らせをまとめる間隔（段階 1 の「続けて届いたものは 1 行」に、リンク付きは短時間の条件を足した） */
export const MERGE_WINDOW_MS = 10 * 60 * 1000

function canMerge(prev: NoticeLine, prevAt: string, next: NoticeLine, nextAt: string): boolean {
  if (prev.personal || next.personal || prev.detail || next.detail) return false
  if (!prev.link && !next.link) return true
  return prev.kind === next.kind && prev.link?.target === next.link?.target && prev.link?.label === next.link?.label
    && Math.abs(new Date(nextAt).getTime() - new Date(prevAt).getTime()) <= MERGE_WINDOW_MS
}

/** 続けて並ぶ 1 行のお知らせを 1 つにまとめる（届いた順のまま。見せないお知らせは飛ばす） */
export function chunkChatEntries(messages: PrivateGroupMessage[], lineOf: (msg: PrivateGroupMessage) => NoticeLine | null): ChatEntry[] {
  const entries: ChatEntry[] = []
  let lastAt = ''
  for (const message of messages) {
    const line = lineOf(message)
    if (line?.hidden) continue
    const last = entries[entries.length - 1]
    if (line === null) entries.push({ kind: 'message', message })
    else if (last?.kind === 'line' && canMerge(last.lines[last.lines.length - 1], lastAt, line, message.created_at)) {
      if (!last.lines.some(l => l.text === line.text)) last.lines.push(line)
    } else entries.push({ kind: 'line', key: `line-${message.id}`, lines: [line] })
    if (line) lastAt = message.created_at
  }
  return entries
}

/** GroupChat 用: メッセージ → 1 行（人の発言・写真は null） */
export function noticeLineResolver(args: {
  getMemberName: (memberId: string | null) => string
  current: ReadonlyArray<CurrentCandidate> | null
  status: string | null | undefined
  myMemberId: string | null
  userId?: string | null
  closedHandoverIds?: ReadonlySet<string>
  charAssignmentMethod?: string | null
  preReadingTitle?: string
}): (msg: PrivateGroupMessage) => NoticeLine | null {
  const ctx: NoticeLineContext = {
    getMemberName: args.getMemberName,
    current: args.current,
    myMemberId: args.myMemberId,
    answering: args.status === 'gathering' || args.status === 'date_adjusting',
    userId: args.userId,
    closedHandoverIds: args.closedHandoverIds,
    charAssignmentMethod: args.charAssignmentMethod,
    preReadingTitle: args.preReadingTitle,
  }
  return msg => {
    // 本人が削除した発言は灰色の 1 行（段階 2）
    if (msg.deleted_at) return { kind: 'deleted', text: 'メッセージを削除しました' }
    const system = parseSystemMessage(msg.message)
    return system ? noticeLine(system, msg.member_id, ctx) : null
  }
}

/**
 * 配役の状態の灰色 1 行（チャットの末尾）。配役の操作（決め方の選択・希望の選択・主催者の確定）は
 * いまの状態の箱から開く全画面シート（?sheet=casting-method / casting-pick / casting-confirm、#1035）で行い、チャットには出さない。
 * 確定はお知らせ（character_assignment）の 1 行「配役が確定しました › 概要」で出すのでここでは出さない。
 */
export function castingLine(args: {
  isOrganizer: boolean
  needsMethodChoice: boolean
  method: string | null | undefined
  hasCharacters: boolean
  confirmed: boolean
  myPreference: string | null | undefined
  isMember: boolean
}): NoticeLine | null {
  if (!args.method) {
    return args.needsMethodChoice && args.isOrganizer ? { kind: 'casting', text: '配役の決め方を選んでください', link: { label: '選ぶ', target: 'casting-method' } } : null
  }
  if (args.method === 'self' && args.hasCharacters && !args.confirmed && args.isMember && !args.myPreference) {
    return { kind: 'casting', text: 'やりたいキャラクターを選んでください', link: { label: '選ぶ', target: 'casting-pick' } }
  }
  return null
}

/** 事前配役アンケートのお願いの灰色 1 行（配役方法=アンケート、または配役以外の質問に答えられるとき。#911。公演日を過ぎたら出さない #915） */
export function surveyLine(args: { canOpen: boolean; method: string | null | undefined; available: boolean; past: boolean; deadlineText: string | null }): NoticeLine | null {
  if (!args.canOpen) return null
  if (args.method !== 'survey' && !(args.available && !args.past)) return null
  return {
    kind: 'survey',
    text: `${args.method === 'survey' ? '配役のため、' : ''}事前配役アンケートの回答をお願いします${args.deadlineText ? `（${args.deadlineText}）` : ''}`,
    link: { label: '回答する', target: 'survey' },
  }
}
