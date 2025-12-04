import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://mmq-yoyaq.vercel.app').replace(/\/$/, '')
const SET_PASSWORD_REDIRECT = `${SITE_URL}/#/set-password`
const RESET_PASSWORD_REDIRECT = `${SITE_URL}/#/reset-password`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const corsHeaders = {
  ...baseHeaders,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: InviteStaffRequest = await req.json()
    const email = payload.email?.trim()
    const name = payload.name?.trim()

    if (!email || !name) {
      return new Response(
        JSON.stringify({ success: false, error: 'email と name は必須です' }),
        { status: 400, headers: baseHeaders }
      )
    }

    console.log('📨 Staff invitation request:', { email, name })

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
      console.log('🆕 Creating auth user:', email)
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
    const userRecordPayload: Record<string, unknown> = {
      id: userId,
      email,
      role: currentRole,
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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'MMQ <noreply@mmq.game>'
    let emailSent = false
    let emailError: string | null = null

    if (!RESEND_API_KEY) {
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
            'Authorization': `Bearer ${RESEND_API_KEY}`,
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
          console.log('✅ Invitation email sent')
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
          email,
          name,
          invite_link: inviteLink,
          email_sent: emailSent,
          email_error: emailError,
        },
      }),
      { status: 200, headers: baseHeaders }
    )
  } catch (error: any) {
    console.error('❌ invite-staff error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      { status: 500, headers: baseHeaders }
    )
  }
})
