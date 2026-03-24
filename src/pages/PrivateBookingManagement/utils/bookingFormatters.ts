/**
 * 貸切予約管理 - フォーマット関数
 */
import { logger } from '@/utils/logger'

/**
 * 申込からの経過時間を取得
 */
export const getElapsedTime = (createdAt: string): string => {
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays > 0) {
    return `${diffDays}日前`
  } else if (diffHours > 0) {
    return `${diffHours}時間前`
  } else if (diffMins > 0) {
    return `${diffMins}分前`
  } else {
    return '今'
  }
}

/**
 * 申込からの経過日数を取得
 */
export const getElapsedDays = (createdAt: string): number => {
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * 日時をフォーマット
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 日付をフォーマット（曜日付き）
 */
export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) {
    return '日付不明'
  }
  
  const date = new Date(dateStr)
  
  // 無効な日付の場合
  if (isNaN(date.getTime())) {
    logger.error('Invalid date string:', dateStr)
    return '日付エラー'
  }
  
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]
  
  return `${year}年${month}月${day}日(${weekday})`
}

/**
 * 年月をフォーマット
 */
export const formatMonthYear = (date: Date): string => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

/**
 * GM回答がサーバーに記録された日時（ISO文字列）を推定する。
 * Discord は response_datetime / responded_at の両方を更新する想定。
 */
export function pickGmReplyIsoString(gm: {
  response_datetime?: string | null
  responded_at?: string | null
  updated_at?: string | null
  created_at?: string | null
}): string | null {
  const v = gm.response_datetime || gm.responded_at || gm.updated_at || gm.created_at
  if (v == null || v === '') return null
  return typeof v === 'string' ? v : null
}

/** 回答が届いた日時の表示（JST） */
export function formatGmReplyReceivedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
}

type GmReplySortable = {
  response_datetime?: string | null
  responded_at?: string | null
  updated_at?: string | null
  created_at?: string | null
  gm_name?: string | null
}

/** 回答日時が早い順（同一時刻は GM 名で安定ソート）。日時が無い行は末尾 */
export function sortGmResponsesByReplyTime<T extends GmReplySortable>(responses: T[]): T[] {
  return [...responses].sort((a, b) => {
    const aIso = pickGmReplyIsoString(a)
    const bIso = pickGmReplyIsoString(b)
    const ta = aIso ? new Date(aIso).getTime() : Number.MAX_SAFE_INTEGER
    const tb = bIso ? new Date(bIso).getTime() : Number.MAX_SAFE_INTEGER
    if (ta !== tb) return ta - tb
    return (a.gm_name || '').localeCompare(b.gm_name || '', 'ja')
  })
}

/**
 * ステータスに応じたカードクラス名を取得
 */
export const getCardClassName = (status: string): string => {
  switch (status) {
    case 'pending':
    case 'pending_gm':
      return 'border-purple-200 bg-purple-50/30'
    case 'gm_confirmed':
    case 'pending_store':
      return 'border-purple-200 bg-purple-50/30'
    case 'confirmed':
      return 'border-green-200 bg-green-50/30'
    case 'cancelled':
      return 'border-red-200 bg-red-50/30'
    default:
      return ''
  }
}

/**
 * 貸切グループ経由の予約: 予約上の参加予定人数と、招待リンク経由で joined になっている人数を併記
 */
export function formatPrivateBookingParticipantLabel(
  plannedCount: number,
  joinedMemberCount?: number
): string {
  if (joinedMemberCount === undefined) {
    return `${plannedCount}名`
  }
  return `参加予定 ${plannedCount}名（アプリ登録 ${joinedMemberCount}名）`
}

/** シナリオマスタの人数レンジ表示 */
export function formatScenarioPlayerRange(range: { min: number; max: number }): string {
  if (range.min === range.max) {
    return `${range.min}名`
  }
  return `${range.min}〜${range.max}名`
}

/** 予約の参加予定人数がシナリオの人数帯に入らないか */
export function isPlannedCountOutsideScenarioRange(
  plannedCount: number,
  range: { min: number; max: number } | null | undefined
): boolean {
  if (!range) return false
  return plannedCount < range.min || plannedCount > range.max
}

