import type { TextSettingField } from './OperatingTextSettings'
export const OPERATION_SETTING_KEYS = ['judgment_minutes_before', 'preparation_minutes']
export const SURVEY_SETTING_KEYS = ['survey_enabled', 'survey_deadline_days', 'survey_url']

export const PAYMENT_SETTING_FIELDS: TextSettingField[] = [
  { key: 'payment_method_label', label: '支払い方法の名称', fallback: '現地決済' },
  { key: 'payment_method_description', label: '支払い方法の案内', fallback: 'ご来店時にお支払いください', multiline: true },
]
