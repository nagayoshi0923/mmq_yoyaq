/**
 * 貸切グループのチャットのメッセージの読み方（GroupChat.tsx から規則を変えずに切り出した純粋な関数）。
 */
import { getJstParts } from '@/utils/jstDate'
import type { PrivateGroupMessage } from '@/types'

export interface SystemMessage {
  type: 'system'
  action: 'candidate_dates_added' | 'schedule_confirmed' | 'pre_reading_notice' | 'survey_notice' | 'group_created' | 'member_joined' | 'booking_requested' | 'booking_rejected' | 'booking_cancelled' | 'individual_notice' | 'performance_cancelled' | 'staff_message' | 'character_assignment' | 'character_method_selected'
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
  // 配役結果用
  assignments?: Record<string, string>
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
