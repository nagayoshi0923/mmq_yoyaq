/**
 * メールテンプレート台帳（単一の真実源）
 *
 * 店舗ごとの `email_settings` テーブルにある各テンプレ列について、
 * 「キー（= email_settings の列名）/ 表示名 / いつ・誰起点で送られるか /
 * 使える差し込み変数 / カテゴリ / デフォルト文面」を一元管理する。
 *
 * 設定画面（EmailSettings.tsx）と、使う場所に置く共通編集ダイアログ
 * （TemplateEditDialog）の両方がここを参照する。テンプレを足す／減らす／
 * 説明を直す時は、このファイルだけを編集すれば両方に反映される。
 *
 * すべて店舗スコープ（email_settings は store_id 単位）。
 */

// ========== デフォルトテンプレート ==========

export function getDefaultReservationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

この度は${companyName}をご予約いただき、誠にありがとうございます。
以下の内容で予約を承りました。

━━━━━━━━━━━━━━━━━━━━━━
■ ご予約内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date} {time}開演
参加人数: {participants}名様
ご請求金額: ¥{total_price}

━━━━━━━━━━━━━━━━━━━━━━
■ 当日のご案内
━━━━━━━━━━━━━━━━━━━━━━

・開演15分前までに受付をお済ませください
・お飲み物は店内でご購入いただけます
・キャンセルは3日前までにご連絡ください

━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。
当日お会いできることを、スタッフ一同楽しみにしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

ご予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセル内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date}
キャンセル料: ¥{cancellation_fee}

━━━━━━━━━━━━━━━━━━━━━━

