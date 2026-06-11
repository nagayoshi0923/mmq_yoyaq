/**
 * 旧 types/index.ts 由来の ScheduleEvent（簡易版）
 *
 * ⚠️ 注意: src/types/schedule.ts にも同名で別定義の ScheduleEvent が存在する。
 *   - `@/types` から import される ScheduleEvent → この簡易版（従来どおり）
 *   - `@/types/schedule` から import される ScheduleEvent → 詳細版（従来どおり）
 * 歴史的に二重定義になっており、統合は Phase 4（スケジュール系フックの分割）で扱う。
 */

export interface ScheduleEvent {
  id: string
  organization_id?: string  // マルチテナント対応（移行期間中はオプショナル）
  store_id?: string  // 店舗ID（メール設定取得などに使用）
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  time_slot?: string | null  // 時間帯（morning/afternoon/evening）
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' | 'mtg'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  created_at: string
  updated_at: string
}

// ユーザー関連の型定義
