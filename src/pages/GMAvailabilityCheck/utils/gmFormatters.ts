/**
 * GMAvailabilityCheck用のフォーマット関数群
 */

/**
 * 日付を「月/日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
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
 * 日時を「YYYY/MM/DD HH:MM」形式にフォーマット
 */
export const formatDateTime = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

