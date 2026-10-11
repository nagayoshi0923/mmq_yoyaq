import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { buildCompleteProfilePath } from '@/lib/authReturn'
import { fetchIsCustomerProfileComplete } from '@/lib/profileGate'

/**
 * 予約ボタン・貸切申込・グループ参加など「押した時に」プロフィール登録を求める（点検 2026-10-11 の 9）。
 * 未完了ならプロフィール登録画面へ送り（登録後は next に戻る）、false を返す。
 * 未ログイン・スタッフはここでは止めない（ログインは呼び出し側で扱う）。
 */
export function useRequireCompleteProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return useCallback(
    async (next: string): Promise<boolean> => {
      if (!user || user.role !== 'customer') return true
      const complete = await fetchIsCustomerProfileComplete(user.id, user.email)
      if (complete) return true
      navigate(buildCompleteProfilePath(next))
      return false
    },
    [user, navigate],
  )
}
