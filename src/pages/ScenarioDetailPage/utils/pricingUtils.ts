/**
 * ScenarioDetailPage - 料金計算ユーティリティ
 */

import { isJapaneseHoliday } from '@/utils/japaneseHolidays'

interface ParticipationCost {
  time_slot: string
  amount: number
  type: 'percentage' | 'fixed'
  status?: 'active' | 'legacy' | 'unused' | 'ready'
  startDate?: string
  endDate?: string
}

/**
 * 日付が土日祝かどうかを判定
 * @param date - 日付文字列（YYYY-MM-DD形式）
 * @param isCustomHoliday - カスタム休日判定関数（オプション）
 */
export function isWeekendOrHoliday(date: string, isCustomHoliday?: (date: string) => boolean): boolean {
  const dateObj = new Date(date + 'T00:00:00+09:00')
  const dayOfWeek = dateObj.getDay()
  
  // 土曜日(6) または 日曜日(0)
  if (dayOfWeek === 0 || dayOfWeek === 6) return true
  
  // 祝日
  if (isJapaneseHoliday(date)) return true
  
  // カスタム休日
  if (isCustomHoliday?.(date)) return true
  
  return false
}

/**
 * 料金設定が有効な期間内かどうかを判定
 */
function isPricingActive(cost: ParticipationCost): boolean {
  // statusがlegacyまたはunusedの場合は無効
  if (cost.status === 'legacy' || cost.status === 'unused') return false
  
  // 期間設定がない場合は常に有効
  if (!cost.startDate && !cost.endDate) return true
  
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  
  // 開始日が設定されていて、まだ開始していない場合
  if (cost.startDate && today < cost.startDate) return false
  
  // 終了日が設定されていて、すでに終了している場合
  if (cost.endDate && today > cost.endDate) return false
  
  return true
}

/**
 * 選択された日付に応じた参加費を計算
 * @param baseFee - 基本参加費
 * @param participationCosts - 料金設定配列
 * @param eventDate - イベント日付（YYYY-MM-DD形式）
 * @param isCustomHoliday - カスタム休日判定関数（オプション）
 */
export function calculateParticipationFee(
  baseFee: number,
  participationCosts: ParticipationCost[] | undefined,
  eventDate?: string,
  isCustomHoliday?: (date: string) => boolean
): number {
  if (!participationCosts || participationCosts.length === 0) {
    return baseFee
  }
  
  // アクティブな料金設定のみをフィルタ
  const activeCosts = participationCosts.filter(isPricingActive)
  
  if (activeCosts.length === 0) {
    return baseFee
  }
  
  // 土日祝の場合、weekendの料金設定を優先
  if (eventDate && isWeekendOrHoliday(eventDate, isCustomHoliday)) {
    const weekendCost = activeCosts.find(cost => cost.time_slot === 'weekend')
    if (weekendCost) {
      if (weekendCost.type === 'percentage') {
        return Math.round(baseFee * (1 + weekendCost.amount / 100))
      }
      return weekendCost.amount
    }
    
    // weekendがない場合、holidayの設定を確認（祝日の場合のみ）
    if (isJapaneseHoliday(eventDate) || isCustomHoliday?.(eventDate)) {
      const holidayCost = activeCosts.find(cost => cost.time_slot === 'holiday')
      if (holidayCost) {
        if (holidayCost.type === 'percentage') {
          return Math.round(baseFee * (1 + holidayCost.amount / 100))
        }
        return holidayCost.amount
      }
    }
  }
  
  // 通常の料金（normalまたは最初のアクティブな設定）
  const normalCost = activeCosts.find(cost => cost.time_slot === 'normal')
  if (normalCost) {
    if (normalCost.type === 'percentage') {
      return Math.round(baseFee * (1 + normalCost.amount / 100))
    }
    return normalCost.amount
  }
  
  return baseFee
}

/**
 * 料金表示用のラベルを取得
 * @param eventDate - イベント日付（YYYY-MM-DD形式）
 * @param isCustomHoliday - カスタム休日判定関数（オプション）
 */
export function getPricingLabel(
  eventDate?: string,
  isCustomHoliday?: (date: string) => boolean
): string {
  if (!eventDate) return '参加費（1名）'
  
  if (isWeekendOrHoliday(eventDate, isCustomHoliday)) {
    return '参加費（1名・土日祝料金）'
  }
  
  return '参加費（1名）'
}
