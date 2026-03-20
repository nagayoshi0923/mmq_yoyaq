// 自分自身のアカウント削除機能（退会）
// 顧客が自分のアカウントを削除する際に使用

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, maskEmail, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()

/** SYNC: src/lib/reservationWithdrawalGuard.ts の RESERVATION_STATUSES_BLOCKING_WITHDRAWAL */
const RESERVATION_STATUSES_BLOCKING_WITHDRAWAL = [
  'pending',
  'confirmed',
  'gm_confirmed',
  'pending_gm',
  'pending_store',
] as const

// サービスロールクライアント（管理操作用）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    // CORSプリフライト
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // ============================================
    // 認証チェック: JWTからユーザーを取得
    // ============================================
    const authHeader = req.headers.get('Authorization')
    console.log('🔑 Auth header present:', !!authHeader)
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('⚠️ 認証ヘッダーがありません')
      return new Response(
        JSON.stringify({
          success: false,
          error: '認証が必要です'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // JWTトークンを抽出
    const token = authHeader.replace('Bearer ', '')
    console.log('🔍 Verifying JWT token...')
    
    // Service Role クライアントでJWTを検証してユーザー情報を取得
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.warn('⚠️ 認証エラー:', authError?.message, authError?.status)
      return new Response(
        JSON.stringify({
          success: false,
          error: '認証に失敗しました'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('✅ User verified:', user.id)

    const userId = user.id

    // 未来の公演予約（進行中〜確定）がある場合は退会不可
    const { data: customerRows, error: customersLookupError } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)

    if (customersLookupError) {
      console.error('❌ customers lookup for withdrawal guard:', customersLookupError)
      return new Response(
        JSON.stringify({
          success: false,
          error: '予約状況の確認に失敗しました。しばらくしてから再度お試しください。',
          code: 'RESERVATION_CHECK_FAILED',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const customerIds = (customerRows ?? []).map((r) => r.id)
    if (customerIds.length > 0) {
      const nowIso = new Date().toISOString()
      const { count, error: resvError } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .gte('requested_datetime', nowIso)
        .in('status', [...RESERVATION_STATUSES_BLOCKING_WITHDRAWAL])

      if (resvError) {
        console.error('❌ reservation check for withdrawal:', resvError)
        return new Response(
          JSON.stringify({
            success: false,
            error: '予約状況の確認に失敗しました。しばらくしてから再度お試しください。',
            code: 'RESERVATION_CHECK_FAILED',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (count && count > 0) {
        console.warn('⚠️ Self-delete blocked: active future reservations', { userId, count })
        return new Response(
          JSON.stringify({
            success: false,
            error:
              '公演日時がまだ来ていない予約があります。予約をキャンセルしたうえで退会手続きを行ってください。',
            code: 'ACTIVE_RESERVATIONS',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }
    const userEmail = user.email || 'unknown'
    const maskedEmail = maskEmail(userEmail)

    console.log('🗑️ Self-deletion request:', { userId, email: maskedEmail })

    // ============================================
    // 監査ログを記録（削除前）
    // ============================================
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: userId,
          action: 'SELF_DELETE_INITIATED',
          table_name: 'auth.users',
          record_id: userId,
          old_values: {
            email_masked: maskedEmail
          },
          new_values: null
        })
      console.log('📝 監査ログ記録: SELF_DELETE_INITIATED')
    } catch (auditError) {
      // 監査ログの失敗は削除処理を止めない
      console.warn('⚠️ 監査ログ記録失敗:', auditError)
    }

    // ============================================
    // 関連データを削除
    // ============================================
    
    // 1. customers テーブルから削除
    const { data: customersData } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
    
    if (customersData && customersData.length > 0) {
      const { error: deleteCustomersError } = await supabase
        .from('customers')
        .delete()
        .eq('user_id', userId)
      
      if (deleteCustomersError) {
        console.warn('⚠️ Warning: Failed to delete customers:', deleteCustomersError)
      } else {
        console.log(`✅ Deleted ${customersData.length} customer record(s)`)
      }
    }

    // 2. staff テーブルの user_id を NULL に設定
    const { data: staffData } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
    
    if (staffData && staffData.length > 0) {
      const { error: updateStaffError } = await supabase
        .from('staff')
        .update({ user_id: null })
        .eq('user_id', userId)
      
      if (updateStaffError) {
        console.warn('⚠️ Warning: Failed to update staff:', updateStaffError)
      } else {
        console.log(`✅ Set user_id to NULL for ${staffData.length} staff record(s)`)
      }
    }

    // 3. public.users テーブルから削除
    const { error: deleteUsersError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
    
    if (deleteUsersError) {
      console.warn('⚠️ Warning: Failed to delete from users table:', deleteUsersError)
    } else {
      console.log('✅ Deleted from users table')
    }

    // 4. auth.users から削除（最重要）
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('❌ Error deleting user:', deleteError)
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'アカウントの削除に失敗しました'
        }),
        { status: 500, headers: corsHeaders }
      )
    }

    console.log('✅ User self-deleted successfully:', { userId, email: maskedEmail })

    // ============================================
    // 監査ログを記録（削除完了）
    // ============================================
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: null, // ユーザーは削除されたのでnull
          action: 'SELF_DELETE_COMPLETED',
          table_name: 'auth.users',
          record_id: userId,
          old_values: {
            email_masked: maskedEmail,
            deleted_customers: customersData?.length || 0,
            unlinked_staff: staffData?.length || 0
          },
          new_values: null
        })
      console.log('📝 監査ログ記録: SELF_DELETE_COMPLETED')
    } catch (auditError) {
      console.warn('⚠️ 監査ログ記録失敗:', auditError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'アカウントを削除しました'
      }),
      { status: 200, headers: corsHeaders }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Unexpected error:', sanitizeErrorMessage(errorMessage))
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(errorMessage)
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})