またのご利用を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultReminderTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '', daysBefore = 1) {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''
  const contactInfo = companyPhone ? `・当日連絡先: ${companyPhone}` : ''

  let dayMessage = ''
  if (daysBefore === 1) {
    dayMessage = '明日の公演についてリマインドいたします。'
  } else if (daysBefore === 2) {
    dayMessage = '明後日の公演についてリマインドいたします。'
  } else if (daysBefore === 7) {
    dayMessage = '1週間後の公演についてリマインドいたします。'
  } else {
    dayMessage = `${daysBefore}日後の公演についてリマインドいたします。`
  }

  return `{customer_name} 様

${dayMessage}

━━━━━━━━━━━━━━━━━━━━━━
■ ご予約内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ名: {scenario_title}
開催日時: {date} {time}開演
会場: {venue}

━━━━━━━━━━━━━━━━━━━━━━
■ 当日のお願い
━━━━━━━━━━━━━━━━━━━━━━

・開演15分前までにお越しください
・お時間に余裕を持ってご来店ください
${contactInfo}

━━━━━━━━━━━━━━━━━━━━━━

お気をつけてお越しください。
スタッフ一同、お待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultBookingChangeTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

ご予約内容に変更がございましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━━━
■ 予約番号
━━━━━━━━━━━━━━━━━━━━━━

{reservation_number}

━━━━━━━━━━━━━━━━━━━━━━
■ 変更内容
━━━━━━━━━━━━━━━━━━━━━━

{changes}

━━━━━━━━━━━━━━━━━━━━━━

この変更に心当たりがない場合は、お手数ですがすぐにご連絡ください。

ご不明な点がございましたら、お気軽にお問い合わせください。
当日のご来店を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultPrivateRequestTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

この度は、貸切予約のリクエストをお申し込みいただき、誠にありがとうございます。
リクエストを受け付けましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━━━
■ リクエスト内容
━━━━━━━━━━━━━━━━━━━━━━

予約番号: {reservation_number}
シナリオ: {scenario_title}
参加人数: {participants}名
希望店舗: {stores}
料金目安: ¥{estimated_price}

候補日時:
{candidate_dates}

━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━

1. このリクエストを確認し、店舗とGMの調整を行います
2. 調整が完了次第、承認メールをお送りします
3. 承認後、確定日時・店舗・料金をご連絡いたします

━━━━━━━━━━━━━━━━━━━━━━

担当者より折り返しご連絡させていただきます。
少々お時間をいただく場合がございますが、何卒よろしくお願いいたします。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultPrivateConfirmTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

貸切リクエストを承りました。
以下の日程で予約が確定いたしましたので、ご確認ください。

━━━━━━━━━━━━━━━━━━━━━━
■ 確定内容
━━━━━━━━━━━━━━━━━━━━━━

予約番号: {reservation_number}
シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
参加人数: {participants}名
お支払い金額: ¥{total_price}

━━━━━━━━━━━━━━━━━━━━━━
■ 重要事項
━━━━━━━━━━━━━━━━━━━━━━

・当日は開始時刻の15分前までにご来場ください
・お支払いは現地決済となります（現金・カード可）
・キャンセルは公演開始の48時間前まで無料です

━━━━━━━━━━━━━━━━━━━━━━

貸切予約を承り、誠にありがとうございます。
当日のご来店を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultPrivateRejectionTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

この度は、貸切予約のリクエストをいただき、誠にありがとうございます。

━━━━━━━━━━━━━━━━━━━━━━
■ リクエスト内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}

━━━━━━━━━━━━━━━━━━━━━━
■ ご連絡
━━━━━━━━━━━━━━━━━━━━━━

{rejection_reason}

━━━━━━━━━━━━━━━━━━━━━━
■ 今後のご検討について
━━━━━━━━━━━━━━━━━━━━━━

・別の日程でのご検討も可能です
・通常公演へのご参加も歓迎しております
・ご不明点等ございましたら、お気軽にお問い合わせください

━━━━━━━━━━━━━━━━━━━━━━

この度はご希望に沿えず、大変申し訳ございません。
引き続き、よろしくお願いいたします。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultWaitlistNotifyTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

キャンセル待ちにご登録いただいていた公演に空きが出ました！

━━━━━━━━━━━━━━━━━━━━━━
■ 空きが出た公演
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
ご希望人数: {participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ お早めにご予約ください
━━━━━━━━━━━━━━━━━━━━━━

先着順となっております。空席には限りがありますので、お早めにご予約ください。

▼ 今すぐ予約する
{booking_url}

━━━━━━━━━━━━━━━━━━━━━━

予約が完了しましたら、キャンセル待ちは自動的に解除されます。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultWaitlistRegistrationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

キャンセル待ちへのご登録ありがとうございます。

━━━━━━━━━━━━━━━━━━━━━━
■ 登録内容
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
ご希望人数: {participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━

空席が出た場合、メールでお知らせいたします。
先着順となりますので、通知を受け取りましたら
お早めにご予約手続きをお願いいたします。

━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultPerformanceCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

誠に申し訳ございませんが、ご予約いただいておりました公演は
人数未達のため中止となりました。

━━━━━━━━━━━━━━━━━━━━━━
■ 中止となった公演
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}

━━━━━━━━━━━━━━━━━━━━━━

ご迷惑をおかけして誠に申し訳ございません。
またのご予約をお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultEventCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

誠に申し訳ございませんが、以下の公演を中止させていただくこととなりました。

━━━━━━━━━━━━━━━━━━━━━━
■ 中止された公演
━━━━━━━━━━━━━━━━━━━━━━

予約番号: {reservation_number}
シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
参加人数: {participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ 中止理由
━━━━━━━━━━━━━━━━━━━━━━

{cancellation_reason}

━━━━━━━━━━━━━━━━━━━━━━

ご迷惑をおかけして大変申し訳ございません。
またのご利用を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultPerformanceExtensionTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

ご予約いただいている公演について、ご連絡いたします。

現在、定員に達していないため、募集を公演4時間前まで延長いたします。

━━━━━━━━━━━━━━━━━━━━━━
■ 公演情報
━━━━━━━━━━━━━━━━━━━━━━

シナリオ: {scenario_title}
日時: {date} {time}
会場: {venue}
現在の参加者: {current_participants}/{max_participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ 今後の流れ
━━━━━━━━━━━━━━━━━━━━━━

・公演4時間前までに定員に達した場合 → 公演開催
・定員に達しない場合 → 中止（改めてご連絡いたします）

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセルについて
━━━━━━━━━━━━━━━━━━━━━━

募集延長中の公演は、キャンセル料無料でキャンセルが可能です。
ご都合が悪くなった場合は、お気軽にご連絡ください。

━━━━━━━━━━━━━━━━━━━━━━

お知り合いでご興味のある方がいらっしゃいましたら、
ぜひお誘いいただけますと幸いです。

ご協力よろしくお願いいたします。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

export function getDefaultStoreCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''

  return `{customer_name} 様

誠に申し訳ございませんが、以下のご予約をキャンセルさせていただくこととなりました。

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセルされた予約
━━━━━━━━━━━━━━━━━━━━━━

予約番号: {reservation_number}
シナリオ: {scenario_title}
日時: {date} {time} - {end_time}
会場: {venue}
参加人数: {participants}名

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセル理由
━━━━━━━━━━━━━━━━━━━━━━

{cancellation_reason}

━━━━━━━━━━━━━━━━━━━━━━

この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。
またのご利用を心よりお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

// ========== 差し込み変数 ==========

// 変数の説明マップ
export const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  // 基本変数
  customer_name: 'お客様名',
  customer_email: 'お客様メールアドレス',
  reservation_number: '予約番号',
  scenario_title: 'シナリオ名',
  date: '日付（曜日付き）',
  time: '開始時刻',
  end_time: '終了時刻',
  venue: '会場・店舗名',
  venue_address: '店舗住所',
  participants: '参加人数',
  total_price: '合計金額',
  cancellation_fee: 'キャンセル料',
  cancellation_reason: 'キャンセル・中止理由',
  company_name: '会社名',
  company_phone: '電話番号',
  company_email: 'メールアドレス',
  // 追加変数
  booking_url: '予約ページURL',
  freed_seats: '空いた席数',
  current_participants: '現在の参加人数',
  max_participants: '最大参加人数',
  remaining_seats: '残り席数',
  extension_deadline: '延長期限',
  stores: '希望店舗一覧',
  estimated_price: '料金目安',
  candidate_dates: '候補日時一覧',
  rejection_reason: '却下理由',
  changes: '変更内容',
  old_date: '変更前の日時',
  new_date: '変更後の日時',
  old_participants: '変更前の人数',
  new_participants: '変更後の人数',
}

