// パスワード設定ページ（招待メールからのリンク先）
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, Lock } from 'lucide-react'
import { logger } from '@/utils/logger'

export function SetPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabaseの認証状態変更をリッスン（標準的な方法）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.log('🔧 SetPassword: onAuthStateChange', { event, hasSession: !!session, hasUser: !!session?.user })
      
      if (event === 'SIGNED_IN' && session && session.user) {
        logger.log('✅ セッションが確立されました')
        setSessionReady(true)
        setError('') // エラーをクリア
      } else if (event === 'SIGNED_OUT') {
        logger.log('⚠️ ユーザーがサインアウトしました')
        setSessionReady(false)
      } else if (event === 'TOKEN_REFRESHED' && session && session.user) {
        logger.log('✅ トークンがリフレッシュされました')
        setSessionReady(true)
      }
    })

    // 初期セッションを確認
    const checkSession = async () => {
      logger.log('🔧 SetPassword: セッション確認開始')
      
      // URLからトークンを取得
      const hash = window.location.hash.substring(1)
      const searchParams = new URLSearchParams(window.location.search.substring(1))
      const hashParams = new URLSearchParams(hash)
      
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token')
      const type = hashParams.get('type') || searchParams.get('type')
      
      logger.log('🔧 SetPassword: URL解析', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type
      })

      // まず既存のセッションを確認
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (session && session.user) {
        logger.log('✅ 既存のセッションが見つかりました:', session.user.email)
        setSessionReady(true)
        return
      }

      if (sessionError) {
        logger.warn('⚠️ セッション取得エラー:', sessionError)
      }

      // セッションがない場合、URLからトークンを取得してセッションを確立
        if (accessToken && refreshToken) {
          logger.log('🔧 URLからトークンを取得してセッションを確立します')
          
          try {
            const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            })
            
            if (setSessionError) {
              logger.error('❌ セッション確立エラー:', setSessionError)
              
              if (setSessionError.message.includes('User from sub claim in JWT does not exist') || 
                  setSessionError.message.includes('JWT')) {
                setError('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
                return
              }
              
              setError('セッションの確立に失敗しました。招待リンクの有効期限が切れている可能性があります。')
              return
            }
            
            if (sessionData.session && sessionData.session.user) {
              logger.log('✅ セッションが確立されました（setSession成功）:', sessionData.session.user.email)
              
              // ユーザーが実際に存在するか確認（重要：setSessionが成功してもユーザーが存在しない場合がある）
              // 複数回試行して確実に確認
              let userVerified = false
              let verifyAttempts = 0
              const maxVerifyAttempts = 3
              
              while (!userVerified && verifyAttempts < maxVerifyAttempts) {
                verifyAttempts++
                logger.log(`🔍 ユーザー存在確認試行 ${verifyAttempts}/${maxVerifyAttempts}`)
                
                try {
                  const { data: { user }, error: userError } = await supabase.auth.getUser()
                  
                  if (userError) {
                    logger.error(`❌ ユーザー確認エラー (試行 ${verifyAttempts}):`, userError)
                    if (userError.message && userError.message.includes('User from sub claim')) {
                      setError('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
                      setSessionReady(false)
                      return
                    }
                    if (verifyAttempts < maxVerifyAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 500))
                      continue
                    }
                    setError('ユーザーの確認に失敗しました。招待リンクをもう一度確認してください。')
                    setSessionReady(false)
                    return
                  }
                  
                  if (!user) {
                    logger.error(`❌ ユーザーが見つかりません (試行 ${verifyAttempts})`)
                    if (verifyAttempts < maxVerifyAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 500))
                      continue
                    }
                    setError('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
                    setSessionReady(false)
                    return
                  }
                  
                  logger.log('✅ ユーザーの存在を確認しました:', user.email, `(試行 ${verifyAttempts})`)
                  userVerified = true
                  setSessionReady(true)
                } catch (verifyErr: any) {
                  logger.error(`❌ ユーザー確認時の予期しないエラー (試行 ${verifyAttempts}):`, verifyErr)
                  if (verifyErr.message && verifyErr.message.includes('User from sub claim')) {
                    setError('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
                    setSessionReady(false)
                    return
                  }
                  if (verifyAttempts < maxVerifyAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 500))
                    continue
                  }
                  setError('ユーザーの確認に失敗しました。招待リンクをもう一度確認してください。')
                  setSessionReady(false)
                  return
                }
              }
              
              if (!userVerified) {
                logger.error('❌ ユーザー確認に失敗しました（全試行完了）')
                setError('ユーザーの確認に失敗しました。招待リンクをもう一度確認してください。')
                setSessionReady(false)
              }
            } else {
              logger.warn('⚠️ セッションデータがありません')
              setError('セッションの確立に失敗しました。招待リンクをもう一度確認してください。')
            }
          } catch (err: any) {
            logger.error('❌ セッション確立時の予期しないエラー:', err)
            if (err.message && err.message.includes('User from sub claim')) {
              setError('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
            } else {
              setError('セッションの確立に失敗しました。招待リンクの有効期限が切れている可能性があります。')
            }
          }
        } else {
        // トークンがない場合、少し待ってから再確認（Supabaseが自動的にセッションを確立する可能性がある）
        logger.log('🔧 トークンが見つかりません。遅延確認を実行します')
        setTimeout(async () => {
          const { data: { session: delayedSession }, error: delayedError } = await supabase.auth.getSession()
          
          if (delayedSession && delayedSession.user) {
            logger.log('✅ 遅延セッション確認: セッションが見つかりました')
            setSessionReady(true)
          } else {
            logger.warn('⚠️ 遅延セッション確認: セッションが見つかりませんでした')
            if (delayedError) {
              logger.error('遅延セッション確認エラー:', delayedError)
            }
            setError('無効な招待リンクです。もう一度招待メールを確認してください。')
          }
        }, 2000)
      }
    }

    checkSession()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!sessionReady) {
      setError('セッションの準備ができていません。少しお待ちください。')
      return
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で設定してください')
      return
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)

    try {
      // セッションを再確認
      let currentSession = null
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        logger.error('セッション取得エラー:', sessionError)
        // エラーでも続行（URLから再取得を試みる）
      } else {
        currentSession = session
      }
      
      // セッションがある場合、ユーザーが実際に存在するか確認
      if (currentSession && currentSession.user) {
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          if (userError || !user) {
            logger.error('❌ ユーザーが存在しません（パスワード設定前）:', userError)
            throw new Error('ユーザーが見つかりません。この招待リンクは無効です。新しい招待リンクを申請してください。')
          }
          logger.log('✅ ユーザーの存在を確認しました（パスワード設定前）:', user.email)
        } catch (verifyErr: any) {
          logger.error('❌ ユーザー確認エラー（パスワード設定前）:', verifyErr)
          if (verifyErr.message && verifyErr.message.includes('User from sub claim')) {
            throw new Error('ユーザーが見つかりません。この招待リンクは無効です。新しい招待リンクを申請してください。')
          }
          throw verifyErr
        }
      }

      // セッションがない、またはユーザーが存在しない場合、URLから再度トークンを取得してセッションを確立
      if (!currentSession || !currentSession.user) {
        logger.log('セッションが見つかりません。URLからトークンを再取得します')
        const hash = window.location.hash.substring(1)
        const searchParams = new URLSearchParams(window.location.search.substring(1))
        const hashParams = new URLSearchParams(hash)
        
        const accessToken = hashParams.get('access_token') || searchParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token')

        if (accessToken && refreshToken) {
          logger.log('セッション再確立を試みます')
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (setSessionError) {
            logger.error('セッション再確立エラー:', setSessionError)
            if (setSessionError.message.includes('User from sub claim in JWT does not exist') ||
                setSessionError.message.includes('JWT')) {
              throw new Error('ユーザーが見つかりません。この招待リンクは無効です。\n\n新しい招待リンクを申請してください。')
            }
            throw new Error('セッションの確立に失敗しました。招待リンクの有効期限が切れている可能性があります。')
          }

          if (!sessionData.session || !sessionData.session.user) {
            throw new Error('セッションが無効です。招待リンクをもう一度確認してください。')
          }

          currentSession = sessionData.session
          logger.log('✅ セッション再確立成功')
        } else {
          throw new Error('セッションが無効です。招待リンクをもう一度確認してください。')
        }
      }

      // ユーザーが存在するか確認
      if (!currentSession.user || !currentSession.user.id) {
        throw new Error('ユーザー情報が見つかりません。招待リンクが無効です。')
      }

      logger.log('パスワード更新を開始:', { userId: currentSession.user.id, email: currentSession.user.email })

      // セッションの有効性を再確認（念のため）
      const { data: { session: verifySession }, error: verifyError } = await supabase.auth.getSession()
      if (verifyError) {
        logger.error('セッション検証エラー:', verifyError)
        throw new Error('セッションの検証に失敗しました。招待リンクの有効期限が切れている可能性があります。')
      }

      if (!verifySession || !verifySession.user || verifySession.user.id !== currentSession.user.id) {
        throw new Error('セッションが無効です。招待リンクをもう一度確認してください。')
      }

      logger.log('✅ セッション検証成功、パスワード更新を実行します')

      // パスワードを更新
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        logger.error('パスワード更新エラー:', updateError)
        if (updateError.message.includes('User from sub claim in JWT does not exist')) {
          throw new Error('ユーザーが見つかりません。招待リンクの有効期限が切れているか、無効なリンクです。新しい招待リンクを申請してください。')
        }
        if (updateError.message.includes('403') || updateError.message.includes('Forbidden')) {
          throw new Error('認証エラーが発生しました。招待リンクが無効です。新しい招待リンクを申請してください。')
        }
        throw new Error(updateError.message || 'パスワードの設定に失敗しました')
      }

      logger.log('✅ パスワード更新成功')

      setSuccess(true)

      setTimeout(() => {
        supabase.auth.signOut().then(() => {
          window.location.href = '/#login'
        })
      }, 3000)

    } catch (err: any) {
      logger.error('Password set error:', err)
      setError(err.message || 'パスワードの設定に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6">
            <div className="flex justify-center mb-3 sm:mb-4">
              <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-600" />
            </div>
            <CardTitle className="text-center text-lg">パスワードの設定が完了しました！</CardTitle>
            <CardDescription className="text-center text-sm sm:text-base mt-2">
              3秒後にログイン画面に移動します...
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
            <Button
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
              onClick={() => window.location.hash = '#login'}
            >
              今すぐログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6">
          <div className="flex justify-center mb-3 sm:mb-4">
            <Lock className="h-10 w-10 sm:h-12 sm:w-12 text-blue-600" />
          </div>
          <CardTitle className="text-center text-lg">パスワードを設定</CardTitle>
          <CardDescription className="text-center text-sm sm:text-base mt-2">
            新しいパスワードを設定してアカウントをアクティブ化します
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
          <form onSubmit={handleSetPassword} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm sm:text-base text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm sm:text-base">新しいパスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="6文字以上"
                disabled={loading}
                className="text-sm sm:text-base"
              />
              <p className="text-xs text-muted-foreground">
                パスワードは6文字以上で設定してください
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm sm:text-base">パスワード確認</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="もう一度入力"
                disabled={loading}
                className="text-sm sm:text-base"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
              disabled={loading || !sessionReady}
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  設定中...
                </>
              ) : !sessionReady ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  準備中...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  パスワードを設定
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
