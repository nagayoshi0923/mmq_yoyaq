import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { staffApi } from '@/lib/api'
import { inviteStaff, type InviteStaffRequest } from '@/lib/staffInviteApi'
import { staffKeys } from './useStaffQuery'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

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
        alert(`✅ ${request.name}さんを招待しました！\n\n招待メールが${request.email}に送信されました。`)
        onSuccess?.()
      } else {
        throw new Error(result.error || '招待に失敗しました')
      }
    } catch (err: any) {
      logger.error('Error inviting staff:', err)
      const errorMessage = 'スタッフの招待に失敗しました: ' + err.message
      alert(errorMessage)
      onError?.(errorMessage)
    }
  }, [onSuccess, onError])

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
      await staffApi.update(linkingStaff.id, {
        ...linkingStaff,
        user_id: users.id,
        email: email
      })

      // usersテーブルのroleをstaffに更新
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'staff' })
        .eq('id', users.id)

      if (updateError) {
        console.warn('usersテーブルの更新に失敗しました:', updateError)
      }

      alert(`✅ ${linkingStaff.name}さんを ${email} と紐付けました！`)
      onSuccess?.()
    } catch (err: any) {
      logger.error('Error linking user:', err)
      const errorMessage = 'ユーザーとの紐付けに失敗しました: ' + err.message
      alert(errorMessage)
      onError?.(errorMessage)
    }
  }, [onSuccess, onError])

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
      // 1. まず既存のスタッフレコードを削除
      await staffApi.delete(linkingStaff.id)
      logger.log('既存スタッフレコード削除完了')
      
      // 2. 新規ユーザーとスタッフレコードを作成
      const result = await inviteStaff(request)
      
      if (result.success && result.data) {
        alert(`✅ ${linkingStaff.name}さんを新規ユーザーとして招待しました！\n\n招待メールが${email}に送信されました。`)
        onSuccess?.()
      } else {
        throw new Error(result.error || '招待に失敗しました')
      }
    } catch (err: any) {
      logger.error('Error inviting and linking:', err)
      const errorMessage = '招待に失敗しました: ' + err.message
      alert(errorMessage)
      onError?.(errorMessage)
    }
  }, [onSuccess, onError])

  /**
   * スタッフとアカウントの連携を解除
   */
  const handleUnlinkUser = useCallback(async (staff: Staff) => {
    if (!staff.user_id) {
      alert('このスタッフは既にアカウントと連携されていません')
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

      // React Queryのキャッシュを更新
      queryClient.setQueryData<Staff[]>(staffKeys.all, (old = []) => {
        return old.map(s => s.id === staff.id ? updatedStaff : s)
      })
      
      // キャッシュを無効化して最新データを取得
      await queryClient.invalidateQueries({ queryKey: staffKeys.all })

      alert(`✅ ${staff.name}さんとアカウントの連携を解除しました`)
      onSuccess?.()
    } catch (err: any) {
      logger.error('Error unlinking user:', err)
      const errorMessage = '連携解除に失敗しました: ' + err.message
      alert(errorMessage)
      onError?.(errorMessage)
    }
  }, [onSuccess, onError, queryClient])

  return {
    searchUserByEmail,
    handleInviteStaff,
    handleLinkExistingUser,
    handleLinkWithInvite,
    handleUnlinkUser
  }
}

