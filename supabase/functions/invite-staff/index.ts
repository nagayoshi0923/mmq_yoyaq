// スタッフ招待機能
// 管理者がスタッフを招待すると、自動的にユーザー作成 + スタッフレコード作成 + 招待メール送信

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface InviteStaffRequest {
  email: string
  name: string
  phone?: string
  line_name?: string
  x_account?: string
  discord_id?: string
  discord_channel_id?: string
  role?: string[]
  stores?: string[]
}

serve(async (req) => {
  try {
    // CORSヘッダー
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    const { email, name, phone, line_name, x_account, discord_id, discord_channel_id, role, stores }: InviteStaffRequest = await req.json()

    console.log('📨 Staff invitation request:', { email, name })

    // 1. ユーザーを作成（パスワード未設定、メール未確認状態）
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: false, // メール確認が必要
      password: crypto.randomUUID(), // 一時パスワード（使用不可）
      user_metadata: {
        full_name: name,
        invited_as: 'staff'
      }
    })

    if (authError) {
      console.error('❌ Error creating auth user:', authError)
      throw new Error(`Failed to create user: ${authError.message}`)
    }

    const userId = authData.user.id
    console.log('✅ Auth user created:', userId)

    // 2. usersテーブルは自動的にトリガーで作成される（handle_new_user）
    // トリガーの処理を待つため、短時間スリープ
    await new Promise(resolve => setTimeout(resolve, 500))
    console.log('✅ Users record created by trigger')

    // 3. staffテーブルにレコード作成
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .insert({
        user_id: userId,
        name: name,
        email: email,
        phone: phone || '',
        line_name: line_name || '',
        x_account: x_account || '',
        discord_id: discord_id || '',
        discord_channel_id: discord_channel_id || '',
        role: role || ['gm'],
        stores: stores || [],
        status: 'active',
        experience: 0,
        availability: [],
        ng_days: [],
        notes: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (staffError) {
      console.error('❌ Error creating staff record:', staffError)
      // ユーザーをロールバック（usersテーブルはカスケード削除される）
      await supabase.auth.admin.deleteUser(userId)
      throw new Error(`Failed to create staff record: ${staffError.message}`)
    }

    console.log('✅ Staff record created:', staffData.id)

    // 4. パスワード設定用のリンクを生成（signup typeを使用）
    const { data: inviteLinkData, error: inviteLinkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: 'https://mmq-yoyaq.vercel.app/#/set-password'
      }
    })

    if (inviteLinkError) {
      console.error('❌ Error generating invite link:', inviteLinkError)
      throw new Error(`Failed to generate invite link: ${inviteLinkError.message}`)
    }

    const inviteLink = inviteLinkData.properties.action_link
    console.log('✅ Invite link generated')

    // 5. Resend APIで招待メールを送信
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not set, skipping email')
    } else {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MMQ <noreply@mmq.game>',
            to: [email],
            subject: '【MMQ】スタッフアカウント招待',
            html: `
              <h2>【MMQ】スタッフアカウントへようこそ！</h2>
              
              <p>こんにちは、${name}さん</p>
              
              <p>謎解きカフェ・バーMMQのスタッフ管理システムにご招待します。</p>
              
              <h3>🔐 アカウント設定手順</h3>
              
              <ol>
                <li>下のボタンをクリック</li>
                <li>パスワードを設定（8文字以上）</li>
                <li>ログインしてスタッフページにアクセス</li>
              </ol>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">パスワードを設定する</a>
              </p>
              
              <p style="font-size: 12px; color: #666;">
                または、以下のリンクをコピーしてブラウザに貼り付けてください：<br>
                <a href="${inviteLink}">${inviteLink}</a>
              </p>
              
              <h3>📋 ログイン後にできること</h3>
              <ul>
                <li>シフト提出</li>
                <li>スケジュール確認</li>
                <li>予約確認</li>
              </ul>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              
              <p style="color: #666; font-size: 12px;">
                <strong>⚠️ 注意事項</strong><br>
                • このリンクは24時間で有効期限が切れます<br>
                • 心当たりがない場合は無視してください<br>
                • パスワードは誰にも教えないでください
              </p>
            `,
          }),
        })

        if (!emailResponse.ok) {
          const errorData = await emailResponse.text()
          console.error('❌ Resend API error:', errorData)
          throw new Error(`Failed to send email via Resend: ${errorData}`)
        }

        const emailData = await emailResponse.json()
        console.log('✅ Invite email sent via Resend:', emailData.id)
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError)
        // メール送信失敗はエラーとしない（ユーザーとスタッフレコードは作成済み）
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Staff invited successfully',
        data: {
          user_id: userId,
          staff_id: staffData.id,
          email: email,
          name: name
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        status: 500
      }
    )
  }
})

