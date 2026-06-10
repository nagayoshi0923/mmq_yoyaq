/**
 * PrivateBookingRequest用のフォーマット関数群
 */

/**
 * 日付を「YYYY年M月D日(曜)」形式にフォーマット
 */
export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) {
    return '日付未定'
  }
  
  // 時間帯文字列の場合はスキップ（morning/afternoon/evening）
  if (['morning', 'afternoon', 'evening'].includes(dateStr)) {
    return '日付未定'
  }
  
  // 日本時間(JST)固定で扱う。
  // new Date(...) + getDate() はブラウザのローカルTZ依存のため、非JST環境の顧客が
  // 「2026-11-30」を選んでも枠ラベルが「11/29」と1日前に見え、申込日を誤認していた。
  const s = String(dateStr).trim()
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? `${s}T00:00:00+09:00`
    : /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
      ? s
      : `${s}+09:00`
  const date = new Date(iso)

  // 無効な日付の場合
  if (isNaN(date.getTime())) {
    return '日付未定'
  }

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? ''

  return `${g('year')}年${g('month')}月${g('day')}日(${g('weekday')})`
}

/**
 * 時刻を「HH:MM」形式にフォーマット
 */
export const formatTime = (timeStr: string): string => {
  return timeStr.slice(0, 5)
}

