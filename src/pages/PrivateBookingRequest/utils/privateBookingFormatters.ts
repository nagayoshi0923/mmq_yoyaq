/**
 * PrivateBookingRequest用のフォーマット関数群
 */

/**
 * 日付を「YYYY年M月D日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
}

/**
 * 時刻を「HH:MM」形式にフォーマット
 */
export const formatTime = (timeStr: string): string => {
  return timeStr.slice(0, 5)
}

