import { SETTING_SCOPES, type SettingScope, type SettingValue } from './settings-inheritance.ts'

export type SettingGroup = 'cancellation' | 'payment' | 'email' | 'operations'
export interface SettingDefinition {
  group: SettingGroup
  label: string
  kind: 'text' | 'boolean' | 'integer' | 'fees' | 'items' | 'judgmentRules' | 'reminders' | 'feeBasis'
  scopes: readonly SettingScope[]
  min?: number
  max?: number
}
const all = SETTING_SCOPES
const identity: readonly SettingScope[] = ['organization', 'store']
const text = (group: SettingGroup, label: string, scopes: readonly SettingScope[] = all): SettingDefinition => ({ group, label, kind: 'text', scopes })
const integer = (group: SettingGroup, label: string, min: number, max: number): SettingDefinition => ({ group, label, kind: 'integer', min, max, scopes: all })
const structure = (group: SettingGroup, label: string, kind: SettingDefinition['kind']): SettingDefinition => ({ group, label, kind, scopes: all })

/** 実行設定だけを公開する許可リスト。認証情報・外部送信先・組織の識別情報は含めない。 */
export const SETTING_DEFINITIONS: Record<string, SettingDefinition> = {
  cancellation_policy: text('cancellation', '通常公演のキャンセル案内'),
  cancellation_policy_items: structure('cancellation', '通常公演の注意事項', 'items'),
  cancellation_deadline_hours: integer('cancellation', '通常公演のキャンセル受付期限（時間前）', 0, 8760),
  cancellation_fees: structure('cancellation', '通常公演のキャンセル料率', 'fees'),
  cancellation_fee_basis: structure('cancellation', '通常公演の料金計算基準', 'feeBasis'),
  private_cancellation_policy: text('cancellation', '貸切公演のキャンセル案内'),
  private_cancellation_policy_items: structure('cancellation', '貸切公演の注意事項', 'items'),
  private_cancellation_deadline_hours: integer('cancellation', '貸切公演のキャンセル受付期限（時間前）', 0, 8760),
  private_cancellation_fees: structure('cancellation', '貸切公演のキャンセル料率', 'fees'),
  private_cancellation_fee_basis: structure('cancellation', '貸切公演の料金計算基準', 'feeBasis'),
  organizer_cancel_reasons: structure('cancellation', '主催者都合の中止理由', 'items'),
  organizer_cancel_refund_note: text('cancellation', '主催者都合の返金案内'),
  cancellation_judgment_rules: structure('cancellation', '開催判断についての案内', 'judgmentRules'),
  cancellation_notice_note: text('cancellation', '中止時の連絡についての案内'),
  reservation_change_deadline_hours: integer('cancellation', '通常公演の予約変更期限（時間前）', 0, 8760),
  reservation_change_note: text('cancellation', '通常公演の予約変更案内'),
  private_reservation_change_deadline_hours: integer('cancellation', '貸切公演の予約変更期限（時間前）', 0, 8760),
  private_reservation_change_note: text('cancellation', '貸切公演の予約変更案内'),
  refund_method_note: text('cancellation', '返金方法の案内'),
  payment_method_label: text('payment', '支払い方法の名称'),
  payment_method_description: text('payment', '支払い方法の案内'),
  company_name: text('email', 'メール署名の会社名', identity),
  company_phone: text('email', 'メール署名の電話番号', identity),
  company_email: text('email', 'メール署名のメールアドレス', identity),
  company_address: text('email', 'メール署名の住所', identity),
  reminder_enabled: structure('email', 'リマインドメール', 'boolean'),
  reminder_schedule: structure('email', 'リマインドの日程', 'reminders'),
  reservation_confirmation_template: text('email', '予約確認メール'),
  cancellation_template: text('email', 'キャンセル確認メール'),
  reminder_template: text('email', '通常公演のリマインドメール'),
  private_reminder_template: text('email', '貸切公演のリマインドメール'),
  booking_change_template: text('email', '予約変更メール'),
  private_request_template: text('email', '貸切申込メール'),
  private_confirm_template: text('email', '貸切確定メール'),
  private_rejection_template: text('email', '貸切見送りメール'),
  waitlist_notify_template: text('email', '空席通知メール'),
  waitlist_registration_template: text('email', 'キャンセル待ち受付メール'),
  performance_cancellation_template: text('email', '公演中止メール'),
  performance_confirmation_template: text('email', '開催確定メール'),
  event_cancellation_template: text('email', '公演キャンセルメール'),
  performance_extension_template: text('email', '追加募集メール'),
  store_cancellation_template: text('email', '店舗からのキャンセルメール'),
  private_rejection_reason: text('email', '貸切見送りの既定理由'),
  judgment_minutes_before: integer('operations', '開催の最終判断（分前）', 1, 10080),
  default_performance_duration: { ...integer('operations', '作品未選択時の公演時間（分）', 30, 1440), scopes: identity },
  preparation_minutes: integer('operations', '準備時間（分）', 0, 1440),
  coupon_usage_enabled: structure('operations', 'クーポンの利用を受け付ける', 'boolean'),
  survey_enabled: structure('operations', '事前配役アンケート', 'boolean'),
  survey_deadline_days: integer('operations', '事前配役アンケートの締切（日前）', 0, 90),
  survey_url: text('operations', '事前配役アンケートのURL'),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function shortText(value: unknown, max = 10000): value is string {
  return typeof value === 'string' && value.length <= max
}
function intBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** null は「共通に戻す」。数値文字列や真偽値文字列を暗黙変換しない。 */
export function isValidSettingValue(key: string, value: unknown, scope: SettingScope): value is SettingValue | null {
  if (!Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key)) return false
  const definition = SETTING_DEFINITIONS[key]
  if (!definition.scopes.includes(scope)) return false
  if (value === null) return true
  switch (definition.kind) {
    case 'text':
      if (!shortText(value, 100000)) return false
      if (key === 'survey_url' && value !== '') {
        try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
      }
      return true
    case 'boolean': return typeof value === 'boolean'
    case 'integer': return intBetween(value, definition.min!, definition.max!)
    case 'feeBasis': return value === 'participant_total' || value === 'performance_total'
    case 'fees': return Array.isArray(value) && value.length <= 50 && value.every(row =>
      isRecord(row) && intBetween(row.hours_before, -1, 8760)
      && typeof row.fee_percentage === 'number' && Number.isFinite(row.fee_percentage)
      && row.fee_percentage >= 0 && row.fee_percentage <= 100 && shortText(row.description))
    case 'items': return Array.isArray(value) && value.length <= 100 && value.every(row =>
      isRecord(row) && shortText(row.id, 200) && shortText(row.content))
    case 'judgmentRules': return Array.isArray(value) && value.length <= 100 && value.every(row =>
      isRecord(row) && shortText(row.id, 200) && shortText(row.timing) && shortText(row.condition) && shortText(row.result))
    case 'reminders': return Array.isArray(value) && value.length <= 30 && value.every(row =>
      isRecord(row) && intBetween(row.days_before, 0, 365) && typeof row.enabled === 'boolean'
      && typeof row.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)
      && (row.template === undefined || shortText(row.template, 100000)))
  }
}
