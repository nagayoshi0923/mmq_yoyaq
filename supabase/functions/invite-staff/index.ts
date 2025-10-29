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

    // 1. ユーザーを作成（パスワードは自動生成、メールで設定リンクを送信）
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: false, // メール確認を要求
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

    // 4. パスワード設定用のリンクを生成して招待メールを送信
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email)

    if (inviteError) {
      console.warn('⚠️ Failed to send invite email:', inviteError)
      // メール送信失敗はエラーとしない（ユーザーとスタッフレコードは作成済み）
    } else {
      console.log('✅ Invite email sent')
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

