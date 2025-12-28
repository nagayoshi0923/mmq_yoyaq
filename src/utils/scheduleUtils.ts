// スケジュール管理用のユーティリティ関数

import type { ScheduleEvent } from '@/types/schedule'

/**
 * 月間の日付リストを生成
 */
export function generateMonthDays(currentDate: Date) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = [] as Array<{ date: string; dayOfWeek: string; day: number; displayDate: string }>
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      date: dateString,
      dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
      day,
      displayDate: `${month + 1}/${day}`
    })
  }
  
  return days
}

/**
 * 開始時刻からタイムスロットを判定
 */
export function getTimeSlot(startTime: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(startTime.split(':')[0])
  if (hour < 12) return 'morning'      // 0-11時 → 朝
  if (hour <= 17) return 'afternoon'   // 12-17時 → 昼（17時を含む）
  return 'evening'                      // 18時以降 → 夜
}

/**
 * カテゴリごとの公演数を計算
 */
export function getCategoryCounts(events: ScheduleEvent[]) {
  const counts: Record<string, number> = {
    all: events.length,
    open: 0,
    private: 0,
    gmtest: 0,
    testplay: 0,
    trip: 0,
    venue_rental: 0,
    venue_rental_free: 0,
    package: 0,
    cancelled: 0,
    alerts: 0  // 警告が必要な公演
  }
  
  events.forEach(event => {
    if (event.is_cancelled) {
      counts.cancelled++
    }
    if (counts[event.category] !== undefined) {
      counts[event.category]++
    }
    
    // 警告条件：シナリオが未定、またはGMが未定・空
    const hasAlert = !event.scenario || event.scenario.trim() === '' || 
                     !event.gms || event.gms.length === 0 || 
                     event.gms.every((gm: string) => !gm || gm.trim() === '')
    
    if (hasAlert && !event.is_cancelled) {
      counts.alerts++
    }
  })
  
  return counts
}

/**
 * タイムスロットごとのデフォルト時刻
 */
export const TIME_SLOT_DEFAULTS = {
  morning: { start_time: '10:00', end_time: '14:00' },
  afternoon: { start_time: '14:30', end_time: '18:30' },
  evening: { start_time: '19:00', end_time: '23:00' }
} as const

/**
 * メモのキーを生成
 */
export function getMemoKey(date: string, venue: string): string {
  return `${date}-${venue}`
}

/**
 * 予約状況によるバッジクラスを取得
 */
export function getReservationBadgeClass(current: number, max: number): string {
  const ratio = current / max
  if (ratio >= 1) return 'bg-red-100' // 満席
  if (ratio >= 0.8) return 'bg-yellow-100' // ほぼ満席
  if (ratio >= 0.5) return 'bg-green-100' // 順調
  return 'bg-gray-100' // 空きあり
}

/**
 * 公演カテゴリの色設定
 */
export const CATEGORY_CONFIG = {
  open: { label: 'オープン公演', badgeColor: 'bg-blue-100 text-blue-800', cardColor: 'bg-blue-50 border-blue-200' },
  private: { label: '貸切公演', badgeColor: 'bg-purple-100 text-purple-800', cardColor: 'bg-purple-50 border-purple-200' },
  gmtest: { label: 'GMテスト', badgeColor: 'bg-orange-100 text-orange-800', cardColor: 'bg-orange-50 border-orange-200' },
  testplay: { label: 'テストプレイ', badgeColor: 'bg-yellow-100 text-yellow-800', cardColor: 'bg-yellow-50 border-yellow-200' },
  trip: { label: '出張公演', badgeColor: 'bg-green-100 text-green-800', cardColor: 'bg-green-50 border-green-200' },
  venue_rental: { label: '場所貸し', badgeColor: 'bg-cyan-100 text-cyan-800', cardColor: 'bg-cyan-50 border-cyan-200' },
  venue_rental_free: { label: '場所貸無料', badgeColor: 'bg-teal-100 text-teal-800', cardColor: 'bg-teal-50 border-teal-200' },
  package: { label: 'パッケージ会', badgeColor: 'bg-pink-100 text-pink-800', cardColor: 'bg-pink-50 border-pink-200' },
  mtg: { label: 'MTG', badgeColor: 'bg-cyan-100 text-cyan-800', cardColor: 'bg-cyan-50 border-cyan-200' },
  memo: { label: 'メモ', badgeColor: 'bg-gray-100 text-gray-800', cardColor: 'bg-gray-50 border-gray-200' }
} as const