// 基本変数セット（全メールで共通して使用可能）
export const BASE_VARIABLES = [
  'customer_name',
  'customer_email',
  'reservation_number',
  'scenario_title',
  'date',
  'time',
  'end_time',
  'venue',
  'venue_address',
  'participants',
  'total_price',
  'cancellation_fee',
  'cancellation_reason',
  'company_name',
  'company_phone',
  'company_email',
]

// メールタイプ別の追加変数
export const ADDITIONAL_VARIABLES: Record<string, string[]> = {
  waitlist: ['booking_url', 'freed_seats'],
  performance: ['current_participants', 'max_participants'],
  extension: ['current_participants', 'max_participants', 'remaining_seats', 'extension_deadline'],
  private_request: ['stores', 'estimated_price', 'candidate_dates'],
  rejection: ['rejection_reason'],
  change: ['changes', 'old_date', 'new_date', 'old_participants', 'new_participants'],
}

// ========== テンプレート台帳 ==========

// テンプレキー = email_settings の列名
export const EMAIL_TEMPLATE_KEYS = [
  'reservation_confirmation_template',
  'cancellation_template',
  'reminder_template',
  'booking_change_template',
  'private_request_template',
  'private_confirm_template',
  'private_rejection_template',
  'waitlist_notify_template',
  'waitlist_registration_template',
  'performance_cancellation_template',
  'event_cancellation_template',
  'performance_extension_template',
  'store_cancellation_template',
] as const

export type EmailTemplateKey = typeof EMAIL_TEMPLATE_KEYS[number]

