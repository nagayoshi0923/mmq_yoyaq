/**
 * 組織招待 API
 */
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'
import type { OrganizationInvitation } from '@/types'

/**
 * 招待を作成
 */
export async function createInvitation(params: {
  organization_id: string
  email: string
  name: string
  role?: string[]
  created_by?: string
}): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    // トークン生成（クライアント側で生成）
    const token = crypto.randomUUID() + '-' + Date.now().toString(36)
    
    // 有効期限: 7日後
    const expires_at = new Date()
    expires_at.setDate(expires_at.getDate() + 7)

    const { data, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: params.organization_id,
        email: params.email.toLowerCase().trim(),
        name: params.name.trim(),
        role: params.role || ['スタッフ'],
        token,
        expires_at: expires_at.toISOString(),
        created_by: params.created_by,
      })
      .select(`
        *,
        organization:organizations(*)
      `)
      .single()

    if (error) throw error
    return { data: data as OrganizationInvitation, error: null }
  } catch (error) {
    logger.error('Failed to create invitation:', error)
    return { data: null, error: error as Error }
  }
}

/**
 * トークンで招待を取得
 */
export async function getInvitationByToken(
  token: string
): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('token', token)
      .single()

    if (error) throw error
    return { data: data as OrganizationInvitation, error: null }
  } catch (error) {
    logger.error('Failed to get invitation:', error)
    return { data: null, error: error as Error }
  }
}

/**
 * 招待を受諾（パスワード設定 & ユーザー作成）
 * 🔒 アトミック処理により競合状態を防止
 */
export async function acceptInvitation(params: {
  token: string
  password: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    // 🔒 1. アトミックに招待を受諾（競合状態を防止）
    // この時点で招待が「使用済み」になり、他のリクエストは失敗する
    const { data: atomicResult, error: atomicError } = await supabase
      .rpc('accept_invitation_atomic', { p_token: params.token })

    if (atomicError) {
      logger.error('Failed to accept invitation atomically:', atomicError)
      return { success: false, error: '招待の処理中にエラーが発生しました' }
    }

    const invitationResult = atomicResult?.[0] || atomicResult
    if (!invitationResult?.success) {
      return { success: false, error: invitationResult?.error_message || '招待の受諾に失敗しました' }
    }

    // 2. 招待情報を取得（詳細情報が必要な場合）
    const { data: invitation, error: inviteError } = await getInvitationByToken(params.token)
    if (inviteError || !invitation) {
      // アトミック処理は成功しているが、詳細取得に失敗
      // invitationResultの情報を使用
      logger.warn('Could not fetch invitation details, using atomic result')
    }

    const invitationData = invitation || {
      id: invitationResult.id,
      email: invitationResult.email,
      role: invitationResult.role,
      organization_id: invitationResult.organization_id,
      name: '',
    }

    // 3. Supabase Auth でユーザーを作成
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invitationData.email,
      password: params.password,
    })

    if (authError) {
      // 既存ユーザーの場合
      if (authError.message.includes('already registered')) {
        return { success: false, error: 'このメールアドレスは既に登録されています。ログインしてください。' }
      }
      throw authError
    }

    const userId = authData.user?.id
    if (!userId) {
      return { success: false, error: 'ユーザーの作成に失敗しました' }
    }

    // 4. users テーブルにレコードを作成
    const userRole = Array.isArray(invitationData.role) 
      ? (invitationData.role.some((r: string) => r.includes('管理者')) ? 'admin' : 'staff')
      : (typeof invitationData.role === 'string' && invitationData.role.includes('管理者') ? 'admin' : 'staff')
    
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: invitationData.email,
        role: userRole,
        organization_id: invitationData.organization_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (userError) {
      logger.error('Failed to create user record:', userError)
    }

    // 5. staff テーブルにレコードを作成
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .insert({
        name: invitationData.name || invitationData.email?.split('@')[0] || '',
        email: invitationData.email,
        user_id: userId,
        organization_id: invitationData.organization_id,
        role: invitationData.role,
        status: 'active',
        stores: [],
        ng_days: [],
        want_to_learn: [],
        available_scenarios: [],
        availability: [],
        experience: 0,
        special_scenarios: [],
      })
      .select()
      .single()

    if (staffError) {
      logger.error('Failed to create staff record:', staffError)
      // スタッフ作成に失敗しても続行（後で修正可能）
    }

    // 6. 招待にstaff_idを紐付け（アトミック処理でaccepted_atは既に設定済み）
    if (staffData?.id && invitationData.id) {
      const { error: updateError } = await supabase
        .from('organization_invitations')
        .update({ staff_id: staffData.id })
        .eq('id', invitationData.id)

      if (updateError) {
        logger.error('Failed to link staff to invitation:', updateError)
      }
    }

    return { success: true, error: null }
  } catch (error) {
    logger.error('Failed to accept invitation:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * 組織の招待一覧を取得
 */
export async function getInvitationsByOrganization(
  organizationId: string
): Promise<{ data: OrganizationInvitation[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data: data as OrganizationInvitation[], error: null }
  } catch (error) {
    logger.error('Failed to get invitations:', error)
    return { data: [], error: error as Error }
  }
}

/**
 * 招待を削除
 */
export async function deleteInvitation(
  invitationId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('organization_invitations')
      .delete()
      .eq('id', invitationId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    logger.error('Failed to delete invitation:', error)
    return { success: false, error: error as Error }
  }
}

/**
 * 招待を再送信（新しいトークンを生成）
 */
export async function resendInvitation(
  invitationId: string
): Promise<{ data: OrganizationInvitation | null; error: Error | null }> {
  try {
    const token = crypto.randomUUID() + '-' + Date.now().toString(36)
    const expires_at = new Date()
    expires_at.setDate(expires_at.getDate() + 7)

    const { data, error } = await supabase
      .from('organization_invitations')
      .update({
        token,
        expires_at: expires_at.toISOString(),
      })
      .eq('id', invitationId)
      .select(`
        *,
        organization:organizations(*)
      `)
      .single()

    if (error) throw error
    return { data: data as OrganizationInvitation, error: null }
  } catch (error) {
    logger.error('Failed to resend invitation:', error)
    return { data: null, error: error as Error }
  }
}

