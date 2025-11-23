/**
 * 貸切予約管理 - フォーマット関数
 */

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
 * 年月をフォーマット
 */
export const formatMonthYear = (date: Date): string => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
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

