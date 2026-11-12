import '../_shared/outbound-guard.ts'
// ユーザー削除機能
// 管理者がユーザーを削除する際に使用
// auth.users から削除すると、外部キー制約により public.users も自動的に削除される

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, maskEmail, sanitizeErrorMessage, getAnonKey, getServiceRoleKey } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const SUPABASE_ANON_KEY = getAnonKey()

// サービスロールクライアント（管理操作用）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface DeleteUserRequest {
  userId: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    // CORSプリフライト
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // ============================================
    // 認証チェック: 呼び出し元が管理者かどうか確認
    // ============================================
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.warn('⚠️ 認証ヘッダーがありません')
      return new Response(
        JSON.stringify({
          success: false,
          error: '認証が必要です'
        }),
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
        JSON.stringify({
          success: false,
          error: '認証に失敗しました'
        }),
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
        JSON.stringify({
          success: false,
          error: 'ユーザー情報の取得に失敗しました'
        }),
        { status: 403, headers: corsHeaders }
      )
    }

    // 管理者またはライセンス管理者のみ許可
    if (callerData.role !== 'admin' && callerData.role !== 'license_admin') {
      console.warn('⚠️ 権限エラー: ユーザー', maskEmail(callerUser.email || ''), 'は管理者ではありません')
      return new Response(
        JSON.stringify({
          success: false,
          error: '管理者権限が必要です'
        }),
        { status: 403, headers: corsHeaders }
      )
    }

    console.log('✅ 認証成功: 管理者', maskEmail(callerUser.email || ''))

    // ============================================
    // ここから既存のユーザー削除処理
    // ============================================
    const { userId }: DeleteUserRequest = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーIDが必要です'
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // 自分自身は削除できない
    if (userId === callerUser.id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: '自分自身を削除することはできません'
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    // ============================================
    // 組織ID検証: 自組織のユーザーのみ削除可能
    // ============================================
    // 呼び出し元の組織IDを取得
    const { data: callerStaff } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('user_id', callerUser.id)
      .maybeSingle()

    const callerOrgId = callerStaff?.organization_id

    // 削除対象の組織IDを確認（staffまたはcustomersから）
    if (callerOrgId) {
      const { data: targetStaff } = await supabase
        .from('staff')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()
      
      const { data: targetCustomer } = await supabase
        .from('customers')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle()
      
      const targetOrgId = targetStaff?.organization_id || targetCustomer?.organization_id
      
      if (targetOrgId && targetOrgId !== callerOrgId) {
        console.warn('⚠️ 組織ID不一致: 他組織ユーザー削除試行', {
          caller: maskEmail(callerUser.email || ''),
          callerOrg: callerOrgId,
          targetOrg: targetOrgId
        })
        return new Response(
          JSON.stringify({
            success: false,
            error: '自組織のユーザーのみ削除できます'
          }),
          { status: 403, headers: corsHeaders }
        )
      }
    }

    console.log('🗑️ User deletion request by admin:', { targetUserId: userId })

    // ============================================
    // 監査ログを記録（削除前）
    // ============================================
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: callerUser.id,
          action: 'USER_DELETE_INITIATED',
          table_name: 'auth.users',
          record_id: userId,
          old_values: {
            target_user_id: userId,
            caller_organization_id: callerOrgId
          },
          new_values: null
        })
      console.log('📝 監査ログ記録: USER_DELETE_INITIATED')
    } catch (auditError) {
      // 監査ログの失敗は削除処理を止めない
      console.warn('⚠️ 監査ログ記録失敗:', auditError)
    }

    // 1. ユーザー情報を取得（削除前の確認用）
    const { data: userData, error: getUserError } = await supabase.auth.admin.getUserById(userId)
    
    if (getUserError) {
      console.error('❌ Error getting user:', getUserError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーの取得に失敗しました'
        }),
        { status: 404, headers: corsHeaders }
      )
    }

    if (!userData.user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーが見つかりませんでした'
        }),
        { status: 404, headers: corsHeaders }
      )
    }

    const userEmail = userData.user.email || 'unknown'
    const maskedEmail = maskEmail(userEmail)

    console.log('📧 Deleting user:', { userId, email: maskedEmail })

    // 2. 関連データを確認・削除
    // 2-1. customers テーブルから削除（CASCADEで自動削除されるが、明示的に削除）
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

    // 2-2. staff テーブルの user_id を NULL に設定（外部キー制約でSET NULLされるが、明示的に設定）
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

    // 2-3. public.users テーブルから削除（CASCADEで自動削除されるが、明示的に削除）
    const { error: deleteUsersError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
    
    if (deleteUsersError) {
      console.warn('⚠️ Warning: Failed to delete from users table:', deleteUsersError)
      // エラーでも続行（auth.usersから削除すればCASCADEで削除される）
    } else {
      console.log('✅ Deleted from users table')
    }

    // 3. auth.users から削除（最重要）
    // これにより、外部キー制約により public.users も自動的に削除される（CASCADE）
    // また、customers も自動的に削除される（CASCADE）
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('❌ Error deleting user:', deleteError)
      
      // 外部キー制約エラーの場合、より詳細なメッセージを返す
      if (deleteError.message.includes('foreign key') || deleteError.message.includes('23503')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'このユーザーは他のデータから参照されているため削除できません。先に関連データを削除してください。',
            // details は内部情報になり得るため返さない
          }),
          { status: 409, headers: corsHeaders }
        )
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーの削除に失敗しました'
        }),
        { status: 500, headers: corsHeaders }
      )
    }

    console.log('✅ User deleted successfully:', { userId, email: maskedEmail })

    // ============================================
    // 監査ログを記録（削除完了）
    // ============================================
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: callerUser.id,
          action: 'USER_DELETE_COMPLETED',
          table_name: 'auth.users',
          record_id: userId,
          old_values: {
            target_user_id: userId,
            target_email_masked: maskedEmail,
            deleted_customers: customersData?.length || 0,
            unlinked_staff: staffData?.length || 0
          },
          new_values: null
        })
      console.log('📝 監査ログ記録: USER_DELETE_COMPLETED')
    } catch (auditError) {
      console.warn('⚠️ 監査ログ記録失敗:', auditError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'ユーザーを削除しました',
        data: {
          userId,
          // レスポンスにはマスキングしたメールを返す
          email: maskedEmail
        }
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
