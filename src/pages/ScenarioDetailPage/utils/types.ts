/**
 * ScenarioDetailPage - 型定義
 */

export interface ScenarioDetail {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  synopsis?: string
  description?: string
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

export const TIME_SLOTS: TimeSlot[] = [
  { label: '朝', startTime: '10:00', endTime: '13:00' },
  { label: '昼', startTime: '14:00', endTime: '17:00' },
  { label: '夜', startTime: '18:00', endTime: '21:00' },
]

