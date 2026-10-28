import { withAuthTimeout } from './authTimeout'
import type { Dispatch, SetStateAction } from 'react'
import { supabase, sessionBackupJson } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import { maskEmail } from '@/utils/security'
import { resolveUserFromSession, type ResolveUserDeps } from './resolveUserFromSession'

/**
 * 初期セッション取得（getInitialSession）と、バックアップからのセッション復元
 * （tryRecoverSession）を生成するファクトリ。元々 AuthContext 内にあった同名関数を
 * 切り出したもの。resolveUserFromSession へ渡す resolveDeps と、loading/初期化フラグの
 * setter を deps として受け取る。React フックは使わないため毎レンダーで新しい関数を返す
 * （tryRecoverSession は元 useCallback だが依存配列で参照されないため挙動不変）。
 */
export interface SessionBootstrapDeps {
  resolveDeps: ResolveUserDeps
  setLoading: Dispatch<SetStateAction<boolean>>
  setIsInitialized: Dispatch<SetStateAction<boolean>>
  onFailure?: () => void
}

export function createSessionBootstrap(deps: SessionBootstrapDeps) {
  const { resolveDeps, setLoading, setIsInitialized } = deps

  // デプロイ後のリロードでトークンリフレッシュが失敗した場合のリカバリー。
  // Supabase クライアント初期化前に保存したバックアップから refresh_token を取り出し、
  // setSession() で再認証を試みる。
  async function tryRecoverSession(): Promise<boolean> {
    if (!sessionBackupJson) return false
    const generation = resolveDeps.generationRef?.current
    const isCurrent = () => generation === resolveDeps.generationRef?.current
    try {
      const backup = JSON.parse(sessionBackupJson)
      if (!backup?.refresh_token) return false
      authTrace('🔄 バックアップからセッション復元を試行')
      const { data, error } = await withAuthTimeout(supabase.auth.setSession({
        access_token: backup.access_token ?? '',
        refresh_token: backup.refresh_token,
      }))
      if (!isCurrent()) return false
      if (!error && data.session?.user) {
        authTrace('✅ セッション復元成功')
        const result = await resolveUserFromSession(data.session.user, resolveDeps)
        if (result !== 'resolved') return false
        setLoading(false)
        setIsInitialized(true)
        return true
      }
      authTrace('❌ セッション復元失敗:', error?.message)
    } catch (err) {
      authTrace('❌ セッション復元例外:', err)
    }
    return false
  }

  async function getInitialSession() {
    const generation = resolveDeps.generationRef?.current
    const isCurrent = () => generation === resolveDeps.generationRef?.current
    const startTime = performance.now()
    authTrace('🚀 初期セッション取得開始')
    try {
      const sessionStartTime = performance.now()
      const { data: { session: initialSession }, error } = await withAuthTimeout(supabase.auth.getSession())
      if (!isCurrent()) return
      let session = initialSession
      const sessionEndTime = performance.now()
      authTrace(`⏱️ getSession 完了: ${((sessionEndTime - sessionStartTime) / 1000).toFixed(2)}秒`)
      
      if (error) {
        logger.error('❌ セッション取得エラー:', error)
        deps.onFailure?.()
        return
      }
      
      if (session?.user) {
        // 残り1時間未満で毎回 refresh すると約1時間寿命のJWTでほぼ常に走り、起動・ログインが重くなる。
        // 直前（5分）だけ手動リフレッシュ（SDK の autoRefreshToken に任せる）
        const now = Date.now()
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
        const refreshIfRemainingLessThanMs = 5 * 60 * 1000

        if (expiresAt && expiresAt - now < refreshIfRemainingLessThanMs) {
          authTrace('🔄 セッション有効期限が近いため、リフレッシュを試行')
          try {
            const { data: refreshData, error: refreshError } = await withAuthTimeout(supabase.auth.refreshSession())
            if (refreshError) {
              logger.warn('⚠️ リフレッシュ失敗:', refreshError.message)
            } else if (refreshData.session) {
              session = refreshData.session
              authTrace('✅ セッションリフレッシュ成功')
            }
          } catch (refreshErr) {
            logger.warn('⚠️ リフレッシュ例外:', refreshErr)
          }
        }
        
        if (!isCurrent()) return
        authTrace('👤 セッションユーザー発見:', maskEmail(session.user.email))
        await resolveUserFromSession(session.user, resolveDeps)
      } else {
        // セッションがない場合、Refresh Tokenからの復元を試みる
        authTrace('🔄 セッションなし、リフレッシュで復元を試行')
        let recoveryFailed = false
        try {
          const { data: refreshData, error: refreshError } = await withAuthTimeout(supabase.auth.refreshSession())
          if (!isCurrent()) return
          if (!refreshError && refreshData.session?.user) {
            authTrace('✅ リフレッシュでセッション復元成功:', maskEmail(refreshData.session.user.email))
            await resolveUserFromSession(refreshData.session.user, resolveDeps)
            return
          }
          // session自体がない通常の未ログインと、通信・認証サービスの失敗を区別する。
          recoveryFailed = !!refreshError && refreshError.name !== 'AuthSessionMissingError'
        } catch (refreshErr) {
          recoveryFailed = true
          authTrace('⏭️ リフレッシュ復元失敗')
        }
        
        // SDK の refreshSession も失敗した場合、クライアント初期化前に保存した
        // バックアップ（supabase.ts で保存）から復元を試みる。
        // デプロイ後のリロードで autoRefreshToken が旧トークンを消費→
        // レスポンス受信前にリロード→新トークン未保存、という競合で
        // localStorage のセッションが消えるケースに対応。
        const recovered = await tryRecoverSession()
        if (recovered || !isCurrent()) return
        // バックアップ復元失敗や通信失敗を、正常な未ログイン確認として消さない。
        if (recoveryFailed || sessionBackupJson) deps.onFailure?.()
        else resolveDeps.onResolutionSuccess?.()
        
        authTrace('👤 セッションユーザーなし')
      }
    } catch (error) {
      logger.error('❌ 初期セッション取得エラー:', error)
      if (isCurrent()) deps.onFailure?.()
    } finally {
      const endTime = performance.now()
      authTrace('✅ 初期セッション処理完了')
      authTrace(`⏱️ getInitialSession 総時間: ${((endTime - startTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
    }
  }

  return { getInitialSession, tryRecoverSession }
}
