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

    // 1. 既存ユーザーを検索
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users.find(u => u.email === email)
    
    let userId: string
    let existingStaffByEmail: any = null
    
    if (existingUser) {
      // 既存ユーザーの場合
      userId = existingUser.id
      console.log('✅ Existing user found:', userId)
      
      // メールアドレスでstaffレコードを検索（既存レコードの更新のため）
      // 複数のレコードがある場合は最初の1つを使用
      const { data: staffByEmailList, error: emailCheckError } = await supabase
        .from('staff')
        .select('id, user_id, email, phone, line_name, x_account, discord_id, discord_channel_id, role, stores')
        .eq('email', email)
        .limit(1)
      
      if (emailCheckError) {
        console.warn('⚠️ Staff検索エラー:', emailCheckError)
      }
      
      existingStaffByEmail = staffByEmailList && staffByEmailList.length > 0 ? staffByEmailList[0] : null
      
      if (existingStaffByEmail) {
        if (existingStaffByEmail.user_id && existingStaffByEmail.user_id !== userId) {
          // 別のユーザーに紐付いている場合でも、現在のユーザーに上書きして招待
          console.log('⚠️ 既存のstaffレコードが別のユーザーに紐付いています。上書きして招待します:', existingStaffByEmail.id)
        } else {
          console.log('📝 既存のstaffレコードが見つかりました。更新してメールを再送信します:', existingStaffByEmail.id)
        }
      } else {
        // 既存ユーザーだがstaffレコードがない場合
        console.log('📝 既存ユーザーですが、staffレコードがありません。新規作成して招待します')
      }
    } else {
      // 新規ユーザーを作成（パスワード未設定、メール未確認状態）
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

      userId = authData.user.id
      console.log('✅ Auth user created:', userId)
      
      // 新規ユーザーの場合も、メールアドレスで既存のstaffレコードを確認
      // 複数のレコードがある場合は最初の1つを使用
      const { data: staffByEmailNewList, error: emailCheckErrorNew } = await supabase
        .from('staff')
        .select('id, user_id, email, phone, line_name, x_account, discord_id, discord_channel_id, role, stores')
        .eq('email', email)
        .limit(1)
      
      if (emailCheckErrorNew) {
        console.warn('⚠️ Staff検索エラー（新規ユーザー）:', emailCheckErrorNew)
      }
      
      const staffByEmailNew = staffByEmailNewList && staffByEmailNewList.length > 0 ? staffByEmailNewList[0] : null
      
      if (staffByEmailNew && !staffByEmailNew.user_id) {
        existingStaffByEmail = staffByEmailNew
        console.log('⚠️ 新規ユーザーですが、既存のstaffレコード（user_id未設定）が見つかりました。更新します:', existingStaffByEmail.id)
      }
    }

    // 2. usersテーブルの確認と更新
    if (!existingUser) {
      // 新規ユーザーの場合：トリガーの処理を待つ
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('✅ Users record created by trigger')
    }
    
    // 2.5. usersテーブルのroleをstaffに明示的に更新
    const { error: updateRoleError } = await supabase
      .from('users')
      .update({ role: 'staff' })
      .eq('id', userId)

    if (updateRoleError) {
      console.error('⚠️ Error updating user role to staff:', updateRoleError)
      // ロール更新失敗でもスタッフ作成は続行
    } else {
      console.log('✅ User role updated to staff')
    }

    // 3. staffテーブルにレコード作成または更新
    let staffData: any
    
    // 既存のstaffレコードが見つかった場合、更新する（既に登録済みでも上書き）
    if (existingStaffByEmail) {
      // 既存のstaffレコードを更新
      console.log('📝 既存のstaffレコードを更新:', existingStaffByEmail.id)
      const { data: updatedStaff, error: updateError } = await supabase
        .from('staff')
        .update({
          user_id: userId,
          name: name,
          email: email,
          phone: phone || existingStaffByEmail.phone || '',
          line_name: line_name || existingStaffByEmail.line_name || '',
          x_account: x_account || existingStaffByEmail.x_account || '',
          discord_id: discord_id || existingStaffByEmail.discord_id || '',
          discord_channel_id: discord_channel_id || existingStaffByEmail.discord_channel_id || '',
          role: role || existingStaffByEmail.role || ['gm'],
          stores: stores || existingStaffByEmail.stores || [],
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingStaffByEmail.id)
        .select()
      
      if (updateError) {
        console.error('❌ Error updating staff record:', updateError)
        throw new Error(`Failed to update staff record: ${updateError.message}`)
      }
      
      if (!updatedStaff || updatedStaff.length === 0) {
        throw new Error('Staff record update returned no data')
      }
      
      staffData = Array.isArray(updatedStaff) ? updatedStaff[0] : updatedStaff
      console.log('✅ Staff record updated:', staffData.id)
    } else {
      // 新規でstaffレコードを作成
      const { data: newStaff, error: staffError } = await supabase
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

      if (staffError) {
        console.error('❌ Error creating staff record:', staffError)
        // 新規ユーザーの場合のみ削除（既存ユーザーは削除しない）
        if (!existingUser) {
          await supabase.auth.admin.deleteUser(userId)
        }
        throw new Error(`Failed to create staff record: ${staffError.message}`)
      }
      
      if (!newStaff || newStaff.length === 0) {
        throw new Error('Staff record creation returned no data')
      }
      
      staffData = Array.isArray(newStaff) ? newStaff[0] : newStaff
      console.log('✅ Staff record created:', staffData.id)
    }

    // 4. パスワード設定用のリンクを生成
    // スタッフ招待は常にinviteタイプを使用（既存ユーザーでもパスワード設定可能）
    // recoveryタイプは既存パスワードとの比較でエラーになる可能性があるため
    console.log('📧 スタッフ招待リンクを生成（inviteタイプ）')
    const { data: inviteLinkData, error: inviteLinkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
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
    const SITE_URL = Deno.env.get('SITE_URL') || 'https://mmq-yoyaq.vercel.app'
    // 送信元アドレスを設定（認証済みドメインを使用）
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'MMQ <noreply@mmq.game>'
    
    console.log('📧 メール送信設定:', { 
      hasApiKey: !!RESEND_API_KEY, 
      fromEmail,
      to: email,
      siteUrl: SITE_URL
    })
    
    if (!RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not set, skipping email')
      // APIキーがない場合はエラーを返す（メール送信は必須）
      return new Response(
        JSON.stringify({
          success: false,
          error: 'メール送信サービスが設定されていません。管理者に連絡してください。',
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
          status: 500
        }
      )
    }
    
    // メール送信処理
    let emailSent = false
    let emailError: string | null = null
    
    try {
      console.log('📨 メール送信開始:', { from: fromEmail, to: email })
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: existingStaffByEmail && existingStaffByEmail.user_id 
            ? '【MMQ】スタッフ招待メール（再送信）' 
            : existingUser 
              ? '【MMQ】スタッフアカウント登録完了' 
              : '【MMQ】スタッフアカウント招待',
            html: existingStaffByEmail && existingStaffByEmail.user_id
              ? `<h2>【MMQ】スタッフ招待メール（再送信）</h2>
              
<p>こんにちは、${name}さん</p>

<p>謎解きカフェ・バーMMQのスタッフ管理システムへの招待メールを再送信しました。</p>

<p>既に登録済みのスタッフですが、下のリンクからパスワードを設定して、スタッフページにアクセスできます。</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">パスワードを設定する</a>
</p>

<p style="font-size: 12px; color: #666;">
  または、以下のリンクをコピーしてブラウザに貼り付けてください：<br>
  <a href="${inviteLink}">${inviteLink}</a>
</p>

<h3>📋 スタッフとしてできること</h3>
<ul>
  <li>シフト提出</li>
  <li>スケジュール確認</li>
  <li>予約確認</li>
</ul>

<hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

<p style="color: #666; font-size: 12px;">
  <strong>⚠️ 注意事項</strong><br>
  • 既に登録済みのスタッフですが、招待メールを再送信しました<br>
  • 心当たりがない場合は無視してください
</p>`
              : existingUser 
                ? `<h2>【MMQ】スタッフアカウント登録完了</h2>
              
<p>こんにちは、${name}さん</p>

<p>謎解きカフェ・バーMMQのスタッフ管理システムへの登録が完了しました。</p>

<p>既存のアカウントでスタッフ機能が利用可能になりました。下のリンクからパスワードを設定して、スタッフページにアクセスできます。</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="${inviteLink}" style="display: inline-block; padding: 16px 32px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">パスワードを設定する</a>
</p>

<p style="font-size: 12px; color: #666;">
  または、以下のリンクをコピーしてブラウザに貼り付けてください：<br>
  <a href="${inviteLink}">${inviteLink}</a>
</p>

<h3>📋 スタッフとしてできること</h3>
<ul>
  <li>シフト提出</li>
  <li>スケジュール確認</li>
  <li>予約確認</li>
</ul>

<hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

<p style="color: #666; font-size: 12px;">
  <strong>⚠️ 注意事項</strong><br>
  • 既存のアカウントでスタッフ機能が利用可能になりました<br>
  • 心当たりがない場合は無視してください
</p>`
              : `<h2>【MMQ】スタッフアカウントへようこそ！</h2>
              
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

<h3>📋 スタッフとしてできること</h3>
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
</p>`,
        }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error('❌ Resend API error:', {
          status: emailResponse.status,
          statusText: emailResponse.statusText,
          error: errorText
        })
        
        // エラーレスポンスをJSONとしてパースを試みる
        let errorData: any
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }
        
        console.error('❌ メール送信失敗の詳細:', JSON.stringify(errorData, null, 2))
        emailError = `メール送信に失敗しました: ${errorData.message || errorText} (Status: ${emailResponse.status})`
        throw new Error(emailError)
      }

      const emailData = await emailResponse.json()
      console.log('✅ メール送信成功:', {
        emailId: emailData.id,
        to: email,
        from: fromEmail
      })
      emailSent = true
    } catch (emailErrorCaught: any) {
      console.error('❌ メール送信エラー:', {
        error: emailErrorCaught.message,
        stack: emailErrorCaught.stack,
        to: email,
        from: fromEmail
      })
      emailError = emailErrorCaught.message || 'メール送信に失敗しました'
      // メール送信失敗はエラーとしない（ユーザーとスタッフレコードは作成済み）
      // ただし、レスポンスにはエラー情報を含める
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Staff invited successfully',
        data: {
          user_id: userId,
          staff_id: staffData.id,
          email: email,
          name: name,
          email_sent: emailSent,
          email_error: emailError || null,
          invite_link: inviteLink
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

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error)
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

