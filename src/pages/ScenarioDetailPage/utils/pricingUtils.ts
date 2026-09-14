import { isParticipationCostActive as isPricingActive } from '@/lib/pricing'
/**
 * ScenarioDetailPage - 料金計算ユーティリティ
 */

import { isJapaneseHoliday } from '@/utils/japaneseHolidays'

export interface ParticipationCost {
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
  const dateObj = new Date(date + 'T00:00:00Z')
  const dayOfWeek = dateObj.getUTCDay()
  
  // 土曜日(6) または 日曜日(0)
  if (dayOfWeek === 0 || dayOfWeek === 6) return true
  
  // 祝日
  if (isJapaneseHoliday(date)) return true
  
  // カスタム休日
  if (isCustomHoliday?.(date)) return true
  
  return false
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
  isCustomHoliday?: (date: string) => boolean,
  startTime?: string
): number {
  if (!participationCosts || participationCosts.length === 0) {
    return baseFee
  }
  
  // アクティブな料金設定のみをフィルタ
  const activeCosts = participationCosts.filter(cost => isPricingActive(cost))
  
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
  
  // 日付別料金がない場合は、従来の時間帯別料金を使用する。
  if (startTime) {
    const hour = Number(startTime.slice(0, 2))
    const slot = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
    const cost = activeCosts.find(c => c.time_slot === slot)
    if (cost) return cost.type === 'percentage' ? Math.round(baseFee * (1 + cost.amount / 100)) : cost.amount
  }

  // 通常の料金（normalまたは最初のアクティブな設定）
  const normalCost = activeCosts.find(cost => cost.time_slot === 'normal') ?? activeCosts.find(cost => cost.time_slot === '通常')
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

/** 貸切候補日ごとの見積もり。候補順は受付SQLと同じまま保持する。 */
export function calculatePrivateCandidateFees(
  baseFee: number,
  costs: ParticipationCost[] | undefined,
  candidates: Array<{ date: string; slot: { startTime: string } }>,
  isCustomHoliday?: (date: string) => boolean,
): number[] {
  return candidates.map(candidate => calculateParticipationFee(
    baseFee, costs, candidate.date, isCustomHoliday, candidate.slot.startTime,
  ))
}
