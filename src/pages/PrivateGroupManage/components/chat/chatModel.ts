/**
 * チャット（グループページ刷新 段階 2）の純粋な決まり: 既読の人数・リアクションの集計・返信の引用・写真の並べ方・ピン留め。
 */
import type { PrivateGroupMessage } from '@/types'
import type { ChatReactionRow } from '@/lib/privateGroupChat'
import { parseSystemMessage } from '../groupChatMessages'

/** すぐ押せるリアクション（長押しメニューの上段） */
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '🙏', '🎉'] as const

/** 「＋」と入力欄の絵文字ボタンで出す一覧 */
export const PICKER_EMOJIS = [
  '❤️', '👍', '😂', '🙏', '🎉', '😊', '😍', '🥰', '😆', '🤣', '😭', '😢', '😮', '😱', '🤔', '😎',
  '🥳', '😴', '🙌', '👏', '👌', '✌️', '💪', '🔥', '✨', '💯', '🎭', '🔍', '🕵️', '🗝️', '📅', '🍜',
  '🍣', '🍻', '☕', '🎂', '💀', '👀', '🙇', '🆗',
] as const

/** 写真を 1 回に送れる枚数 */
export const MAX_PHOTOS_PER_MESSAGE = 10

/** 返信の引用に出す本文の長さ */
export const QUOTE_LENGTH = 30

/** 参加者どうしの普通の発言か（システムのお知らせ・退出した人の発言・削除済みでない） */
export function isUserMessage(msg: PrivateGroupMessage): boolean {
  return Boolean(msg.member_id) && !msg.deleted_at && !parseSystemMessage(msg.message)
}

/** 自分の発言の「既読 N」: 自分以外で、その発言の時刻以降まで読んだ人の数 */
export function readCountFor(createdAt: string, readTimes: ReadonlyArray<string>): number {
  const t = new Date(createdAt).getTime()
  return readTimes.filter(r => new Date(r).getTime() >= t).length
}

/** 発言ごとのリアクション（最初に付いた順） */
export function groupReactions(rows: ReadonlyArray<ChatReactionRow>): Map<string, ChatReactionRow[]> {
  const map = new Map<string, ChatReactionRow[]>()
  for (const row of rows) {
    const list = map.get(row.message_id)
    if (list) list.push(row)
    else map.set(row.message_id, [row])
  }
  return map
}

/** 自分が押したあとの見た目を先に反映する（1 人 1 種類。同じものは外す・別のものは付け替え） */
export function applyMyReaction(rows: ReadonlyArray<ChatReactionRow>, messageId: string, emoji: string): ChatReactionRow[] {
  const mine = rows.find(r => r.message_id === messageId && r.mine)
  let next = rows.map(r => (r === mine ? { ...r, count: r.count - 1, mine: false } : r)).filter(r => r.count > 0)
  if (mine?.emoji === emoji) return next
  const existing = next.find(r => r.message_id === messageId && r.emoji === emoji)
  next = existing
    ? next.map(r => (r === existing ? { ...r, count: r.count + 1, mine: true } : r))
    : [...next, { message_id: messageId, emoji, count: 1, mine: true }]
  return next
}

/** 返信の引用（相手の名前と本文の先頭 30 文字。写真だけなら「写真」） */
export function quoteText(name: string, msg: Pick<PrivateGroupMessage, 'message' | 'photos' | 'deleted_at'> | undefined | null): string {
  if (!msg || msg.deleted_at) return '削除されたメッセージ'
  const body = msg.message.replace(/\s+/g, ' ').trim()
  const photoCount = msg.photos?.length ?? 0
  const text = body || (photoCount > 0 ? `写真 ${photoCount} 枚` : '')
  const cut = [...text]
  return `${name}: ${cut.length > QUOTE_LENGTH ? `${cut.slice(0, QUOTE_LENGTH).join('')}…` : text}`
}

/** 写真の並べ方: 1 枚は大きく、2 枚は横並び、3 枚以上は 2 列の格子 */
export function photoLayout(count: number): 'one' | 'two' | 'grid' {
  if (count <= 1) return 'one'
  if (count === 2) return 'two'
  return 'grid'
}

/** ピン留めされた発言（新しい順） */
export function pinnedMessages(messages: ReadonlyArray<PrivateGroupMessage>): PrivateGroupMessage[] {
  return messages
    .filter(m => m.pinned_at && !m.deleted_at)
    .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime())
}

/** 写真の URL の置き場所の鍵 */
export const photoKey = (messageId: string, position: number) => `${messageId}:${position}`

/** 長辺 max に収まる大きさ（大きくはしない） */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 入力中の人の表示（3 人以上はまとめる） */
export function typingText(names: ReadonlyArray<string>): string | null {
  if (names.length === 0) return null
  if (names.length <= 2) return `${names.map(n => `${n}さん`).join('、')}が入力中…`
  return `${names.length}人が入力中…`
}
