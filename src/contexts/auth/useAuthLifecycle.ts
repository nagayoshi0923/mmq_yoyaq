import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { supabase, type AuthUser } from '@/lib/supabase'
import { authTrace, logger } from '@/utils/logger'
import { maskEmail } from '@/utils/security'
import { validateRedirectUrl } from '@/lib/utils'
import {
  getSignOutRedirectPath,
  PASSWORD_RESET_FLAG_KEY,
  AUTH_CHANNEL_NAME,
} from './authContextHelpers'
import { resolveUserFromSession, type ResolveUserDeps } from './resolveUserFromSession'

/**
 * AuthProvider のマウント時ライフサイクル effect を切り出したフック。
 * onAuthStateChange 購読 / visibilitychange・focus / 10分 interval /
 * BroadcastChannel（マルチタブ同期）と SIGNED_OUT→tryRecoverSession リカバリーを内包する。
 * 共有 state/ref/関数は deps として受け取り、各クロージャの捕捉タイミングは旧実装と一致する。
 * effect 依存配列は [refreshSession]（マウント時1回）、cleanup
 * （unsubscribe / removeEventListener / clearInterval / channel.close）も含め
 * 挙動は AuthContext 内にあった頃と不変。
 */
export interface AuthLifecycleDeps {
  loading: boolean
  resolveDeps: ResolveUserDeps
  getInitialSession: () => Promise<void>
  tryRecoverSession: () => Promise<boolean>
  refreshSession: () => Promise<void>
  userRef: MutableRefObject<AuthUser | null>
  isProcessingRef: MutableRefObject<boolean>
  isExplicitSignOutRef: MutableRefObject<boolean>
  recoveryAttemptedRef: MutableRefObject<boolean>
  broadcastChannelRef: MutableRefObject<BroadcastChannel | null>
  setUser: Dispatch<SetStateAction<AuthUser | null>>
  setStaffCache: Dispatch<SetStateAction<Map<string, string>>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setIsInitialized: Dispatch<SetStateAction<boolean>>
}

