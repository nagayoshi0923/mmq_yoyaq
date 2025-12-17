import type { Scenario } from '@/types'

/**
 * ステータスの表示ラベルを取得
 */
export function getStatusLabel(status: string): string {
  const statusLabels: Record<string, string> = {
    available: '利用可能',
    unavailable: '利用不可',
    retired: '廃盤',
    preparing: '準備中'
  }
  return statusLabels[status] || status
}

/**
 * ステータスのバッジバリアントを取得
 */
export function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    available: 'default',
    unavailable: 'secondary',
    retired: 'destructive',
    preparing: 'outline'
  }
  return variantMap[status] || 'outline'
}

/**
 * 所要時間を時間表記にフォーマット
 */
export function formatDuration(durationMinutes: number): string {
  const hours = durationMinutes / 60
  return hours % 1 === 0 ? `${Math.floor(hours)}時間` : `${hours.toFixed(1)}時間`
}

/**
 * 人数範囲をフォーマット
 */
export function formatPlayerCount(min: number, max?: number): string {
  if (max && max !== min) {
    return `${min}-${max}名`
  }
  return `${min}名`
}

/**
 * ライセンス料の表示テキストを生成
 */
export function formatLicenseFee(normalLicense: number, gmTestLicense: number): string {
  if (gmTestLicense > 0) {
    return `通常: ${normalLicense.toLocaleString()}円 / GM卓: ${gmTestLicense.toLocaleString()}円`
  }
  return `${normalLicense.toLocaleString()}円`
}

/**
 * 参加費の表示テキストを生成
 */
export function formatParticipationFee(fee: number): string {
  return `${fee.toLocaleString()}円`
}

/**
 * GM報酬の表示テキストを生成
 */
export function formatGMReward(scenario: Scenario): string {
  const mainGMCost = scenario.gm_costs?.find(cost => cost.role === 'main')
  if (mainGMCost) {
    return `メインGM: ${mainGMCost.reward.toLocaleString()}円`
  }
  return '未設定'
}

/**
 * ジャンルリストをカンマ区切りの文字列にフォーマット
 */
export function formatGenres(genres: string[]): string {
  if (!genres || genres.length === 0) {
    return '未設定'
  }
  return genres.join(', ')
}

/**
 * 難易度を星の数に変換
 */
export function getDifficultyStars(difficulty?: number): number {
  return difficulty || 3
}

/**
 * GM担当者リストの表示用配列を取得（最大6名まで）
 */
export function getDisplayGMs(gms: string[]): { displayed: string[]; remaining: number } {
  const maxDisplay = 3
  if (gms.length <= maxDisplay) {
    return { displayed: gms, remaining: 0 }
  }
  return { 
    displayed: gms.slice(0, maxDisplay), 
    remaining: gms.length - maxDisplay 
  }
}