export interface TemplateConfig {
  key: EmailTemplateKey
  title: string
  description: string
  category: 'reservation' | 'private' | 'other'
  additionalVariables?: string[]  // 基本変数に追加で使える変数
  getDefault: (companyName: string, companyPhone: string, companyEmail: string) => string
}

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key: 'reservation_confirmation_template',
    title: '予約確認メール',
    description: '予約完了時に自動送信',
    category: 'reservation',
    getDefault: getDefaultReservationTemplate
  },
  {
    key: 'booking_change_template',
    title: '予約変更確認メール',
    description: '参加人数や日時の変更時に自動送信',
    category: 'reservation',
    additionalVariables: ADDITIONAL_VARIABLES.change,
    getDefault: getDefaultBookingChangeTemplate
  },
  {
    key: 'cancellation_template',
    title: 'キャンセル確認メール',
    description: '予約キャンセル時に自動送信',
    category: 'reservation',
    getDefault: getDefaultCancellationTemplate
  },
  {
    key: 'reminder_template',
    title: 'リマインドメール',
    description: '設定したタイミングで自動送信',
    category: 'reservation',
    getDefault: (cn, cp, ce) => getDefaultReminderTemplate(cn, cp, ce, 1)
  },
  {
    key: 'private_request_template',
    title: '貸切リクエスト受付メール',
    description: '貸切予約の申込み時に自動送信',
    category: 'private',
    additionalVariables: ADDITIONAL_VARIABLES.private_request,
    getDefault: getDefaultPrivateRequestTemplate
  },
  {
    key: 'private_confirm_template',
    title: '貸切予約確定メール',
    description: '貸切予約の承認時に自動送信',
    category: 'private',
    getDefault: getDefaultPrivateConfirmTemplate
  },
  {
    key: 'private_rejection_template',
    title: '貸切リクエスト却下メール',
    description: '貸切予約を受け付けられない場合に送信（グループチャットの却下メッセージにも同じ本文が使われます）',
    category: 'private',
    additionalVariables: ADDITIONAL_VARIABLES.rejection,
    getDefault: getDefaultPrivateRejectionTemplate
  },
  {
    key: 'waitlist_notify_template',
    title: 'キャンセル待ち通知メール',
    description: 'キャンセル発生時に空席をお知らせ',
    category: 'other',
    additionalVariables: ADDITIONAL_VARIABLES.waitlist,
    getDefault: getDefaultWaitlistNotifyTemplate
  },
  {
    key: 'waitlist_registration_template',
    title: 'キャンセル待ち登録完了メール',
    description: 'キャンセル待ち登録時に送信',
    category: 'other',
    getDefault: getDefaultWaitlistRegistrationTemplate
  },
  {
    key: 'performance_cancellation_template',
    title: '人数未達中止メール',
    description: '参加人数が集まらず公演中止になった際に送信（自動判定）',
    category: 'other',
    additionalVariables: ADDITIONAL_VARIABLES.performance,
    getDefault: getDefaultPerformanceCancellationTemplate
  },
  {
    key: 'event_cancellation_template',
    title: '公演中止メール',
    description: '管理者が手動で公演を中止した際に送信',
    category: 'other',
    getDefault: getDefaultEventCancellationTemplate
  },
  {
    key: 'performance_extension_template',
    title: '募集延長メール',
    description: '前日23:59時点で過半数達成・満席未達の場合に送信（4時間前まで延長）',
    category: 'other',
    additionalVariables: ADDITIONAL_VARIABLES.extension,
    getDefault: getDefaultPerformanceExtensionTemplate
  },
  {
    key: 'store_cancellation_template',
    title: 'キャンセル操作メール',
    description: '管理者が公演ダイアログから参加者の予約をキャンセルした際に送信',
    category: 'other',
    getDefault: getDefaultStoreCancellationTemplate
  }
]

const TEMPLATE_CONFIG_BY_KEY: Record<EmailTemplateKey, TemplateConfig> = TEMPLATE_CONFIGS.reduce(
  (acc, config) => {
    acc[config.key] = config
    return acc
  },
  {} as Record<EmailTemplateKey, TemplateConfig>
)

