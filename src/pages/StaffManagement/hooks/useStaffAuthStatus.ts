import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface StaffAuthStatus {
  user_id: string | null
  status: 'not_linked' | 'pending' | 'active' | 'never_logged_in'
  label: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
}

/**
 * スタッフの認証状態を取得するhook
 * user_idのリストを受け取り、各ユーザーの認証状態を返す
 */
export function useStaffAuthStatus(userIds: (string | null)[]) {
  const [authStatusMap, setAuthStatusMap] = useState<Map<string, StaffAuthStatus>>(new Map())
  const [isLoading, setIsLoading] = useState(false)

  const fetchAuthStatus = useCallback(async () => {
    // user_idがnullでないものをフィルタ
    const validUserIds = userIds.filter((id): id is string => id !== null && id !== undefined)
    
    if (validUserIds.length === 0) {
      setAuthStatusMap(new Map())
      return
    }

    setIsLoading(true)
    try {
      // usersテーブルから認証情報を取得
      // 注意: auth.usersは直接アクセスできないので、usersテーブルの情報のみ使用
      const { data: usersData, error } = await supabase
        .from('users')
        .select('id, email, created_at, updated_at')
        .in('id', validUserIds)

      if (error) {
        logger.error('認証状態取得エラー:', error)
        return
      }

      const newMap = new Map<string, StaffAuthStatus>()
      
      for (const userId of validUserIds) {
        const userData = usersData?.find(u => u.id === userId)
        
        if (userData) {
          // usersテーブルにレコードがある = 紐付け済み
          // 詳細な状態（メール確認、ログイン履歴）はauth.usersにあるので、
          // ここでは紐付け済みかどうかのみ判定
          newMap.set(userId, {
            user_id: userId,
            status: 'active',
            label: '設定済み',
            email_confirmed_at: null, // auth.usersからは取得不可
            last_sign_in_at: null
          })
        } else {
          // usersテーブルにレコードがない = 招待中または未紐付け
          newMap.set(userId, {
            user_id: userId,
            status: 'pending',
            label: '招待中',
            email_confirmed_at: null,
            last_sign_in_at: null
          })
        }
      }

      setAuthStatusMap(newMap)
    } catch (err) {
      logger.error('認証状態取得例外:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userIds.join(',')])

  useEffect(() => {
    fetchAuthStatus()
  }, [fetchAuthStatus])

  // user_idを渡して認証状態を取得する関数
  const getAuthStatus = useCallback((userId: string | null): StaffAuthStatus => {
    if (!userId) {
      return {
        user_id: null,
        status: 'not_linked',
        label: '未紐付け',
        email_confirmed_at: null,
        last_sign_in_at: null
      }
    }
    
    return authStatusMap.get(userId) || {
      user_id: userId,
      status: 'pending',
      label: '確認中',
      email_confirmed_at: null,
      last_sign_in_at: null
    }
  }, [authStatusMap])

  return {
    authStatusMap,
    getAuthStatus,
    isLoading,
    refetch: fetchAuthStatus
  }
}

