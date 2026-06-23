import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'

/**
 * 手動セッションリフレッシュ。元々 AuthContext 内の refreshSession を切り出したもの。
 * 重複リフレッシュ防止用の lastRefreshRef はフック内で保持する。
 * 返り値は安定な useCallback（setUser は useState 由来で参照安定のため依存に入れても識別子は不変）。
 * 挙動は AuthContext 内にあった頃と不変。
 */
export function useSessionRefresh(
  userRef: MutableRefObject<AuthUser | null>,
  setUser: Dispatch<SetStateAction<AuthUser | null>>
) {
  // 最後のトークンリフレッシュ時間（重複リフレッシュ防止）
  const lastRefreshRef = useRef<number>(0)

  return useCallback(async () => {
    const now = Date.now()
    // 30秒以内に既にリフレッシュした場合はスキップ
    if (now - lastRefreshRef.current < 30000) {
      authTrace('⏭️ セッションリフレッシュ: 30秒以内に既に実行済み、スキップ')
      return
    }
    
    lastRefreshRef.current = now
    authTrace('🔄 セッションリフレッシュ開始')
    
    try {
      // まず現在のセッション状態を確認（不要なrefreshを避ける）
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        logger.error('❌ セッション確認エラー:', sessionError)
        return
      }
      
      const session = sessionData.session
      if (!session) {
        authTrace('⏭️ セッションなし: リフレッシュをスキップ')
        return
      }
      
      // 有効期限まで十分余裕がある場合はリフレッシュしない
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      const refreshThresholdMs = 15 * 60 * 1000 // 15分前からリフレッシュ開始
      if (expiresAt && expiresAt - now > refreshThresholdMs) {
        authTrace('⏭️ セッション有効: リフレッシュ不要（残り', Math.round((expiresAt - now) / 60000), '分）')
        return
      }
      
      authTrace('🔄 セッション有効期限が近いためリフレッシュ開始（残り', Math.round((expiresAt - now) / 60000), '分）')
      
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        logger.error('❌ セッションリフレッシュエラー:', error)
        
        // リフレッシュに失敗した場合も、直ちにログアウトせずに再確認
        if (error.message?.includes('Invalid Refresh Token') || 
            error.message?.includes('Refresh Token Not Found')) {
          const { data: retrySession } = await supabase.auth.getSession()
          if (!retrySession.session) {
            setUser(null)
            userRef.current = null
          } else {
            authTrace('⚠️ リフレッシュ失敗だがセッションは有効: 状態維持')
          }
        }
        return
      }
      
      if (data.session) {
        authTrace('✅ セッションリフレッシュ成功')
      }
    } catch (err) {
      logger.error('❌ セッションリフレッシュ例外:', err)
    }
    // userRef/setUser は参照安定。deps に入れてもコールバック識別子は不変
  }, [userRef, setUser])
}
