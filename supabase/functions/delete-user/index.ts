// ユーザー削除機能
// 管理者がユーザーを削除する際に使用
// auth.users から削除すると、外部キー制約により public.users も自動的に削除される

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface DeleteUserRequest {
  userId: string
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

    const { userId }: DeleteUserRequest = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーIDが必要です'
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          status: 400
        }
      )
    }

    console.log('🗑️ User deletion request:', { userId })

    // 1. ユーザー情報を取得（削除前の確認用）
    const { data: userData, error: getUserError } = await supabase.auth.admin.getUserById(userId)
    
    if (getUserError) {
      console.error('❌ Error getting user:', getUserError)
      return new Response(
        JSON.stringify({
          success: false,
          error: `ユーザーの取得に失敗しました: ${getUserError.message}`
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          status: 404
        }
      )
    }

    if (!userData.user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ユーザーが見つかりませんでした'
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          status: 404
        }
      )
    }

    const userEmail = userData.user.email || 'unknown'

    console.log('📧 Deleting user:', { userId, email: userEmail })

    // 2. 関連データを明示的に削除（念のため）
    // 2-1. customers テーブルから削除
    const { error: deleteCustomersError } = await supabase
      .from('customers')
      .delete()
      .eq('user_id', userId)
    
    if (deleteCustomersError) {
      console.warn('⚠️ Warning: Failed to delete customers:', deleteCustomersError)
      // エラーでも続行（外部キー制約で削除される可能性があるため）
    } else {
      console.log('✅ Customers deleted')
    }

    // 2-2. staff テーブルの user_id を NULL に設定（既に SET NULL になっているはずだが念のため）
    const { error: updateStaffError } = await supabase
      .from('staff')
      .update({ user_id: null })
      .eq('user_id', userId)
    
    if (updateStaffError) {
      console.warn('⚠️ Warning: Failed to update staff:', updateStaffError)
    } else {
      console.log('✅ Staff user_id set to NULL')
    }

    // 3. auth.users から削除
    // 外部キー制約により、public.users も自動的に削除される（CASCADE）
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('❌ Error deleting user:', deleteError)
      
      // 外部キー制約エラーの場合、より詳細なメッセージを返す
      if (deleteError.message.includes('foreign key') || deleteError.message.includes('23503')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'このユーザーは他のデータから参照されているため削除できません。先に関連データを削除してください。',
            details: deleteError.message
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            status: 409
          }
        )
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `ユーザーの削除に失敗しました: ${deleteError.message}`
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

    console.log('✅ User deleted successfully:', { userId, email: userEmail })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'ユーザーを削除しました',
        data: {
          userId,
          email: userEmail
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
    console.error('❌ Unexpected error:', error)
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

