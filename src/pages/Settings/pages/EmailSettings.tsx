import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Save, ChevronDown, ChevronRight, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// ========== デフォルトテンプレート ==========

function getDefaultReservationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultReminderTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '', daysBefore = 1) {
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

function getDefaultBookingChangeTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultPrivateRequestTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultPrivateConfirmTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultPrivateCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
  const phoneLine = companyPhone ? `TEL: ${companyPhone}` : ''
  const emailLine = companyEmail ? `Email: ${companyEmail}` : ''
  
  return `{customer_name} 様

貸切予約のキャンセルを承りました。

━━━━━━━━━━━━━━━━━━━━━━
■ キャンセル内容
━━━━━━━━━━━━━━━━━━━━━━

予約番号: {reservation_number}
シナリオ: {scenario_title}
開催日時: {date} {time}
会場: {venue}
参加人数: {participants}名
キャンセル料: ¥{cancellation_fee}

━━━━━━━━━━━━━━━━━━━━━━

またのご利用を心よりお待ちしております。
貸切予約のご検討も引き続きお待ちしております。

─────────────────────────
${companyName}
${phoneLine}
${emailLine}
─────────────────────────`
}

function getDefaultPrivateRejectionTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultWaitlistNotifyTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultWaitlistRegistrationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultPerformanceCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultEventCancellationTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

function getDefaultPerformanceExtensionTemplate(companyName = 'クイーンズワルツ', companyPhone = '', companyEmail = '') {
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

// ========== 型定義 ==========

interface EmailTemplates {
  reservation_confirmation_template: string
  cancellation_template: string
  reminder_template: string
  booking_change_template: string
  private_request_template: string
  private_confirm_template: string
  private_cancellation_template: string
  private_rejection_template: string
  waitlist_notify_template: string
  waitlist_registration_template: string
  performance_cancellation_template: string
  event_cancellation_template: string
  performance_extension_template: string
}

interface EmailSettings extends EmailTemplates {
  id: string
  store_id: string
  from_email: string
  from_name: string
  company_name: string
  company_phone: string
  company_email: string
  company_address: string
  reminder_enabled: boolean
  reminder_schedule: Array<{
    days_before: number
    time: string
    enabled: boolean
    template?: string
  }>
  reminder_time: string
  reminder_send_time: 'morning' | 'afternoon' | 'evening'
}

interface EmailSettingsProps {
  storeId?: string
}

// 基本変数セット（全メールで共通して使用可能）
const BASE_VARIABLES = [
  'customer_name',      // お客様名
  'customer_email',     // お客様メールアドレス
  'reservation_number', // 予約番号
  'scenario_title',     // シナリオ名
  'date',               // 日付（曜日付き）
  'time',               // 開始時刻
  'end_time',           // 終了時刻
  'venue',              // 会場・店舗名
  'participants',       // 参加人数
  'total_price',        // 合計金額
  'cancellation_fee',   // キャンセル料
  'cancellation_reason',// キャンセル・中止理由
  'company_name',       // 会社名
  'company_phone',      // 電話番号
  'company_email',      // メールアドレス
]

// メールタイプ別の追加変数
const ADDITIONAL_VARIABLES: Record<string, string[]> = {
  waitlist: ['booking_url', 'freed_seats'],
  performance: ['current_participants', 'max_participants'],
  extension: ['current_participants', 'max_participants', 'remaining_seats', 'extension_deadline'],
  private_request: ['stores', 'estimated_price', 'candidate_dates'],
  rejection: ['rejection_reason'],
  change: ['changes', 'old_date', 'new_date', 'old_participants', 'new_participants'],
}

// テンプレート定義
interface TemplateConfig {
  key: keyof EmailTemplates
  title: string
  description: string
  category: 'reservation' | 'private' | 'other'
  additionalVariables?: string[]  // 基本変数に追加で使える変数
  getDefault: (companyName: string, companyPhone: string, companyEmail: string) => string
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
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
    key: 'private_cancellation_template',
    title: '貸切キャンセル確認メール',
    description: '貸切予約のキャンセル時に自動送信',
    category: 'private',
    getDefault: getDefaultPrivateCancellationTemplate
  },
  {
    key: 'private_rejection_template',
    title: '貸切リクエスト却下メール',
    description: '貸切予約を受け付けられない場合に送信',
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
  }
]

// ========== アコーディオンアイテム ==========

interface AccordionItemProps {
  config: TemplateConfig
  value: string
  onChange: (value: string) => void
  onReset: () => void
  isOpen: boolean
  onToggle: () => void
}

