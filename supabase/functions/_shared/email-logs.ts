/**
 * email_logs テーブルへのアクセスヘルパー
 *
 * 設計方針:
 * - すべての関数はエラーをスローせず null / void を返す（送信処理をブロックしない）
 * - PII を含む body_html / body_text は呼び出し元が渡すかどうかを選択できる
 * - provider_message_id は Resend から返る email_id
 */

// Deno / supabase-js の型宣言（Edge Function 環境）
// deno-lint-ignore-file no-explicit-any
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type EmailLogStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'delivery_delayed'

export type EmailLogType =
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'reservation_changed'
  | 'reservation_request'
  | 'reminder'
  | 'gm_notification'
  | 'staff_invitation'
  | 'waitlist_confirmed'
  | 'guest_pin'
  | 'performance_cancellation'
  | 'performance_confirmation'
  | 'license_report'
  | 'contact_inquiry'
  | 'coupon_granted'
  | 'other'

export interface EmailLogInsert {
  organization_id?: string | null
  reservation_id?: string | null
  schedule_event_id?: string | null
  customer_id?: string | null
  email_type: EmailLogType
  to_email: string
  to_name?: string | null
  subject: string
  /** HTMLメール本文（PIIを含む場合は呼び出し元が省略可） */
  body_html?: string | null
  /** テキストメール本文（PIIを含む場合は呼び出し元が省略可） */
  body_text?: string | null
  provider?: string
  status?: EmailLogStatus
}

export interface EmailLogUpdate {
  status?: EmailLogStatus
  provider_message_id?: string | null
  error_message?: string | null
  sent_at?: string | null
  delivered_at?: string | null
  opened_at?: string | null
  bounced_at?: string | null
  complained_at?: string | null
}

/**
 * email_logs に新規レコードを挿入し、生成された id を返す。
 * 失敗時は null を返す（エラーをスローしない）。
 */
export async function insertEmailLog(
  supabase: SupabaseClient,
  data: EmailLogInsert,
): Promise<string | null> {
  try {
    const { data: row, error } = await supabase
      .from('email_logs')
      .insert({
        organization_id:   data.organization_id   ?? null,
        reservation_id:    data.reservation_id    ?? null,
        schedule_event_id: data.schedule_event_id ?? null,
        customer_id:       data.customer_id       ?? null,
        email_type:        data.email_type,
        to_email:          data.to_email,
        to_name:           data.to_name           ?? null,
        subject:           data.subject,
        body_html:         data.body_html         ?? null,
        body_text:         data.body_text         ?? null,
        provider:          data.provider          ?? 'resend',
        status:            data.status            ?? 'queued',
      })
      .select('id')
      .single()

    if (error) {
      console.warn('⚠️ email_logs insert failed (non-blocking):', error.message)
      return null
    }
    return (row as any)?.id ?? null
  } catch (err: unknown) {
    console.warn('⚠️ email_logs insert exception (non-blocking):', (err as Error).message)
    return null
  }
}

/**
 * email_logs の既存レコードを id で更新する。
 * id が null の場合や失敗した場合は何もしない（エラーをスローしない）。
 */
export async function updateEmailLog(
  supabase: SupabaseClient,
  id: string | null,
  updates: EmailLogUpdate,
): Promise<void> {
  if (!id) return
  try {
    const { error } = await supabase
      .from('email_logs')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.warn('⚠️ email_logs update failed (non-blocking):', error.message)
    }
  } catch (err: unknown) {
    console.warn('⚠️ email_logs update exception (non-blocking):', (err as Error).message)
  }
}

/**
 * Resend Webhook 用: provider_message_id でレコードを特定して update or insert する。
 *
 * 既存レコードがあれば update、無ければ fallback の最小情報で insert する。
 * これにより「send-* 関数が insertEmailLog 到達前に失敗した」「他のコードパスから
 * Resend に直接送った」等のケースでも、Resend が一度でも受理したメールは
 * 必ず email_logs に残る。
 *
 * fallback insert は webhook payload にある情報のみ使うため、organization_id /
 * customer_id / reservation_id 等は NULL になる。email_type は 'other' で記録。
 */
export async function upsertEmailLogByProviderId(
  supabase: SupabaseClient,
  providerId: string,
  updates: EmailLogUpdate,
  fallbackInsert: {
    to_email: string
    subject: string
    email_type?: EmailLogType
  },
): Promise<void> {
  try {
    const { data: rows, error } = await supabase
      .from('email_logs')
      .update(updates)
      .eq('provider_message_id', providerId)
      .select('id')

    if (error) {
      console.warn('⚠️ email_logs upsertByProviderId update failed:', error.message)
      return
    }

    if (rows && rows.length > 0) return

    // 既存レコード無し → fallback insert
    const { error: insertError } = await supabase
      .from('email_logs')
      .insert({
        provider:            'resend',
        provider_message_id: providerId,
        to_email:            fallbackInsert.to_email,
        subject:             fallbackInsert.subject,
        email_type:          fallbackInsert.email_type ?? 'other',
        status:              updates.status ?? 'sent',
        sent_at:              updates.sent_at      ?? null,
        delivered_at:         updates.delivered_at ?? null,
        opened_at:            updates.opened_at    ?? null,
        bounced_at:           updates.bounced_at   ?? null,
        complained_at:        updates.complained_at?? null,
        error_message:        updates.error_message?? null,
      })

    if (insertError) {
      console.warn('⚠️ email_logs upsertByProviderId fallback insert failed:', insertError.message)
    } else {
      console.log('📬 email_logs fallback insert from webhook:', providerId)
    }
  } catch (err: unknown) {
    console.warn(
      '⚠️ email_logs upsertByProviderId exception (non-blocking):',
      (err as Error).message,
    )
  }
}
