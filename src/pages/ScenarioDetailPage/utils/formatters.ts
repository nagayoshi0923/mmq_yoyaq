/**
 * ScenarioDetailPage - フォーマッター関数
 */

/**
 * 時刻文字列をフォーマット（HH:MM → HH:MM形式）
 */
export function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':')
  return `${hours}:${minutes}`
}

/**
 * 難易度を星の数に変換
 */
export function getDifficultyStars(difficulty: number): number {
  return difficulty || 3
}

/**
 * 参加費を円表記にフォーマット
 */
export function formatParticipationFee(fee: number): string {
  return `¥${fee.toLocaleString()}`
}

/**
 * プレイ時間をフォーマット（デフォルトは分表記）
 */
export function formatDuration(durationMinutes: number, format: 'hours' | 'minutes' = 'minutes'): string {
  if (format === 'minutes') {
    return `${durationMinutes}分`
  }
  const hours = durationMinutes / 60
  return hours % 1 === 0 ? `${Math.floor(hours)}時間` : `${hours.toFixed(1)}時間`
}

/**
 * 人数範囲をフォーマット
 */
export function formatPlayerCount(min: number, max: number): string {
  if (min === max) {
    return `${min}名`
  }
  return `${min}〜${max}名`
}

