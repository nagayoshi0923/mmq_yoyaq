// @ts-nocheck
/**
 * クーポン付与時の通知メール送信
 *
 * 呼び出し元: api/coupons.ts の 3 つの grant 関数（service_role 経由で invoke）
 * 起動条件: coupon_campaigns.notify_on_grant=true のキャンペーンに限り送信
 *           （フラグ無効なら 200 + skipped:true で何もせず返す）
 *
 * 入力: { customerCouponId: string }
 * 出力: { success: boolean, skipped?: true, messageId?: string, error?: string }
 *
 * セキュリティ:
 * - service_role / cron secret 経由の呼び出しのみ許可（顧客が任意 customerCouponId
 *   を指定して他人のクーポン情報を漏洩させるのを防ぐ）
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getCorsHeaders,
  errorResponse,
  maskEmail,
  sanitizeErrorMessage,
  getServiceRoleKey,
  isCronOrServiceRoleCall,
} from '../_shared/security.ts'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'

interface SendCouponGrantedRequest {
  customerCouponId: string
}

function formatDiscount(type: string, amount: number): string {
  if (type === 'percentage') return `${amount}% OFF`
  return `${amount.toLocaleString()}円引き`
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '無期限'
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return expiresAt
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function buildConditionsBlock(campaign: any): string {
  const lines: string[] = []
  if (campaign.min_order_amount) {
    lines.push(`・最低利用金額：${Number(campaign.min_order_amount).toLocaleString()}円`)
  }
  if (Array.isArray(campaign.allowed_weekdays) && campaign.allowed_weekdays.length > 0) {
    const wd = ['日', '月', '火', '水', '木', '金', '土']
    lines.push(`・利用可能曜日：${campaign.allowed_weekdays.map((d: number) => wd[d] ?? '?').join('・')}`)
  }
  if (Array.isArray(campaign.allowed_time_slots) && campaign.allowed_time_slots.length > 0) {
    lines.push(`・利用可能時間帯：${campaign.allowed_time_slots.join('、')}`)
  }
  if (lines.length === 0) return ''
  return '\n■ 利用条件\n' + lines.join('\n') + '\n'
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // server-to-server 専用
    if (!isCronOrServiceRoleCall(req)) {
      return errorResponse('権限がありません', 401, corsHeaders)
    }

    const body = (await req.json()) as SendCouponGrantedRequest
    const customerCouponId = body?.customerCouponId
    if (!customerCouponId) {
      return errorResponse('customerCouponId が必要です', 400, corsHeaders)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())

    // クーポン取得
    const { data: cc, error: ccError } = await supabase
      .from('customer_coupons')
      .select('id, campaign_id, customer_id, organization_id, uses_remaining, expires_at')
      .eq('id', customerCouponId)
      .maybeSingle()

    if (ccError || !cc) {
      console.warn('customer_coupon not found:', customerCouponId, ccError?.message)
      return errorResponse('クーポンが見つかりません', 404, corsHeaders)
    }

    // キャンペーン取得
    const { data: campaign, error: campaignError } = await supabase
      .from('coupon_campaigns')
      .select('id, name, display_name, discount_type, discount_amount, min_order_amount, allowed_weekdays, allowed_time_slots, customer_terms, notify_on_grant')
      .eq('id', cc.campaign_id)
      .maybeSingle()

    if (campaignError || !campaign) {
      return errorResponse('キャンペーンが見つかりません', 404, corsHeaders)
    }

    // フラグ無効はスキップ（呼び出し側が常に invoke する設計でも安全に倒す）
    if (!campaign.notify_on_grant) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 顧客取得
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, user_id, name, email')
      .eq('id', cc.customer_id)
      .maybeSingle()

    if (customerError || !customer?.email) {
      return errorResponse('顧客のメールアドレスが取得できません', 404, corsHeaders)
    }

    // メール設定（org 優先 → env fallback）
    const emailSettings = await getEmailSettings(supabase, cc.organization_id)
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail  = emailSettings?.senderEmail  || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName   = emailSettings?.senderName   || Deno.env.get('SENDER_NAME')  || 'MMQ予約システム'
    const replyTo      = emailSettings?.replyToEmail || undefined

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // 本文構築
    const couponName    = campaign.display_name || campaign.name
    const discountText  = formatDiscount(campaign.discount_type, Number(campaign.discount_amount))
    const expiryText    = formatExpiry(cc.expires_at)
    const conditions    = buildConditionsBlock(campaign)
    const termsText     = campaign.customer_terms
      ? `\n■ 詳細\n${campaign.customer_terms}\n`
      : ''
    const customerName  = customer.name || 'お客様'
    const subject = `【新着クーポン】${couponName}が利用できます`
    const text = `${customerName} 様

新しいクーポンが付与されました。

■ クーポン
${couponName}

■ 割引
${discountText}

■ 有効期限
${expiryText}
${conditions}${termsText}
ご予約後、公演当日の3時間前〜終了1時間後の間に
マイページから「もぎる」操作でご利用いただけます。

※このメールは自動送信されています。
`

    console.log('📧 Sending coupon-granted email:', {
      recipient: maskEmail(customer.email),
      campaign:  couponName.substring(0, 30),
    })

    const emailLogId = await insertEmailLog(supabase, {
      organization_id: cc.organization_id,
      customer_id:     customer.user_id, // email_logs.customer_id は users(id) を参照
      email_type:      'coupon_granted',
      to_email:        customer.email,
      to_name:         customer.name ?? null,
      subject,
      body_text:       text,
      status:          'queued',
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${senderName} <${senderEmail}>`,
        to:      [customer.email],
        subject,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}))
      console.error('Resend API error:', resendResponse.status, errorData)
      await updateEmailLog(supabase, emailLogId, {
        status:        'failed',
        error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
      })
      throw new Error('メール送信に失敗しました')
    }

    const result = await resendResponse.json()
    await updateEmailLog(supabase, emailLogId, {
      status:              'sent',
      provider_message_id: result.id,
      sent_at:             new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error sending coupon-granted email:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ success: false, error: sanitizeErrorMessage(msg) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
