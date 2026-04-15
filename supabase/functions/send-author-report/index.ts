// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getServiceRoleKey, getCorsHeaders, maskEmail, sanitizeErrorMessage, verifyAuth, errorResponse } from '../_shared/security.ts'

interface AuthorReportRequest {
  organizationId?: string  // マルチテナント対応
  to: string
  authorName: string
  year: number
  month: number
  totalEvents: number
  totalLicenseCost: number
  customTextBody?: string  // 編集済みテキスト本文（省略時は自動生成）
  scenarios: Array<{
    title: string
    events: number
    internalEvents?: number
    externalEvents?: number
    internalLicenseAmount?: number
    externalLicenseAmount?: number
    internalLicenseCost?: number
    externalLicenseCost?: number
    licenseAmountPerEvent?: number  // 後方互換性
    licenseCost: number
    isGMTest?: boolean
  }>
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 P0-5修正: 認証チェック追加（管理者またはライセンス管理者のみ許可）
    // このファンクションはmagic linkを生成できるため、厳格な認証が必須
    const authResult = await verifyAuth(req, ['admin', 'license_admin', 'owner'])
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const body = await req.json()
    
    // ログにはマスキングした情報のみ出力
    console.log('📧 Sending author report:', {
      to: maskEmail(body.to),
      authorName: body.authorName,
      year: body.year,
      month: body.month,
    })
    
    const { organizationId, to, authorName, year, month, totalEvents, totalLicenseCost, customTextBody, scenarios }: AuthorReportRequest = body

    // 入力バリデーション
    if (!to || !authorName || !year || !month) {
      return errorResponse('必須パラメータが不足しています', 400, corsHeaders)
    }

    // メールアドレスの形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return errorResponse('無効なメールアドレス形式です', 400, corsHeaders)
    }

    // Supabase Admin クライアントを作成
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = getServiceRoleKey()
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 組織設定からメール設定を取得
    const emailSettings = organizationId 
      ? await getEmailSettings(supabaseAdmin, organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
    // 自社の返信先メール（送信確認コピーの宛先にも使用）
    const replyToEmail = emailSettings?.replyToEmail || Deno.env.get('REPLY_TO_EMAIL') || null
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    const formatYen = (value?: number) => {
      const amount = typeof value === 'number' && !Number.isNaN(value) ? value : 0
      return amount.toLocaleString()
    }

    // 振込予定日を計算（翌月20日）
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const paymentDate = `${nextYear}年${nextMonth}月20日`

    // プレーンテキスト版メール本文
    const emailText = `${authorName} 様

いつもお世話になっております。

${year}年${month}月のライセンス料をご報告いたします。

■ 概要
総公演数: ${totalEvents}回
総ライセンス料: ¥${formatYen(totalLicenseCost)}

■ 詳細
${scenarios.map(scenario => {
  const gmTestLabel = scenario.isGMTest ? '（GMテスト）' : ''
  const hasBreakdown = scenario.internalEvents !== undefined && scenario.externalEvents !== undefined

  if (hasBreakdown) {
    const parts: string[] = []
    if (scenario.internalEvents && scenario.internalEvents > 0) {
      const amount = scenario.internalLicenseAmount || 0
      const cost = scenario.internalLicenseCost || 0
      parts.push(`自社: ${scenario.internalEvents}回 × @¥${formatYen(amount)} = ¥${formatYen(cost)}`)
    }
    if (scenario.externalEvents && scenario.externalEvents > 0) {
      const amount = scenario.externalLicenseAmount || 0
      const cost = scenario.externalLicenseCost || 0
      parts.push(`他社: ${scenario.externalEvents}回 × @¥${formatYen(amount)} = ¥${formatYen(cost)}`)
    }
    const detail = parts.length > 0 ? parts.join(' / ') : '0回'
    return `・${scenario.title}${gmTestLabel}: ${detail}（合計 ¥${formatYen(scenario.licenseCost || 0)}）`
  }

  // 後方互換性: 旧フォーマット
  const licenseAmount = scenario.licenseAmountPerEvent || 0
  const events = scenario.events || 0
  const cost = scenario.licenseCost || 0
  return `・${scenario.title}${gmTestLabel}: ${events}回 × @¥${formatYen(licenseAmount)}/回 = ¥${formatYen(cost)}`
}).join('\n')}

■ お支払いについて
お支払い予定日: ${paymentDate}まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━
MMQ
このメールは自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください`

    // Resend APIを使ってプレーンテキストメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@mmq.game>`,
        ...(replyToEmail ? { reply_to: replyToEmail } : {}),
        to: [to],
        // 自社メールアドレスに送信確認コピーを送る
        ...(replyToEmail ? { bcc: [replyToEmail] } : {}),
        subject: `【${year}年${month}月】ライセンス料レポート - ${authorName}`,
        text: customTextBody || emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('Author report email sent successfully:', {
      messageId: result.id,
      to: to,
      authorName: authorName,
      year: year,
      month: month,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'メールを送信しました',
        messageId: result.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error sending author report email:', sanitizeErrorMessage(msg))

    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(msg || 'メール送信に失敗しました'),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