/** キーから台帳エントリを引く */
export function getTemplateConfig(key: EmailTemplateKey): TemplateConfig {
  return TEMPLATE_CONFIG_BY_KEY[key]
}

/** そのテンプレで使える差し込み変数（基本変数＋追加変数） */
export function getTemplateVariables(config: TemplateConfig): string[] {
  return [...BASE_VARIABLES, ...(config.additionalVariables ?? [])]
}

// ========== プレビュー ==========

// プレビュー用のサンプル値。テンプレ編集時に「実際に送られる全文」を確認するために使う。
export const TEMPLATE_PREVIEW_SAMPLE_VALUES: Record<string, string> = {
  customer_name: '山田 太郎',
  customer_email: 'taro@example.com',
  reservation_number: 'MMQ-20260620-001',
  scenario_title: '〇〇殺人事件',
  date: '2026年6月20日(土)',
  time: '13:00',
  end_time: '17:00',
  venue: '高田馬場店',
  venue_address: '東京都新宿区高田馬場0-0-0',
  participants: '6',
  total_price: '24,000',
  cancellation_fee: '0',
  cancellation_reason: 'ご都合によるキャンセル',
  company_name: '会社名',
  company_phone: '03-0000-0000',
  company_email: 'info@example.com',
  booking_url: 'https://example.com/booking/xxxx',
  freed_seats: '2',
  current_participants: '4',
  max_participants: '6',
  remaining_seats: '2',
  extension_deadline: '6月20日 9:00',
  stores: '高田馬場店 / 新宿店',
  estimated_price: '24,000',
  candidate_dates: '候補1: 2026年6月20日(土) 13:00 - 17:00\n候補2: 2026年6月21日(日) 13:00 - 17:00',
  rejection_reason: 'ご希望の日程では貸切での受付が難しい状況です。',
  changes: '参加人数: 4名 → 6名',
  old_date: '2026年6月20日(土) 13:00',
  new_date: '2026年6月21日(日) 13:00',
  old_participants: '4',
  new_participants: '6',
}

/**
 * テンプレ本文の差し込み変数を置換し、送られる全文のプレビューを作る。
 * overrides に実際の設定値（会社情報・却下既定理由など）を渡すとサンプル値より優先する。
 */
export function renderTemplateWithSamples(text: string, overrides?: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    const override = overrides?.[key]
    if (override !== undefined && override !== '') return override
    return TEMPLATE_PREVIEW_SAMPLE_VALUES[key] ?? match
  })
}

// ========== 変数の出どころ（どこで値が決まるか） ==========

export interface VariableSource {
  /** その変数の値がどこから入るかの説明 */
  note: string
  /** 設定で値（や選択肢）を変えられる場合の設定タブ。クリックでその画面を開く */
  settingsTab?: 'email' | 'cancellation'
}

// 設定画面で値・選択肢を変えられる変数だけ定義。未定義の変数は「データから自動」扱い。
const VARIABLE_SOURCES: Record<string, VariableSource> = {
  company_name: { note: 'メール設定の「会社情報」で設定します', settingsTab: 'email' },
  company_phone: { note: 'メール設定の「会社情報」で設定します', settingsTab: 'email' },
  company_email: { note: 'メール設定の「会社情報」で設定します', settingsTab: 'email' },
  cancellation_reason: { note: '中止/キャンセル操作時に入力します。定型理由はキャンセル設定で編集できます', settingsTab: 'cancellation' },
  rejection_reason: { note: 'メール設定の「貸切却下メールの既定理由」で編集します（却下時に本文へ差し込まれます）', settingsTab: 'email' },
}

/** 変数の出どころ情報を返す（未定義は「予約・公演データから自動」） */
export function getVariableSource(variable: string): VariableSource {
  return VARIABLE_SOURCES[variable] ?? { note: '予約・公演データから自動で入ります' }
}
