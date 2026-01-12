import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://mmq-yoyaq.vercel.app').replace(/\/$/, '')
const SET_PASSWORD_REDIRECT = `${SITE_URL}/#/set-password`
const RESET_PASSWORD_REDIRECT = `${SITE_URL}/#/reset-password`

// 許可するオリジン（本番環境用）
const ALLOWED_ORIGINS = [
  'https://mmq-yoyaq.vercel.app',
  'https://mmq-yoyaq-git-main-nagayoshi0923s-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

// サービスロールクライアント（管理操作用）
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
  organization_id?: string  // マルチテナント対応
}

// メールアドレスをマスキングするヘルパー関数
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : '***'
  return `${maskedLocal}@${domain}`
}

// 名前をマスキングするヘルパー関数
function maskName(name: string): string {
  if (!name || name.length === 0) return '***'
  return name.slice(0, 1) + '***'
}

// CORSヘッダーを生成
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ============================================
    // 認証チェック: 呼び出し元が管理者かどうか確認
    // ============================================
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.warn('⚠️ 認証ヘッダーがありません')
      return new Response(
        JSON.stringify({ success: false, error: '認証が必要です' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // 呼び出し元ユーザーの認証を検証
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })
    
    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser()
    
    if (authError || !callerUser) {
      console.warn('⚠️ 認証エラー:', authError?.message)
      return new Response(
        JSON.stringify({ success: false, error: '認証に失敗しました' }),
        { status: 401, headers: corsHeaders }
      )
    }

    // 呼び出し元ユーザーのロールを確認
    const { data: callerData, error: callerError } = await supabase
      .from('users')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (callerError || !callerData) {
      console.warn('⚠️ ユーザーロール取得エラー:', callerError?.message)
      return new Response(
        JSON.stringify({ success: false, error: 'ユーザー情報の取得に失敗しました' }),
        { status: 403, headers: corsHeaders }
      )
    }

    // 管理者またはライセンス管理者のみ許可
    if (callerData.role !== 'admin' && callerData.role !== 'license_admin') {
      console.warn('⚠️ 権限エラー: ユーザー', maskEmail(callerUser.email || ''), 'は管理者ではありません')
      return new Response(
        JSON.stringify({ success: false, error: '管理者権限が必要です' }),
        { status: 403, headers: corsHeaders }
      )
    }

    console.log('✅ 認証成功: 管理者', maskEmail(callerUser.email || ''))

    // ============================================
    // ここから既存のスタッフ招待処理
    // ============================================
    const payload: InviteStaffRequest = await req.json()
    const email = payload.email?.trim()
    const name = payload.name?.trim()

    if (!email || !name) {
      return new Response(
        JSON.stringify({ success: false, error: 'email と name は必須です' }),
        { status: 400, headers: corsHeaders }
      )
    }

    // ログにはマスキングした情報のみ出力
    console.log('📨 Staff invitation request:', { email: maskEmail(email), name: maskName(name) })

    const normalizedEmail = email.toLowerCase()
    const { data: userList, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
      throw new Error(`ユーザー一覧の取得に失敗しました: ${listError.message}`)
    }

    const existingUser = userList?.users.find((user) => user.email?.toLowerCase() === normalizedEmail)
    let userId: string
    let isNewUser = false

    let currentRole = 'staff'
    if (existingUser) {
      userId = existingUser.id
      console.log('✅ Existing auth user found:', userId)
      
      // 既存ユーザーの現在のロールを確認（adminなら上書きしない）
      const { data: currentUserData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single()
      
      if (currentUserData && currentUserData.role === 'admin') {
        currentRole = 'admin'
        console.log('ℹ️ User is admin, keeping admin role')
      }
    } else {
      console.log('🆕 Creating auth user:', maskEmail(email))
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: false,
        password: crypto.randomUUID(),
        user_metadata: {
          full_name: name,
          invited_as: 'staff',
        },
      })

      if (authError || !authData?.user?.id) {
        throw new Error(`Authユーザーの作成に失敗しました: ${authError?.message || 'unknown error'}`)
      }

      userId = authData.user.id
      isNewUser = true
      console.log('✅ Auth user created:', userId)
    }

    const now = new Date().toISOString()
    // デフォルト organization_id: クインズワルツ
    const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001'
    const userOrganizationId = payload.organization_id || DEFAULT_ORG_ID
    
    const userRecordPayload: Record<string, unknown> = {
      id: userId,
      email,
      role: currentRole,
      organization_id: userOrganizationId,  // マルチテナント対応
      updated_at: now,
    }
    if (isNewUser) {
      userRecordPayload.created_at = now
    }

    const { error: upsertUserError } = await supabase
      .from('users')
      .upsert(userRecordPayload, { onConflict: 'id' })

    if (upsertUserError) {
      // 新規ユーザーの場合、Authユーザーを削除してロールバック
      if (isNewUser) {
        console.warn('⚠️ usersテーブル更新失敗、Authユーザーを削除します')
        await supabase.auth.admin.deleteUser(userId).catch((deleteErr) => {
          console.error('❌ Authユーザー削除失敗:', deleteErr)
        })
      }
      throw new Error(`usersテーブルの更新に失敗しました: ${upsertUserError.message}`)
    }

    const staffFields = 'id, phone, line_name, x_account, discord_id, discord_channel_id, role, stores, status'
    let staffRecord = null

    const { data: staffByUser, error: staffByUserError } = await supabase
      .from('staff')
      .select(staffFields)
      .eq('user_id', userId)
      .maybeSingle()

    if (staffByUserError && staffByUserError.code !== 'PGRST116') {
      throw new Error(`staffテーブルの取得に失敗しました: ${staffByUserError.message}`)
    }

    if (staffByUser) {
      staffRecord = staffByUser
    } else {
      const { data: staffByEmail, error: staffByEmailError } = await supabase
        .from('staff')
        .select(staffFields)
        .eq('email', email)
        .maybeSingle()

      if (staffByEmailError && staffByEmailError.code !== 'PGRST116') {
        throw new Error(`staffテーブル（email検索）の取得に失敗しました: ${staffByEmailError.message}`)
      }

      if (staffByEmail) {
        staffRecord = staffByEmail
      }
    }

    let staffId: string
    const organizationId = payload.organization_id || DEFAULT_ORG_ID
    
    const staffPayload = {
      user_id: userId,
      name,
      email,
      phone: payload.phone ?? staffRecord?.phone ?? '',
      line_name: payload.line_name ?? staffRecord?.line_name ?? '',
      x_account: payload.x_account ?? staffRecord?.x_account ?? '',
      discord_id: payload.discord_id ?? staffRecord?.discord_id ?? '',
      discord_channel_id: payload.discord_channel_id ?? staffRecord?.discord_channel_id ?? '',
      role: payload.role ?? staffRecord?.role ?? ['gm'],
      stores: payload.stores ?? staffRecord?.stores ?? [],
      status: staffRecord?.status ?? 'active',
      organization_id: organizationId,  // マルチテナント対応
      updated_at: now,
    }

    if (staffRecord) {
      const { data: updatedStaff, error: updateStaffError } = await supabase
        .from('staff')
        .update(staffPayload)
        .eq('id', staffRecord.id)
        .select('id')
        .single()

      if (updateStaffError) {
        throw new Error(`スタッフ情報の更新に失敗しました: ${updateStaffError.message}`)
      }

      staffId = updatedStaff.id
      console.log('📝 Staff record updated:', staffId)
    } else {
      const { data: insertedStaff, error: insertStaffError } = await supabase
        .from('staff')
        .insert({
          ...staffPayload,
          experience: 0,
          availability: [],
          ng_days: [],
          notes: '',
          created_at: now,
        })
        .select('id')
        .single()

      if (insertStaffError || !insertedStaff) {
        if (isNewUser) {
          await supabase.auth.admin.deleteUser(userId).catch(() => {
            console.warn('⚠️ 作成失敗時のAuthユーザー削除に失敗しました')
          })
        }
        throw new Error(`スタッフ情報の作成に失敗しました: ${insertStaffError?.message || 'unknown error'}`)
      }

      staffId = insertedStaff.id
      console.log('🆕 Staff record created:', staffId)
    }

    // ------------------------------------------------------------------
    // customersテーブルにレコードを作成・更新
    // スタッフも顧客として登録することで、プライベート予約時にも履歴を残せるようにする
    // ------------------------------------------------------------------
    if (userId) {
      console.log('🔄 Checking/Creating customer record for staff:', userId)
      
      const { data: existingCustomer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()
      
      if (!existingCustomer && !customerError) {
        // user_idで紐付く顧客データがない場合、emailで検索
        const { data: customerByEmail } = await supabase
          .from('customers')
          .select('id')
          .eq('email', email)
          .maybeSingle()
          
        if (customerByEmail) {
          // emailで一致する場合はuser_idを紐付け
          await supabase
            .from('customers')
            .update({ user_id: userId })
            .eq('id', customerByEmail.id)
          console.log('🔗 Linked existing customer record to staff user:', customerByEmail.id)
        } else {
          // 新規作成
          const { error: createCustomerError } = await supabase
            .from('customers')
            .insert({
              user_id: userId,
              name: name,
              email: email,
              organization_id: organizationId,  // マルチテナント対応
              visit_count: 0,
              total_spent: 0,
              created_at: now,
              updated_at: now
            })
          
          if (createCustomerError) {
            console.warn('⚠️ Failed to create customer record for staff:', createCustomerError)
          } else {
            console.log('✅ Created new customer record for staff')
          }
        }
      } else if (existingCustomer) {
        console.log('✅ Customer record already exists for staff:', existingCustomer.id)
      }
    }

    const linkType = isNewUser ? 'invite' : 'recovery'
    const redirectTo = isNewUser ? SET_PASSWORD_REDIRECT : RESET_PASSWORD_REDIRECT
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: linkType,
      email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      // 招待リンク生成失敗時のロールバック
      if (isNewUser) {
        console.warn('⚠️ 招待リンク生成失敗、作成したデータをロールバックします')
        // staffテーブルから削除
        await supabase.from('staff').delete().eq('user_id', userId).catch((err) => {
          console.error('❌ staffテーブル削除失敗:', err)
        })
        // usersテーブルから削除
        await supabase.from('users').delete().eq('id', userId).catch((err) => {
          console.error('❌ usersテーブル削除失敗:', err)
        })
        // Authユーザーを削除
        await supabase.auth.admin.deleteUser(userId).catch((err) => {
          console.error('❌ Authユーザー削除失敗:', err)
        })
        console.log('✅ ロールバック完了')
      }
      throw new Error(`招待リンクの生成に失敗しました: ${linkError?.message || 'invalid response'}`)
    }

    const inviteLink = linkData.properties.action_link
    console.log('🔗 Invitation link generated (type=%s)', linkType)

    // 組織設定からメール設定を取得
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ'
    
    if (organizationId) {
      const emailSettings = await getEmailSettings(supabase, organizationId)
      if (emailSettings.resendApiKey) {
        resendApiKey = emailSettings.resendApiKey
        senderEmail = emailSettings.senderEmail
        senderName = emailSettings.senderName
      }
    }
    
    const fromEmail = `${senderName} <${senderEmail}>`
    let emailSent = false
    let emailError: string | null = null

    if (!resendApiKey) {
      emailError = 'RESEND_API_KEY が未設定のためメール送信をスキップしました'
      console.warn(emailError)
    } else {
      const actionWord = isNewUser ? '設定' : 'リセット'
      const emailSubject = isNewUser
        ? '【MMQ】スタッフアカウント招待'
        : '【MMQ】スタッフアカウント登録完了'
      const introLine = isNewUser
        ? 'スタッフ管理システムへのアカウントを発行しました。'
        : 'スタッフ機能をご利用いただけるようになりました。'

      const html = `
        <h2>${emailSubject}</h2>
        <p>こんにちは、${name}さん</p>
        <p>${introLine} 下のボタンからパスワードを${actionWord}してログインしてください。</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${inviteLink}" style="display:inline-block;padding:14px 28px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
            パスワードを${actionWord}する
          </a>
        </p>
        <p style="font-size:12px;color:#666;">
          リンクが開けない場合は次のURLをコピーしてください：<br />
          <a href="${inviteLink}">${inviteLink}</a>
        </p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p style="font-size:12px;color:#666;">
          ※ このリンクは一定時間で無効になります。<br />
          ※ 心当たりがない場合はこのメールを破棄してください。
        </p>
      `

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: emailSubject,
            html,
          }),
        })

        if (!emailResponse.ok) {
          emailError = `Resend API error (${emailResponse.status})`
          const errorBody = await emailResponse.text()
          console.error('❌ Resend error:', emailError, errorBody)
        } else {
          emailSent = true
          console.log('✅ Invitation email sent to:', maskEmail(email))
        }
      } catch (err: any) {
        emailError = err?.message || 'メール送信中に予期しないエラーが発生しました'
        console.error('❌ Failed to send email:', emailError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Staff invited successfully',
        data: {
          user_id: userId,
          staff_id: staffId,
          email: maskEmail(email),  // レスポンスにはマスキングしたメールを返す
          name: maskName(name),     // レスポンスにはマスキングした名前を返す
          invite_link: inviteLink,
          email_sent: emailSent,
          email_error: emailError,
        },
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (error: any) {
    console.error('❌ invite-staff error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})
