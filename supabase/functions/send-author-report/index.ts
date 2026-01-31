// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, maskEmail, sanitizeErrorMessage } from '../_shared/security.ts'

interface AuthorReportRequest {
  organizationId?: string  // マルチテナント対応
  to: string
  authorName: string
  year: number
  month: number
  totalEvents: number
  totalLicenseCost: number
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
    const body = await req.json()
    console.log('Received body:', JSON.stringify(body, null, 2))
    const { organizationId, to, authorName, year, month, totalEvents, totalLicenseCost, scenarios }: AuthorReportRequest = body
    console.log('scenarios:', JSON.stringify(scenarios, null, 2))

    // Supabase Admin クライアントを作成
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 組織設定からメール設定を取得
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ予約システム'
    
    if (organizationId) {
      const emailSettings = await getEmailSettings(supabaseAdmin, organizationId)
      if (emailSettings.resendApiKey) {
        resendApiKey = emailSettings.resendApiKey
        senderEmail = emailSettings.senderEmail
        senderName = emailSettings.senderName
      }
    }
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // マジックリンクを生成
    let magicLinkUrl = ''
    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: to,
        options: {
          redirectTo: `${Deno.env.get('SITE_URL') || 'https://mmq.game'}/#author-dashboard`
        }
      })

      if (linkError) {
        console.warn('Magic link generation failed:', linkError.message)
        // マジックリンク生成に失敗しても、メールは送信する
      } else if (linkData?.properties?.action_link) {
        magicLinkUrl = linkData.properties.action_link
        console.log('Magic link generated successfully')
      }
    } catch (linkErr) {
      console.warn('Magic link generation error:', linkErr)
      // マジックリンク生成に失敗しても、メールは送信する
    }

    const formatYen = (value?: number) => {
      const amount = typeof value === 'number' && !Number.isNaN(value) ? value : 0
      return amount.toLocaleString()
    }

    // 振込予定日を計算（翌月20日）
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const paymentDate = `${nextYear}年${nextMonth}月20日`

    // シナリオ詳細のHTML生成
    const scenariosHtml = scenarios.map(scenario => {
      const gmTestLabel = scenario.isGMTest ? '<span style="color: #dc2626; font-size: 12px;">（GMテスト）</span>' : ''
      
      // 新しいデータ構造と後方互換性の両方に対応
      const hasBreakdown = scenario.internalEvents !== undefined && scenario.externalEvents !== undefined
      
      let detailHtml = ''
      if (hasBreakdown) {
        const parts = []
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
        detailHtml = parts.length > 0 
          ? parts.map(p => `<div style="font-size: 13px; color: #6b7280; margin-left: 8px;">${p}</div>`).join('')
          : `<div style="font-size: 13px; color: #6b7280; margin-left: 8px;">0回</div>`
      } else {
        // 後方互換性: 旧フォーマット
        const licenseAmount = scenario.licenseAmountPerEvent || 0
        detailHtml = `
          <div style="font-size: 13px; color: #6b7280; margin-left: 8px;">
            ${scenario.events || 0}回 × @¥${formatYen(licenseAmount)}/回 = ¥${formatYen(scenario.licenseCost || 0)}
          </div>
        `
      }
      
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
            <div style="font-weight: 500; color: #1f2937; margin-bottom: 4px;">
              ${scenario.title}${gmTestLabel}
              <span style="float: right; font-weight: bold; color: #1f2937;">¥${formatYen(scenario.licenseCost || 0)}</span>
            </div>
            ${detailHtml}
          </td>
        </tr>
      `
    }).join('')

    // マジックリンクボタンのHTML
    const magicLinkHtml = magicLinkUrl ? `
    <div style="text-align: center; margin: 25px 0;">
      <a href="${magicLinkUrl}" 
         style="display: inline-block; 
                background-color: #2563eb; 
                color: #ffffff; 
                padding: 14px 28px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600;
                font-size: 15px;
                box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);">
        📊 ダッシュボードで詳細を見る
      </a>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        ※ このリンクは24時間有効です。クリックすると自動でログインします。
      </p>
    </div>
    ` : ''

    // HTMLメール本文
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ライセンス料レポート</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background-color: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h1 style="color: #1e40af; margin-top: 0; font-size: 20px; font-weight: bold;">
      【${year}年${month}月】ライセンス料レポート - ${authorName}
    </h1>
    <p style="font-size: 15px; margin-bottom: 4px; color: #1f2937; font-weight: 500;">
      ${authorName} 様
    </p>
    <p style="font-size: 13px; color: #4b5563; margin: 0;">
      いつもお世話になっております。
    </p>
  </div>

  <div style="background-color: #fff; border-radius: 8px; padding: 25px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <p style="font-size: 14px; color: #374151; margin-bottom: 20px;">
      ${year}年${month}月のライセンス料をご報告いたします。
    </p>

    <div style="background-color: #f9fafb; border-radius: 6px; padding: 18px; margin-bottom: 20px;">
      <h2 style="color: #374151; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
        ■ 概要
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; font-weight: 500; color: #374151; width: 50%;">総公演数</td>
          <td style="padding: 10px 0; color: #1f2937; text-align: right; font-weight: 500;">${totalEvents}回</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; font-weight: 500; color: #374151;">総ライセンス料</td>
          <td style="padding: 10px 0; color: #1f2937; text-align: right; font-size: 18px; font-weight: bold;">
            ¥${formatYen(totalLicenseCost)}
          </td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f9fafb; border-radius: 6px; padding: 18px; margin-bottom: 20px;">
      <h2 style="color: #374151; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb;">
        ■ 詳細
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        ${scenariosHtml}
      </table>
    </div>

    ${magicLinkHtml}

    <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; border-radius: 4px; padding: 15px; margin-bottom: 20px;">
      <h2 style="color: #1e40af; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 10px;">
        ■ お支払いについて
      </h2>
      <p style="color: #1e40af; font-size: 13px; margin: 4px 0;">
        お支払い予定日: <strong>${paymentDate}まで</strong>
      </p>
      <p style="color: #1e40af; font-size: 13px; margin: 4px 0;">
        請求書は <strong>queens.waltz@gmail.com</strong> 宛にお送りください。
      </p>
    </div>

    <div style="background-color: #f9fafb; border-radius: 6px; padding: 15px; text-align: center; margin-bottom: 20px;">
      <p style="color: #4b5563; font-size: 13px; margin: 4px 0;">
        何かご不明点がございましたら、お気軽にお問い合わせください。
      </p>
      <p style="color: #4b5563; font-size: 13px; margin: 4px 0;">
        よろしくお願いいたします。
      </p>
    </div>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px;">
    <p style="margin: 4px 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 4px 0;">このメールは自動送信されています</p>
    <p style="margin: 4px 0;">ご不明な点がございましたら、お気軽にお問い合わせください</p>
  </div>
</body>
</html>
    `

    // マジックリンクのテキスト版
    const magicLinkText = magicLinkUrl ? `
━━━━━━━━━━━━━━━━━━━━
📊 ダッシュボードで詳細を見る
${magicLinkUrl}
※ このリンクは24時間有効です
━━━━━━━━━━━━━━━━━━━━
` : ''

    // テキスト版メール本文
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
${magicLinkText}
■ お支払いについて
お支払い予定日: ${paymentDate}まで

請求書は queens.waltz@gmail.com 宛にお送りください。

何かご不明点がございましたら、お気軽にお問い合わせください。

よろしくお願いいたします。

━━━━━━━━━━━━━━━━━━━━
Murder Mystery Queue (MMQ)
このメールは自動送信されています
ご不明な点がございましたら、お気軽にお問い合わせください
    `

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MMQ ライセンス管理 <noreply@mmq.game>',
        reply_to: 'queens.waltz@gmail.com',
        to: [to],
        bcc: ['queens.waltz@gmail.com'],
        subject: `【${year}年${month}月】ライセンス料レポート - ${authorName}`,
        html: emailHtml,
        text: emailText,
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
      hasMagicLink: !!magicLinkUrl,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'メールを送信しました',
        messageId: result.id,
        hasMagicLink: !!magicLinkUrl,
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