function AccordionItem({ config, value, onChange, onReset, isOpen, onToggle }: AccordionItemProps) {
  const categoryColors = {
    reservation: 'bg-green-500',
    private: 'bg-blue-500',
    other: 'bg-yellow-500'
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 ${categoryColors[config.category]} rounded-full`}></span>
          <div>
            <div className="font-medium text-sm">{config.title}</div>
            <div className="text-xs text-muted-foreground">{config.description}</div>
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      
      {isOpen && (
        <div className="p-4 border-t border-gray-200 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">基本変数（全メール共通）:</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
                className="text-xs"
              >
                デフォルトに戻す
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {BASE_VARIABLES.map(v => `{${v}}`).join(', ')}
            </p>
            {config.additionalVariables && config.additionalVariables.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground mt-2">追加変数（このメール専用）:</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  {config.additionalVariables.map(v => `{${v}}`).join(', ')}
                </p>
              </>
            )}
          </div>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="メールテンプレートを編集"
          />
        </div>
      )}
    </div>
  )
}

// ========== メインコンポーネント ==========

export function EmailSettings({ storeId }: EmailSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<EmailSettings>({
    id: '',
    store_id: '',
    from_email: '',
    from_name: '',
    company_name: '',
    company_phone: '',
    company_email: '',
    company_address: '',
    reservation_confirmation_template: '',
    cancellation_template: '',
    reminder_template: '',
    booking_change_template: '',
    private_request_template: '',
    private_confirm_template: '',
    private_cancellation_template: '',
    private_rejection_template: '',
    waitlist_notify_template: '',
    waitlist_registration_template: '',
    performance_cancellation_template: '',
    event_cancellation_template: '',
    performance_extension_template: '',
    reminder_enabled: true,
    reminder_schedule: [
      { days_before: 7, time: '10:00', enabled: true },
      { days_before: 1, time: '10:00', enabled: true }
    ],
    reminder_time: '10:00',
    reminder_send_time: 'morning'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  const toggleAccordion = useCallback((key: string) => {
    setOpenAccordions(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const storesData = await storeApi.getAll()

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        // 会社情報（デフォルト値の生成に使用）
        const companyName = data.company_name || ''
        const companyPhone = data.company_phone || ''
        const companyEmail = data.company_email || ''
        
        setFormData({
          ...data,
          reminder_schedule: data.reminder_schedule || [],
          // 空のテンプレートはデフォルト値を設定
          reservation_confirmation_template: data.reservation_confirmation_template || getDefaultReservationTemplate(companyName, companyPhone, companyEmail),
          cancellation_template: data.cancellation_template || getDefaultCancellationTemplate(companyName, companyPhone, companyEmail),
          reminder_template: data.reminder_template || getDefaultReminderTemplate(companyName, companyPhone, companyEmail),
          booking_change_template: data.booking_change_template || getDefaultBookingChangeTemplate(companyName, companyPhone, companyEmail),
          private_request_template: data.private_request_template || getDefaultPrivateRequestTemplate(companyName, companyPhone, companyEmail),
          private_confirm_template: data.private_confirm_template || getDefaultPrivateConfirmTemplate(companyName, companyPhone, companyEmail),
          private_cancellation_template: data.private_cancellation_template || getDefaultPrivateCancellationTemplate(companyName, companyPhone, companyEmail),
          private_rejection_template: data.private_rejection_template || getDefaultPrivateRejectionTemplate(companyName, companyPhone, companyEmail),
          waitlist_notify_template: data.waitlist_notify_template || getDefaultWaitlistNotifyTemplate(companyName, companyPhone, companyEmail),
          waitlist_registration_template: data.waitlist_registration_template || getDefaultWaitlistRegistrationTemplate(companyName, companyPhone, companyEmail),
          performance_cancellation_template: data.performance_cancellation_template || getDefaultPerformanceCancellationTemplate(companyName, companyPhone, companyEmail),
          event_cancellation_template: data.event_cancellation_template || getDefaultEventCancellationTemplate(companyName, companyPhone, companyEmail),
          performance_extension_template: data.performance_extension_template || getDefaultPerformanceExtensionTemplate(companyName, companyPhone, companyEmail)
        } as EmailSettings)
      } else {
        // 新規作成時はデフォルト値を設定
        const defaults = {
          id: '',
          store_id: storeId,
          from_email: '',
          from_name: '',
          company_name: '',
          company_phone: '',
          company_email: '',
          company_address: '',
          reservation_confirmation_template: getDefaultReservationTemplate(),
          cancellation_template: getDefaultCancellationTemplate(),
          reminder_template: getDefaultReminderTemplate(),
          booking_change_template: getDefaultBookingChangeTemplate(),
          private_request_template: getDefaultPrivateRequestTemplate(),
          private_confirm_template: getDefaultPrivateConfirmTemplate(),
          private_cancellation_template: getDefaultPrivateCancellationTemplate(),
          private_rejection_template: getDefaultPrivateRejectionTemplate(),
          waitlist_notify_template: getDefaultWaitlistNotifyTemplate(),
          waitlist_registration_template: getDefaultWaitlistRegistrationTemplate(),
          performance_cancellation_template: getDefaultPerformanceCancellationTemplate(),
          event_cancellation_template: getDefaultEventCancellationTemplate(),
          performance_extension_template: getDefaultPerformanceExtensionTemplate(),
          reminder_enabled: false,
          reminder_schedule: [],
          reminder_time: '10:00',
          reminder_send_time: 'morning' as const
        }
        setFormData(defaults)
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }

  const handleStoreChange = async (storeId: string) => {
    setSelectedStoreId(storeId)
    await fetchSettings(storeId)
  }

  const handleSave = async () => {
    const savePayload = {
      // 返信先は会社メールアドレスを使用（未設定の場合はデフォルト）
      from_email: formData.company_email || formData.from_email || 'noreply@mmq.game',
      from_name: formData.company_name || formData.from_name || '予約システム',
      company_name: formData.company_name,
      company_phone: formData.company_phone,
      company_email: formData.company_email,
      company_address: formData.company_address,
      reservation_confirmation_template: formData.reservation_confirmation_template,
      cancellation_template: formData.cancellation_template,
      reminder_template: formData.reminder_template,
      booking_change_template: formData.booking_change_template,
      private_request_template: formData.private_request_template,
      private_confirm_template: formData.private_confirm_template,
      private_cancellation_template: formData.private_cancellation_template,
      private_rejection_template: formData.private_rejection_template,
      waitlist_notify_template: formData.waitlist_notify_template,
      waitlist_registration_template: formData.waitlist_registration_template,
      performance_cancellation_template: formData.performance_cancellation_template,
      event_cancellation_template: formData.event_cancellation_template,
      performance_extension_template: formData.performance_extension_template,
      reminder_enabled: formData.reminder_enabled,
      reminder_schedule: formData.reminder_schedule,
      reminder_time: formData.reminder_time,
      reminder_send_time: formData.reminder_send_time
    }

    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('email_settings')
          .update(savePayload)
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('email_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            ...savePayload
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const updateTemplate = useCallback((key: keyof EmailTemplates, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetTemplate = useCallback((config: TemplateConfig) => {
    const defaultValue = config.getDefault(
      formData.company_name,
      formData.company_phone,
      formData.company_email
    )
    setFormData(prev => ({ ...prev, [config.key]: defaultValue }))
  }, [formData.company_name, formData.company_phone, formData.company_email])

  // リマインドスケジュール管理関数
  const addReminderSchedule = () => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: [
        ...prev.reminder_schedule,
        { days_before: 1, time: '10:00', enabled: true }
      ]
    }))
  }

  const removeReminderSchedule = (index: number) => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: prev.reminder_schedule.filter((_, i) => i !== index)
    }))
  }

  const updateReminderSchedule = (index: number, field: 'days_before' | 'time' | 'enabled' | 'template', value: any) => {
    setFormData(prev => ({
      ...prev,
      reminder_schedule: prev.reminder_schedule.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  const reservationTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'reservation')
  const privateTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'private')
  const otherTemplates = TEMPLATE_CONFIGS.filter(c => c.category === 'other')

  return (
    <div className="space-y-6">
      <PageHeader
        title="メール設定"
        description="メールテンプレートと送信設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 基本設定 */}
      <Card>
        <CardHeader>
          <CardTitle>基本設定</CardTitle>
          <CardDescription>メールの署名・返信先に使用される情報</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="company_name">会社名 *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                placeholder="クイーンズワルツ"
              />
            </div>
            <div>
              <Label htmlFor="company_email">メールアドレス *</Label>
              <Input
                id="company_email"
                type="email"
                value={formData.company_email}
                onChange={(e) => setFormData(prev => ({ ...prev, company_email: e.target.value }))}
                placeholder="info@queens-waltz.jp"
              />
              <p className="text-xs text-muted-foreground mt-1">署名表示 / 返信先</p>
            </div>
            <div>
              <Label htmlFor="company_phone">電話番号</Label>
              <Input
                id="company_phone"
                value={formData.company_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, company_phone: e.target.value }))}
                placeholder="03-XXXX-XXXX"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            送信元: noreply@mmq.game（システム固定）/ 返信先: 上記メールアドレス
          </p>
        </CardContent>
      </Card>

      {/* 予約関連メールテンプレート */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle>予約関連メール</CardTitle>
              <CardDescription>予約・キャンセル・リマインドに関するメールテンプレート</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {reservationTemplates.map(config => (
            <AccordionItem
              key={config.key}
              config={config}
              value={formData[config.key]}
              onChange={(value) => updateTemplate(config.key, value)}
              onReset={() => resetTemplate(config)}
              isOpen={openAccordions.has(config.key)}
              onToggle={() => toggleAccordion(config.key)}
            />
          ))}
        </CardContent>
      </Card>

      {/* 貸切予約関連メールテンプレート */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle>貸切予約関連メール</CardTitle>
              <CardDescription>貸切予約のリクエスト・承認・却下に関するメールテンプレート</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {privateTemplates.map(config => (
            <AccordionItem
              key={config.key}
              config={config}
              value={formData[config.key]}
              onChange={(value) => updateTemplate(config.key, value)}
              onReset={() => resetTemplate(config)}
              isOpen={openAccordions.has(config.key)}
              onToggle={() => toggleAccordion(config.key)}
            />
          ))}
        </CardContent>
      </Card>

      {/* その他のメールテンプレート */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-yellow-600" />
            <div>
              <CardTitle>その他のメール</CardTitle>
              <CardDescription>キャンセル待ち通知などのメールテンプレート</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {otherTemplates.map(config => (
            <AccordionItem
              key={config.key}
              config={config}
              value={formData[config.key]}
              onChange={(value) => updateTemplate(config.key, value)}
              onReset={() => resetTemplate(config)}
              isOpen={openAccordions.has(config.key)}
              onToggle={() => toggleAccordion(config.key)}
            />
          ))}
        </CardContent>
      </Card>

      {/* リマインドメール設定 */}
      <Card>
        <CardHeader>
          <CardTitle>リマインドメール設定</CardTitle>
          <CardDescription>公演前に送信されるリマインドメールの設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* リマインド有効/無効 */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="reminder_enabled">リマインドメールを送信する</Label>
              <p className="text-xs text-muted-foreground">予約者にリマインドメールを送信します</p>
            </div>
            <input
              id="reminder_enabled"
              type="checkbox"
              checked={formData.reminder_enabled}
              onChange={(e) => setFormData(prev => ({ ...prev, reminder_enabled: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          {formData.reminder_enabled && (
            <>
              {/* リマインドスケジュール */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>リマインド送信スケジュール</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addReminderSchedule}
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    + 追加
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {formData.reminder_schedule.map((schedule, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                      {/* 基本設定 */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={schedule.enabled}
                            onChange={(e) => updateReminderSchedule(index, 'enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </div>
                        
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">送信タイミング</Label>
                            <select
                              value={schedule.days_before}
                              onChange={(e) => updateReminderSchedule(index, 'days_before', parseInt(e.target.value))}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            >
                              <option value={1}>1日前</option>
                              <option value={2}>2日前</option>
                              <option value={3}>3日前</option>
                              <option value={7}>1週間前</option>
                              <option value={14}>2週間前</option>
                              <option value={30}>1ヶ月前</option>
                            </select>
                          </div>
                          
                          <div>
                            <Label className="text-sm">送信時刻</Label>
                            <Input
                              type="time"
                              value={schedule.time}
                              onChange={(e) => updateReminderSchedule(index, 'time', e.target.value)}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeReminderSchedule(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={formData.reminder_schedule.length <= 1}
                        >
                          ×
                        </Button>
                      </div>

                      {/* テンプレート編集 */}
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm">メールテンプレート</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const defaultTemplate = getDefaultReminderTemplate(
                                formData.company_name,
                                formData.company_phone,
                                formData.company_email,
                                schedule.days_before
                              )
                              updateReminderSchedule(index, 'template', defaultTemplate)
                            }}
                            className="text-xs"
                          >
                            デフォルトに戻す
                          </Button>
                        </div>
                        
                        <Textarea
                          value={schedule.template || getDefaultReminderTemplate(
                            formData.company_name,
                            formData.company_phone,
                            formData.company_email,
                            schedule.days_before
                          )}
                          onChange={(e) => updateReminderSchedule(index, 'template', e.target.value)}
                          rows={8}
                          placeholder="メールテンプレートを編集"
                          className="text-sm font-mono"
                          disabled={!schedule.enabled}
                        />
                        
                        <p className="text-xs text-muted-foreground mt-1">
                          使用可能な変数: {'{customer_name}'}, {'{scenario_title}'}, {'{date}'}, {'{time}'}, {'{venue}'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-muted-foreground mt-2">
                  複数のリマインドを設定できます。例：1週間前と前日の両方に送信
                </p>
              </div>

              {/* 送信時間帯の選択 */}
              <div>
                <Label>送信時間帯の目安</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="morning"
                      checked={formData.reminder_send_time === 'morning'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    朝（9:00-12:00）
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="afternoon"
                      checked={formData.reminder_send_time === 'afternoon'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    午後（13:00-17:00）
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="reminder_send_time"
                      value="evening"
                      checked={formData.reminder_send_time === 'evening'}
                      onChange={(e) => setFormData(prev => ({ ...prev, reminder_send_time: e.target.value as 'morning' | 'afternoon' | 'evening' }))}
                      className="mr-2"
                    />
                    夜（18:00-21:00）
                  </label>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
