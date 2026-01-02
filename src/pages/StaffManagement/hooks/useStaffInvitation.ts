import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { staffApi } from '@/lib/api'
import { inviteStaff, type InviteStaffRequest } from '@/lib/staffInviteApi'
import { staffKeys } from './useStaffQuery'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface UseStaffInvitationProps {
  onSuccess?: () => void
  onError?: (error: string) => void
}

/**
 * スタッフ招待と紐付けロジックを管理するフック
 */
export function useStaffInvitation({ onSuccess, onError }: UseStaffInvitationProps = {}) {
  const queryClient = useQueryClient()
  /**
   * メールアドレスでユーザーを検索
   */
  const searchUserByEmail = useCallback(async (email: string) => {
    try {
      const { data: user, error: searchError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('email', email)
        .single()
      
      if (searchError || !user) {
        return { found: false, error: `メールアドレス ${email} のユーザーが見つかりません` }
      }

      return { found: true, user }
    } catch (err: any) {
      logger.error('Error searching user:', err)
      return { found: false, error: err.message }
    }
  }, [])

  /**
   * スタッフを招待（新規ユーザー作成）
   */
  const handleInviteStaff = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const request: InviteStaffRequest = {
      email: formData.get('email') as string,
      name: formData.get('name') as string,
      phone: formData.get('phone') as string || undefined,
      line_name: formData.get('line_name') as string || undefined,
      x_account: formData.get('x_account') as string || undefined,
      discord_id: formData.get('discord_id') as string || undefined,
      discord_channel_id: formData.get('discord_channel_id') as string || undefined,
      role: ['gm'],
      stores: []
    }

    try {
      const result = await inviteStaff(request)
      
      if (result.success) {
        // スタッフリストを再取得
        await queryClient.invalidateQueries({ queryKey: staffKeys.all })
        showToast.success(`${request.name}さんを招待しました！`, `招待メールを${request.email}に送信しました`)
        onSuccess?.()
      } else {
        throw new Error(result.error || '招待に失敗しました')
      }
    } catch (err: any) {
      logger.error('Error inviting staff:', err)
      const errorMessage = 'スタッフの招待に失敗しました: ' + err.message
      showToast.error(errorMessage)
      onError?.(errorMessage)
    }
  }, [queryClient, onSuccess, onError])

  /**
   * 既存ユーザーと紐付け
   */
  const handleLinkExistingUser = useCallback(async (
    event: React.FormEvent<HTMLFormElement>,
    linkingStaff: Staff
  ) => {
    event.preventDefault()
    
    const formData = new FormData(event.currentTarget)
    const email = formData.get('link-email') as string

    try {
      // メールアドレスからユーザーを検索（usersテーブル経由）
      const { data: users, error: searchError } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email)
        .single()
      
      if (searchError || !users) {
        throw new Error(`メールアドレス ${email} のユーザーが見つかりません`)
      }

      // staffテーブルのuser_idを更新
      const updatedStaff = {
        ...linkingStaff,
        user_id: users.id,
        email: email
      }
      
      await staffApi.update(linkingStaff.id, updatedStaff)

      // usersテーブルのroleをstaffに更新
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'staff' })
        .eq('id', users.id)

      if (updateError) {
        logger.warn('usersテーブルの更新に失敗しました:', updateError)
      }

      // React Queryのキャッシュを更新
      queryClient.setQueryData<Staff[]>(staffKeys.all, (old = []) => {
        return old.map(s => s.id === linkingStaff.id ? updatedStaff : s)
      })
      
      // キャッシュを無効化して最新データを取得
      await queryClient.invalidateQueries({ queryKey: staffKeys.all })

      showToast.success(`${linkingStaff.name}さんを${email}と紐付けました`)
      onSuccess?.()
    } catch (err: any) {
      logger.error('Error linking user:', err)
      const errorMessage = 'ユーザーとの紐付けに失敗しました: ' + err.message
      showToast.error(errorMessage)
      onError?.(errorMessage)
    }
  }, [queryClient, onSuccess, onError])

  /**
   * 新規招待して紐付け
   */
  const handleLinkWithInvite = useCallback(async (
    event: React.FormEvent<HTMLFormElement>,
    linkingStaff: Staff
  ) => {
    event.preventDefault()
    
    const formData = new FormData(event.currentTarget)
    const email = formData.get('invite-email') as string
    
    const request: InviteStaffRequest = {
      email: email,
      name: linkingStaff.name,
      phone: linkingStaff.phone,
      line_name: linkingStaff.line_name,
      x_account: linkingStaff.x_account,
      discord_id: linkingStaff.discord_id,
      discord_channel_id: linkingStaff.discord_channel_id,
      role: linkingStaff.role || ['gm'],
      stores: linkingStaff.stores || []
    }

    try {
      // 1. 既存のスタッフのシナリオ割り当て情報を取得（GM可能・体験済み）
      const { data: existingAssignments } = await supabase
        .from('staff_scenario_assignments')
        .select('scenario_id, can_gm, has_experienced')
        .eq('staff_id', linkingStaff.id)
      
      logger.log('既存のシナリオ割り当て情報:', existingAssignments?.length || 0, '件')

      // 2. 既存のスタッフレコードを削除
      try {
        await staffApi.delete(linkingStaff.id)
        logger.log('既存スタッフレコード削除完了')
      } catch (deleteError: any) {
        // スタッフが見つからない場合（既に削除済みなど）は無視して続行
        if (deleteError.code === 'PGRST116' || deleteError.message?.includes('JSON object requested, multiple (or no) rows returned')) {
          logger.warn('削除対象のスタッフが見つかりませんでした（既に削除済みの可能性） - 処理を続行します')
        } else {
          throw deleteError
        }
      }
      
      // 3. 新規ユーザーとスタッフレコードを作成
      const result = await inviteStaff(request)
      
      if (result.success && result.data) {
        // 4. シナリオ割り当て情報を新しいスタッフIDで復元
        if (existingAssignments && existingAssignments.length > 0) {
          const newStaffId = result.data.staff_id
          const assignmentsToInsert = existingAssignments.map(assignment => ({
            staff_id: newStaffId,
            scenario_id: assignment.scenario_id,
            can_gm: assignment.can_gm,
            has_experienced: assignment.has_experienced,
            organization_id: linkingStaff.organization_id
          }))
          
          const { error: insertError } = await supabase
            .from('staff_scenario_assignments')
            .insert(assignmentsToInsert)
          
          if (insertError) {
            logger.warn('シナリオ割り当て情報の復元に失敗:', insertError)
          } else {
            logger.log('シナリオ割り当て情報を復元:', assignmentsToInsert.length, '件')
          }
        }
        
        // スタッフリストを再取得
        await queryClient.invalidateQueries({ queryKey: staffKeys.all })
        showToast.success(`${linkingStaff.name}さんを招待しました！`, `招待メールを${email}に送信しました`)
        onSuccess?.()
      } else {
        throw new Error(result.error || '招待に失敗しました')
      }
    } catch (err: any) {
      logger.error('Error inviting and linking:', err)
      const errorMessage = '招待に失敗しました: ' + err.message
      showToast.error(errorMessage)
      onError?.(errorMessage)
    }
  }, [queryClient, onSuccess, onError])

  /**
   * スタッフとアカウントの連携を解除
   */
  const handleUnlinkUser = useCallback(async (staff: Staff) => {
    if (!staff.user_id) {
      showToast.warning('このスタッフは既にアカウントと連携されていません')
      return
    }

    try {
      // staffテーブルのuser_idをNULLに設定
      const updatedStaff = {
        ...staff,
        user_id: null,
        email: staff.email || null // emailも保持（必要に応じて）
      }
      
      await staffApi.update(staff.id, updatedStaff)

      // usersテーブルのroleをcustomerに更新（スタッフ権限を解除）
      const userIdToUpdate = staff.user_id
      if (userIdToUpdate) {
        // 現在のユーザー情報を取得してroleを確認
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userIdToUpdate)
          .single()
          
        if (fetchError) {
          logger.error('ユーザー情報取得エラー:', fetchError)
        } else if (userData && userData.role !== 'admin') {
        // adminでない場合のみロールを変更
          const { error: updateError } = await supabase
            .from('users')
            .update({ role: 'customer' })
            .eq('id', userIdToUpdate)
            
          if (updateError) {
            logger.error('usersテーブルのロール更新に失敗しました:', updateError)
          } else {
            logger.log('✅ 連携解除に伴い、ユーザーロールをcustomerに変更しました')
          }
        } else if (userData?.role === 'admin') {
          logger.log('ℹ️ adminユーザーのため、ロール変更をスキップしました')
        }
      }

      // React Queryのキャッシュを更新
      queryClient.setQueryData<Staff[]>(staffKeys.all, (old = []) => {
        return old.map(s => s.id === staff.id ? updatedStaff : s)
      })
      
      // キャッシュを無効化して最新データを取得
      await queryClient.invalidateQueries({ queryKey: staffKeys.all })

      showToast.success(`${staff.name}さんとアカウントの連携を解除しました`)
      onSuccess?.()
    } catch (err: any) {
      logger.error('Error unlinking user:', err)
      const errorMessage = '連携解除に失敗しました: ' + err.message
      showToast.error(errorMessage)
      onError?.(errorMessage)
    }
  }, [onSuccess, onError, queryClient])

  /**
   * スタッフへの招待メールを再送信
   */
  const handleReinviteStaff = useCallback(async (staff: Staff) => {
    if (!staff.email) {
      showToast.warning('このスタッフにはメールアドレスが設定されていません')
      return
    }

    try {
      const request: InviteStaffRequest = {
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        line_name: staff.line_name,
        x_account: staff.x_account,
        discord_id: staff.discord_id,
        discord_channel_id: staff.discord_channel_id,
        role: staff.role || ['gm'],
        stores: staff.stores || []
      }

      const result = await inviteStaff(request)
      
      if (result.success) {
        // スタッフリストを再取得
        await queryClient.invalidateQueries({ queryKey: staffKeys.all })
        showToast.success(`${staff.name}さんに招待メールを再送信しました`, `送信先: ${staff.email}`)
        onSuccess?.()
      } else {
        throw new Error(result.error || '再招待に失敗しました')
      }
    } catch (err: any) {
      logger.error('Error reinviting staff:', err)
      const errorMessage = '再招待に失敗しました: ' + err.message
      showToast.error(errorMessage)
      onError?.(errorMessage)
    }
  }, [queryClient, onSuccess, onError])

  return {
    searchUserByEmail,
    handleInviteStaff,
    handleLinkExistingUser,
    handleLinkWithInvite,
    handleUnlinkUser,
    handleReinviteStaff
  }
}

