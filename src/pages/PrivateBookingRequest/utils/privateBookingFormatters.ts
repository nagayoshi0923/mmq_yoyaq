/**
 * PrivateBookingRequest用のフォーマット関数群
 */

/**
 * 日付を「YYYY年M月D日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) {
    return '日付不明'
  }
  
  const date = new Date(dateStr)
  
  // 無効な日付の場合
  if (isNaN(date.getTime())) {
    console.error('Invalid date string:', dateStr)
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
 * 時刻を「HH:MM」形式にフォーマット
 */
export const formatTime = (timeStr: string): string => {
  return timeStr.slice(0, 5)
}

