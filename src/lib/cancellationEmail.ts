/**
 * キャンセル確認メールの本文生成（共通モジュール）
 *
 * もともと ReservationList（予約一覧の「予約をキャンセル」ダイアログ）内に
 * あったロジックを抽出したもの。公演の中止・削除フロー（DeleteEventCancelDialog）
 * からも同じ本文生成を使い、メール編集の体験を統一する（2026-06-13 オーナー指示）。
 */
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatJstDateJa } from '@/utils/jstDate'

export interface CancellationEmailContent {
  customerName: string
  cancellationReason: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
  cancellationFee: number
  paymentMethod: string
  cancellationPolicy: string
  organizationName: string
}

/**
 * メール本文を生成（email_settings の cancellation_template を優先、なければフォールバック）
 */
export function buildCancellationEmailBody(content: CancellationEmailContent, template?: string): string {
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    return formatJstDateJa(dateStr, true) || dateStr
  }
  const formatTime = (t: string) => t?.slice(0, 5) || ''

  if (template) {
    return template
      .replace(/{customer_name}/g, content.customerName)
      .replace(/{reservation_number}/g, content.reservationNumber)
      .replace(/{scenario_title}/g, content.scenarioTitle)
      .replace(/{date}/g, formatDate(content.eventDate))
      .replace(/{time}/g, formatTime(content.startTime))
      .replace(/{end_time}/g, formatTime(content.endTime))
      .replace(/{venue}/g, content.storeName)
      .replace(/{participants}/g, String(content.participantCount))
      .replace(/{cancellation_fee}/g, content.cancellationFee.toLocaleString())
      .replace(/{cancellation_reason}/g, content.cancellationReason)
      .replace(/{company_name}/g, content.organizationName || '店舗')
      .replace(/{total_price}/g, content.totalPrice.toLocaleString())
  }

  // フォールバック: email_settings 未設定時のデフォルト文面
  const isOnsitePayment = content.paymentMethod === 'onsite'
  const refundMessage = isOnsitePayment
    ? 'お支払いは不要となりました。'
    : 'お支払いいただいた料金は全額返金させていただきます。'
  const policySection = content.cancellationPolicy
    ? `\n【キャンセルポリシー】\n${content.cancellationPolicy}\n`
    : ''

  return `${content.customerName} 様

いつもご利用いただきありがとうございます。

誠に申し訳ございませんが、以下のご予約をキャンセルさせていただくこととなりました。

【予約情報】
予約番号: ${content.reservationNumber}
シナリオ: ${content.scenarioTitle}
日時: ${formatDate(content.eventDate)} ${formatTime(content.startTime)} - ${formatTime(content.endTime)}
会場: ${content.storeName}
参加人数: ${content.participantCount}名

【キャンセル理由】
${content.cancellationReason}

${content.cancellationFee > 0 ? `【キャンセル料】\n¥${content.cancellationFee.toLocaleString()}\n\n` : ''}${refundMessage}${policySection}
この度は大変ご迷惑をおかけし、誠に申し訳ございませんでした。
またのご利用を心よりお待ちしております。

---
${content.organizationName || '店舗'}
このメールは自動送信されています。
ご不明な点がございましたら、お気軽にお問い合わせください。`
}

export interface StoreCancellationEmailContext {
  storeName: string
  organizationName: string
  cancellationPolicy: string
  template: string
}

/**
 * 取得対象の本文テンプレート列名。
 * - 'store_cancellation_template' = キャンセル操作メール（顧客自身のキャンセル等）
 * - 'event_cancellation_template' = 公演中止メール（スタッフ起点の中止・削除）
 */
export type CancellationTemplateKey =
  | 'store_cancellation_template'
  | 'event_cancellation_template'

/**
 * 店舗のキャンセルメール設定（テンプレート・ポリシー・組織名・店舗名）を取得。
 * 取得に失敗してもフォールバック文面で進められるよう、常に値を返す。
 *
 * `templateKey` で「どのテンプレ列を本文の元として読むか」を選ぶ。スタッフ起点の
 * 公演中止/削除（cancelledBy:'store'）は 'event_cancellation_template' を渡し、
 * Edge Function 側の件名・本文選択（isStoreCancellation 分岐）と整合させる。
 */
export async function fetchStoreCancellationEmailContext(
  storeId: string | null | undefined,
  templateKey: CancellationTemplateKey = 'store_cancellation_template'
): Promise<StoreCancellationEmailContext> {
  const ctx: StoreCancellationEmailContext = {
    storeName: '',
    organizationName: '',
    cancellationPolicy: '',
    template: '',
  }
  if (!storeId) return ctx
  try {
    const [settingsResult, emailSettingsResult, storeResult] = await Promise.all([
      supabase.from('reservation_settings').select('cancellation_policy').eq('store_id', storeId).maybeSingle(),
      supabase.from('email_settings').select(`${templateKey}, company_name`).eq('store_id', storeId).maybeSingle(),
      supabase.from('stores').select('name, organization_id, organizations(name)').eq('id', storeId).maybeSingle(),
    ])

    ctx.cancellationPolicy = settingsResult.data?.cancellation_policy || ''
    ctx.template = (emailSettingsResult.data as Record<string, string | null> | null)?.[templateKey] || ''
    ctx.storeName = storeResult.data?.name || ''

    if (storeResult.data?.organizations) {
      const org = storeResult.data.organizations as { name: string } | { name: string }[]
      ctx.organizationName = Array.isArray(org) ? org[0]?.name || '' : org.name || ''
    }
    if (!ctx.organizationName && emailSettingsResult.data?.company_name) {
      ctx.organizationName = emailSettingsResult.data.company_name
    }
  } catch (error) {
    logger.warn('キャンセルメール設定取得エラー:', error)
  }
  return ctx
}
