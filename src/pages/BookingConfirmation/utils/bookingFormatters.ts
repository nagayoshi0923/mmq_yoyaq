/**
 * BookingConfirmation用のフォーマット関数群
 */
import { formatJstDateJa } from '@/utils/jstDate'

/**
 * 日付を「YYYY年M月D日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string): string => {
  return formatJstDateJa(dateStr, true)
}

/**
 * 時刻を「HH:MM」形式にフォーマット
 */
export const formatTime = (timeStr: string): string => {
  return timeStr.slice(0, 5)
}

/**
 * 金額をカンマ区切りにフォーマット
 */
export const formatPrice = (price: number): string => {
  return price.toLocaleString('ja-JP')
}

