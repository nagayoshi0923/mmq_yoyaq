// スタッフ招待API
import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface InviteStaffRequest {
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

export interface InviteStaffResponse {
  success: boolean
  message: string
  data?: {
    user_id: string
    staff_id: string
    email: string
    name: string
  }
  error?: string
}

/**
 * スタッフを招待
 * - auth.usersにユーザー作成
 * - usersテーブルにstaffロールで作成
 * - staffテーブルにuser_id付きで作成
 * - 招待メールを送信
 */
export async function inviteStaff(request: InviteStaffRequest): Promise<InviteStaffResponse> {
  try {
    // 現在のセッションを取得
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('ログインが必要です')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/invite-staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'スタッフの招待に失敗しました')
    }

    return await response.json()
  } catch (error) {
    console.error('❌ Staff invite error:', error)
    throw error
  }
}

