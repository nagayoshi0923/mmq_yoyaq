import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { logger } from '@/utils/logger'

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    // URLのハッシュフラグメントからトークンを取得してセッションを確立
    const setupSession = async () => {
      try {
        // URLの形式: #access_token=...&refresh_token=...&type=recovery
        const hash = window.location.hash.substring(1) // '#' を削除
        logger.log('Current hash:', hash)
        
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        
        logger.log('Access token:', accessToken ? 'Found' : 'Not found')
        logger.log('Refresh token:', refreshToken ? 'Found' : 'Not found')
        logger.log('Type:', type)
        
        if (!accessToken || !refreshToken) {
          setError('無効なリセットリンクです。もう一度パスワードリセットを申請してください。')
          return
        }

        // type=recovery または typeがない場合（スタッフ招待リンクなど）も許可
        // access_tokenとrefresh_tokenがあれば、セッションを確立できる
        if (type && type !== 'recovery') {
          logger.warn('Unexpected type parameter:', type, '- Continuing anyway if tokens are valid')
        }

        // セッションを設定
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })

        if (sessionError) {
          logger.error('Session error:', sessionError)
          setError('セッションの確立に失敗しました。もう一度お試しください。')
          return
        }

        setSessionReady(true)
      } catch (err) {
        logger.error('Setup error:', err)
        setError('エラーが発生しました。もう一度お試しください。')
      }
    }

    setupSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!sessionReady) {
      setError('セッションの準備ができていません。少しお待ちください。')
      return
    }
    
    if (newPassword.length < 6) {
      setError('パスワードは6文字以上である必要があります')
      return
    }
    
    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    
    setIsLoading(true)
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) throw error
      
      setSuccess(true)
    } catch (error: any) {
      setError('パスワードの更新に失敗しました: ' + (error.message || ''))
      logger.error('Password reset error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 成功後のカウントダウン
  useEffect(() => {
    if (!success || isRedirecting) return

    logger.log('Countdown effect triggered, countdown:', countdown)

    if (countdown > 0) {
      const timer = setTimeout(() => {
        logger.log('Countdown decrementing from:', countdown)
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && !isRedirecting) {
      // countdown が 0 になったらリダイレクト処理を開始
      logger.log('Countdown reached 0, starting redirect...')
      setIsRedirecting(true)
    }
  }, [success, countdown, isRedirecting])

  // リダイレクト処理を別のuseEffectで実行
  useEffect(() => {
    if (isRedirecting) {
      logger.log('Redirecting: signing out...')
      supabase.auth.signOut().then(() => {
        logger.log('Redirecting: signed out, navigating to login...')
        // /login へリダイレクト
        window.location.href = window.location.origin + '/login'
      })
    }
  }, [isRedirecting])

  const handleGoToLogin = () => {
    if (isRedirecting) return // 既にリダイレクト中なら何もしない
    
    logger.log('Button clicked, starting redirect...')
    setIsRedirecting(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold text-green-800">パスワードを変更しました</h2>
            <div className="space-y-2">
              <p className="text-muted-foreground">
                新しいパスワードでログインできます。
              </p>
              <p className="text-lg font-semibold text-primary">
                {countdown}秒後にログイン画面に移動します...
              </p>
            </div>
            <Button 
              onClick={handleGoToLogin}
              className="w-full"
              size="lg"
              disabled={isRedirecting}
              type="button"
            >
              {isRedirecting ? 'ログイン画面へ移動中...' : '今すぐログイン画面へ'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>パスワードリセット</CardTitle>
          <CardDescription>新しいパスワードを設定してください</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="newPassword" className="block text-sm font-medium">
                新しいパスワード
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="6文字以上のパスワード"
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium">
                パスワード（確認）
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="もう一度入力してください"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="border-2 border-destructive rounded-md p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !sessionReady}
            >
              {isLoading ? 'パスワードを変更中...' : !sessionReady ? '準備中...' : 'パスワードを変更'}
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => window.location.hash = 'login'}
            >
              ログイン画面に戻る
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
