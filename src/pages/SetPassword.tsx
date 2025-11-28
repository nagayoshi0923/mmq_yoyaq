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
      if (event === 'SIGNED_IN' && session) {
        logger.log('✅ セッションが確立されました')
        setSessionReady(true)
      }
    })

    // 初期セッションを確認
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        logger.log('✅ 既存のセッションが見つかりました')
        setSessionReady(true)
      } else {
        // セッションがない場合、URLからトークンを取得してセッションを確立
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (accessToken && refreshToken) {
          logger.log('URLからトークンを取得してセッションを確立します')
          const { data: sessionData, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          if (error) {
            logger.error('セッション確立エラー:', error)
            setError('セッションの確立に失敗しました。招待リンクの有効期限が切れている可能性があります。')
          } else if (sessionData.session) {
            logger.log('✅ セッションが確立されました（setSession成功）')
            setSessionReady(true)
          }
        } else {
          // トークンがない場合、少し待ってから再確認（Supabaseが自動的にセッションを確立する可能性がある）
          setTimeout(async () => {
            const { data: { session: delayedSession } } = await supabase.auth.getSession()
            if (delayedSession) {
              logger.log('遅延セッション確認: セッションが見つかりました')
              setSessionReady(true)
            } else {
              setError('無効な招待リンクです。もう一度招待メールを確認してください。')
            }
          }, 2000)
        }
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('セッションが無効です。招待リンクをもう一度確認してください。')
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError

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
