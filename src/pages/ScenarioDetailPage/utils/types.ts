/**
 * ScenarioDetailPage - 型定義
 */

export interface ScenarioDetail {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  synopsis?: string
  description?: string
  caution?: string
  author: string
  genre: string[]
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  has_pre_reading: boolean
  official_site_url?: string
  participation_fee: number
  available_stores?: string[]  // 公演可能店舗IDリスト
  extra_preparation_time?: number  // 追加準備時間（分）
}

export interface EventSchedule {
  event_id: string
  date: string
  start_time: string
  end_time: string
  store_id: string
  store_name: string
  store_short_name: string
  store_color?: string
  store_address?: string
  scenario_title?: string
  max_participants: number
  current_participants: number
  available_seats: number
  reservation_deadline_hours: number
  is_available: boolean
}

export interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

// デフォルトの時間枠（4時間公演想定）
// 実際の終了時間はシナリオの公演時間から計算される
export const TIME_SLOTS: TimeSlot[] = [
  { label: '朝公演', startTime: '09:00', endTime: '13:00' },
  { label: '昼公演', startTime: '14:00', endTime: '18:00' },
  { label: '夜公演', startTime: '19:00', endTime: '23:00' },
]

