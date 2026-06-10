/**
 * GMAvailabilityCheck用のフォーマット関数群
 */
import { formatJstMonthDay, formatJstDateTime } from '@/utils/jstDate'

/**
 * 日付を「月/日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string): string => {
  return formatJstMonthDay(dateStr, true)
}

/**
 * 経過時間を「〜日前」「〜時間前」形式で表示
 */
export const getElapsedTime = (createdAt: string) => {
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
 * 日時を「YYYY/MM/DD HH:MM」形式にフォーマット
 */
export const formatDateTime = (dateString: string) => {
  return formatJstDateTime(dateString)
}

/**
 * 年月を「YYYY年MM月」形式にフォーマット
 */
export const formatMonthYear = (date: Date): string => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

