import type { TextSettingField } from './OperatingTextSettings'
export const OPERATION_SETTING_KEYS = ['judgment_minutes_before', 'preparation_minutes', 'coupon_usage_enabled']
export const SURVEY_SETTING_KEYS = ['survey_enabled', 'survey_deadline_days', 'survey_url']
/** 貸切を受け付ける範囲（MMQ の既定 180 → 組織 → 作品 → 公演。店舗では指定しない） */
export const PRIVATE_BOOKING_HORIZON_SETTING_KEYS = ['private_booking_horizon_days']

export const PAYMENT_SETTING_FIELDS: TextSettingField[] = [
  { key: 'payment_method_label', label: '支払い方法の名称', fallback: '現地決済' },
  { key: 'payment_method_description', label: '支払い方法の案内', fallback: 'ご来店時にお支払いください', multiline: true },
]
