import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { SESClient, SendEmailCommand } from 'npm:@aws-sdk/client-ses@3.515.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string | string[]
  subject: string
  body: string
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, body }: EmailRequest = await req.json()

    // 環境変数の取得
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID')
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1'
    const fromEmail = Deno.env.get('SES_FROM_EMAIL')

    if (!awsAccessKeyId || !awsSecretAccessKey || !fromEmail) {
      throw new Error('AWS credentials or FROM email not configured')
    }

    // SES クライアントの初期化
    const sesClient = new SESClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    })

    // 送信先の配列化
    const recipients = Array.isArray(to) ? to : [to]

    // メール送信コマンドの作成
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
      },
    })

    // メール送信
    const response = await sesClient.send(command)

    console.log('Email sent successfully:', {
      messageId: response.MessageId,
      recipients: recipients.length,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'メールを送信しました',
        messageId: response.MessageId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error sending email:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'メール送信に失敗しました',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

