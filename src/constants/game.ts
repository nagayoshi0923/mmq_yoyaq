// ゲーム設定の定数

/**
 * デフォルトの最大参加人数
 */
export const DEFAULT_MAX_PARTICIPANTS = 8

/**
 * タイムスロットの定義
 */
export const TIME_SLOTS = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
} as const

export type TimeSlot = typeof TIME_SLOTS[keyof typeof TIME_SLOTS]

/**
 * 公演カテゴリ
 */
export const EVENT_CATEGORIES = {
  OPEN: 'open',
  PRIVATE: 'private',
  GM_TEST: 'gmtest',
  TEST_PLAY: 'testplay',
  OFFSITE: 'offsite',
  VENUE_RENTAL: 'venue_rental',
  VENUE_RENTAL_FREE: 'venue_rental_free',
  PACKAGE: 'package',
} as const

export type EventCategory = typeof EVENT_CATEGORIES[keyof typeof EVENT_CATEGORIES]

/**
 * 公演ステータス
 */
export const EVENT_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const

export type EventStatus = typeof EVENT_STATUS[keyof typeof EVENT_STATUS]

/**
 * スタッフステータス
 */
export const STAFF_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  INACTIVE: 'inactive',
} as const

export type StaffStatus = typeof STAFF_STATUS[keyof typeof STAFF_STATUS]

/**
 * ユーザーロール
 */
export const USER_ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
} as const

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES]