export function useAuthLifecycle(deps: AuthLifecycleDeps) {
  const {
    loading,
    resolveDeps,
    getInitialSession,
    tryRecoverSession,
    refreshSession,
    userRef,
    isProcessingRef,
    isExplicitSignOutRef,
    recoveryAttemptedRef,
    broadcastChannelRef,
    setUser,
    setStaffCache,
    setLoading,
    setIsInitialized,
  } = deps

  useEffect(() => {
    const authStartTime = performance.now()
    authTrace('🚀 AuthContext 初期化開始:', new Date().toISOString())
    
    // パフォーマンス最適化: 認証処理を非ブロッキング化
    // 1.2秒後に loading を落とし、ロール取得が遅い環境でも画面を先に出す
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        authTrace('⏱️ 認証処理タイムアウト（1.2秒）、ページ表示を開始')
        setLoading(false)
      }
    }, 1200)
    
    // 初期認証状態の確認（バックグラウンドで実行）
    getInitialSession().then(() => {
      clearTimeout(loadingTimeout)
      const authEndTime = performance.now()
      authTrace(`⏱️ AuthContext 初期認証完了: ${((authEndTime - authStartTime) / 1000).toFixed(2)}秒`)
      setLoading(false)
      setIsInitialized(true)  // 認証完了をマーク
    }).catch(() => {
      clearTimeout(loadingTimeout)
      setLoading(false)
      setIsInitialized(true)  // エラーでも完了とみなす
    })

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const eventStartTime = performance.now()
        authTrace('🔄 認証状態変更:', event, session?.user?.email ? maskEmail(session.user.email) : 'N/A', `(経過時間: ${((eventStartTime - authStartTime) / 1000).toFixed(2)}秒)`)
        
        // 処理中の場合はスキップ（重複実行防止）
        if (isProcessingRef.current) {
          authTrace('⏭️ 認証処理中のためスキップ:', event)
          return
        }
        
        // パスワードリセット中はロール更新をスキップ（一時セッションでロールが変わるのを防ぐ）
        if (sessionStorage.getItem(PASSWORD_RESET_FLAG_KEY)) {
          authTrace('⏭️ パスワードリセット中のためスキップ:', event)
          return
        }
        
        // 既に同じユーザーが設定されている場合はスキップ（重複実行防止）
        if (session?.user && userRef.current && userRef.current.id === session.user.id) {
          authTrace('⏭️ 既に同じユーザーが設定されているためスキップ:', event)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // TOKEN_REFRESHEDイベントの場合は、既存のユーザー情報を保持（ロールを維持）
        if (event === 'TOKEN_REFRESHED' && session?.user && userRef.current) {
          // トークンリフレッシュ時は、既存のユーザー情報があればロールを維持
          authTrace('🔄 トークンリフレッシュ検出、既存ロールを維持:', userRef.current.role)
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        // INITIAL_SESSIONイベントの場合は、getInitialSessionで処理済みの可能性があるためスキップ
        if (event === 'INITIAL_SESSION' && userRef.current) {
          authTrace('⏭️ 初期セッションは既に処理済みのためスキップ')
          setLoading(false)
          setIsInitialized(true)  // 認証完了をマーク
          return
        }
        
        if (session?.user) {
          // ⚠️ 重要: resolveUserFromSession の完了を待ってからisInitializedを設定
          // これにより、user情報が設定される前にリダイレクトが発生することを防ぐ
          resolveUserFromSession(session.user, resolveDeps).then(async () => {
            // OAuthログインモードで未登録ユーザーの場合はログアウトしてエラー表示
            if (event === 'SIGNED_IN') {
              const oauthMode = sessionStorage.getItem('oauth_mode')
              authTrace('🔑 OAuth mode:', oauthMode)
              // Google 等のソーシャルログイン時のみ「顧客レコード必須」を検証する。
              // メールのマジックリンク/OTP は app_metadata.provider が 'email' のためここでは除外。
              // oauth_mode=login が前回の試行で残っていると、新規登録→確認メール直後に
              // 顧客未作成のままサインアウトされ /login へ飛ばされるバグになる。
              const authProvider = session.user.app_metadata?.provider as string | undefined
              const isOAuthSocialSignIn = Boolean(authProvider && authProvider !== 'email')

              if (oauthMode === 'login' && isOAuthSocialSignIn) {
                const { data: customerRows } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('user_id', session.user.id)
                  .order('created_at', { ascending: true })
                  .limit(1)

                if (!customerRows || customerRows.length === 0) {
                  authTrace('⚠️ OAuthログインで顧客レコード未検出、プロフィール登録へ誘導')
                  sessionStorage.removeItem('oauth_mode')
                  setLoading(false)
                  setIsInitialized(true)
                  window.location.href = '/complete-profile'
                  return
                }
              }
              sessionStorage.removeItem('oauth_mode')
            }
            
            setLoading(false)
            setIsInitialized(true)  // ユーザー情報設定完了後に認証完了をマーク
            
            // OAuthログイン後のreturnUrl処理（予約フローに戻る）
            if (event === 'SIGNED_IN') {
              const rawReturnUrl = sessionStorage.getItem('returnUrl')
              if (rawReturnUrl) {
                sessionStorage.removeItem('returnUrl')
                const safeReturnUrl = validateRedirectUrl(rawReturnUrl)
                authTrace('🔄 OAuth後のリダイレクト:', safeReturnUrl)
                // 現在のパスと異なる場合のみリダイレクト
                if (window.location.pathname !== safeReturnUrl && !safeReturnUrl.startsWith(window.location.pathname)) {
                  window.location.href = safeReturnUrl
                }
              }
            }
          }).catch((err) => {
            logger.error('❌ resolveUserFromSession error:', err)
            setLoading(false)
            setIsInitialized(true)  // エラーでも完了とみなす
          })
        } else {
          // SIGNED_OUT でユーザーが設定済みの場合（デプロイ後のリロードでトークンリフレッシュが
          // 失敗したケースなど）、バックアップからのリカバリーを試みる。
          // ただし以下の場合はスキップ:
          // - 明示的にログアウトした場合（isExplicitSignOutRef）
          // - 既にリカバリーを試行済みの場合（無限ループ防止）
          if (event === 'SIGNED_OUT' && userRef.current
              && !isExplicitSignOutRef.current
              && !recoveryAttemptedRef.current) {
            recoveryAttemptedRef.current = true
            authTrace('⚠️ SIGNED_OUT だがユーザー設定済み、リカバリーを試行')
            const recovered = await tryRecoverSession()
            if (recovered) {
              recoveryAttemptedRef.current = false
              return
            }
          }
          
          setUser(null)
          userRef.current = null
          setStaffCache(new Map())  // セッション終了時にキャッシュもクリア
          setLoading(false)
          setIsInitialized(true)  // ログアウト状態として認証完了をマーク
        }
      }
    )

    // タブがアクティブになったときにセッションをリフレッシュ（バックグラウンドでの期限切れ対策）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && userRef.current) {
        authTrace('👁️ タブがアクティブになりました、セッションを確認')
        // 非同期でリフレッシュ（UIをブロックしない）
        setTimeout(() => {
          refreshSession()
        }, 100)
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // フォーカス時にもセッションを確認（visibilitychangeが発火しない場合の対策）
    const handleFocus = () => {
      if (userRef.current) {
        authTrace('🎯 ウィンドウにフォーカス、セッションを確認')
        setTimeout(() => {
          refreshSession()
        }, 100)
      }
    }
    
    window.addEventListener('focus', handleFocus)
    
    // 定期的なセッションリフレッシュ（10分ごと）
    // Supabaseのデフォルト有効期限は1時間のため、余裕を持ってリフレッシュ
    const refreshInterval = setInterval(() => {
      if (userRef.current) {
        authTrace('⏰ 定期セッションリフレッシュ（10分間隔）')
        refreshSession()
      }
    }, 10 * 60 * 1000) // 10分

    // 複数タブ間の認証状態同期（BroadcastChannel API）
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(AUTH_CHANNEL_NAME)
      broadcastChannelRef.current.onmessage = (event) => {
        const { type, payload } = event.data
        authTrace('📡 他タブからの認証イベント受信:', type)
        
        switch (type) {
          case 'SIGNED_OUT':
            // 他のタブでログアウトした場合、このタブもログアウト状態にする
            authTrace('🚪 他タブでログアウト検出、このタブもログアウト')
            isExplicitSignOutRef.current = true
            setUser(null)
            userRef.current = null
            setStaffCache(new Map())  // キャッシュもクリア
            setIsInitialized(true)
            // ページをリロードしてクリーンな状態にする（現在の組織を維持）
            window.location.href = getSignOutRedirectPath()
            break
          case 'SIGNED_IN':
            // 他のタブでログインした場合、セッションをリフレッシュ
            authTrace('🔑 他タブでログイン検出、セッションをリフレッシュ')
            refreshSession()
            break
          case 'ROLE_CHANGED':
            // ロール変更があった場合、セッションをリフレッシュ
            authTrace('👤 他タブでロール変更検出:', payload?.role)
            refreshSession()
            break
        }
      }
      authTrace('📡 BroadcastChannel初期化完了:', AUTH_CHANNEL_NAME)
    }

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(refreshInterval)
      // BroadcastChannelをクローズ
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close()
        broadcastChannelRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行、内部関数はコールバック内で使用
  }, [refreshSession])
}
