import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { logger } from '@/utils/logger'
import { getErrorMessage } from '@/lib/errorFields'
import { ensureRecoverySession } from './resetPassword/recoverySession'

// パスワードリセット中フラグ（AuthContextがロールを更新しないようにするため）
// sessionStorageを使用（XSS対策としてグローバル変数より安全）
const PASSWORD_RESET_FLAG_KEY = 'MMQ_PASSWORD_RESET_IN_PROGRESS'

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [tokens, setTokens] = useState<{ accessToken: string | null; refreshToken: string | null }>({
    accessToken: null,
    refreshToken: null,
  })
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [countdown, setCountdown] = useState(5)
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    // URLのハッシュフラグメントまたはクエリパラメータからトークンを取得
    const setupTokens = async () => {
      try {
        // ヘルパー関数: URLパラメータの取得
        const extractParam = (key: string): string | null => {
          // ハッシュから検索
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          let value = hashParams.get(key)
          
          if (value) return value

          // クエリパラメータから検索
          const searchParams = new URLSearchParams(window.location.search)
          value = searchParams.get(key)
          
          if (value) return value

          // URL全体から正規表現でパラメータを抽出する (最後の手段)
          const pattern = new RegExp(`${key}=([^&?#]*)`, 'i')
          const match = window.location.href.match(pattern)
          if (match && match[1]) {
            try {
              return decodeURIComponent(match[1])
            } catch {
              return match[1]
            }
          }
          return null
        }

        const accessToken = extractParam('access_token')
        const refreshToken = extractParam('refresh_token')
        const type = extractParam('type')
        // 使用済み・期限切れのリンクは、認証サーバーが error_code を付けて戻す（例: otp_expired）
        const linkErrorCode = extractParam('error_code')
        if (linkErrorCode && !accessToken) {
          logger.warn('リセットリンクのエラー:', linkErrorCode)
          setError('リセットリンクの有効期限が切れているか、すでに使われています。もう一度パスワードリセットを申請してください。')
          setIsCheckingSession(false)
          return
        }

        logger.log('🔧 ResetPassword: URL解析 v3', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type,
          url: window.location.href
        })

        // typeがrecoveryであることを確認（パスワードリセット用のリンク）
        if (type && type !== 'recovery') {
          logger.warn('予期しないリンクタイプ:', type)
          setError('このリンクはパスワードリセット用ではありません。')
          setIsCheckingSession(false)
          return
        }

        if (accessToken && refreshToken) {
          // トークンが見つかった場合、stateに保存
          // 既存セッションがあっても、リカバリートークンがあるならそれを優先するために保存する
          setTokens({ accessToken, refreshToken })
          setIsCheckingSession(false)
        } else if (type === 'recovery') {
          // typeがrecoveryだがトークンがない場合（Safari/iOS でハッシュが消えることがある）
          // URLからの再取得を試みる
          logger.warn('Recovery typeだがトークンがない - 既存セッションを確認')
          const { data: { session: existingSession } } = await supabase.auth.getSession()
          
          if (existingSession) {
            logger.log('既存のセッションが見つかりました（recoveryモード）')
            setTokens({ accessToken: null, refreshToken: null })
            setIsCheckingSession(false)
          } else {
            setError('リセットリンクの処理に失敗しました。もう一度メールのリンクをクリックするか、再申請してください。')
            setIsCheckingSession(false)
          }
        } else {
          // トークンがない場合、既存のセッションを確認
          const { data: { session: existingSession } } = await supabase.auth.getSession()
          
          if (existingSession) {
            logger.log('既存のセッションが見つかりました（トークンなし）')
            setTokens({ accessToken: null, refreshToken: null })
          } else {
            // セッションもトークンもない場合
            setError('無効なリセットリンクです。もう一度パスワードリセットを申請してください。')
          }
          setIsCheckingSession(false)
        }
      } catch (err) {
        logger.error('Setup error:', err)
        setError('エラーが発生しました。もう一度お試しください。')
        setIsCheckingSession(false)
      }
    }

    setupTokens()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (newPassword.length < 6) {
      setError('パスワードは6文字以上である必要があります')
      return
    }
    
    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }
    
    setIsLoading(true)
    
    // パスワードリセット中フラグを設定（AuthContextがロールを更新しないように）
    sessionStorage.setItem(PASSWORD_RESET_FLAG_KEY, 'true')
    
    try {
      // 1. リンクで作られたログインを使う（ログアウトはしない。src/pages/resetPassword/recoverySession.ts）
      const sessionResult = await ensureRecoverySession(supabase.auth, tokens)
      if (!sessionResult.ok) throw new Error(sessionResult.message)
      
      logger.log('🔑 パスワード更新リクエスト送信...')
      const { data: updateData, error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) {
        logger.error('Update user error:', error)
        // 「新しいパスワードが古いパスワードと同じ」エラーの場合、より分かりやすいメッセージを表示
        if (error.message.includes('should be different from the old password')) {
          throw new Error('新しいパスワードは現在のパスワードと異なるものを設定してください')
        }
        throw error
      }

      logger.log('✅ パスワード更新成功:', updateData)
      setSuccess(true)
      // フラグをクリア（成功後はsignOutするので問題ない）
      sessionStorage.removeItem(PASSWORD_RESET_FLAG_KEY)
    } catch (error) {
      setError('パスワードの更新に失敗しました: ' + (getErrorMessage(error) || ''))
      logger.error('Password reset error:', error)
      // エラー時もフラグをクリア
      sessionStorage.removeItem(PASSWORD_RESET_FLAG_KEY)
    } finally {
      setIsLoading(false)
    }
  }

  // 成功後のカウントダウン
  useEffect(() => {
    if (!success || isRedirecting) return

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (countdown === 0 && !isRedirecting) {
      // countdown が 0 になったらリダイレクト処理を開始
      setIsRedirecting(true)
    }
  }, [success, countdown, isRedirecting])

  // リダイレクト処理を別のuseEffectで実行
  useEffect(() => {
    if (isRedirecting) {
      supabase.auth.signOut().then(() => {
        // /login へリダイレクト
        window.location.href = window.location.origin + '/login'
      })
    }
  }, [isRedirecting])

  const handleGoToLogin = () => {
    if (isRedirecting) return // 既にリダイレクト中なら何もしない
    setIsRedirecting(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 sm:p-8 text-center space-y-4 sm:space-y-6">
            <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 text-green-600 mx-auto" />
            <h2 className="text-lg text-green-800">パスワードを変更しました</h2>
            <div className="space-y-2">
              <p className="text-sm sm:text-base text-muted-foreground">
                新しいパスワードでログインできます。
              </p>
              <p className="text-lg text-primary">
                {countdown}秒後にログイン画面に移動します...
              </p>
            </div>
            <Button 
              onClick={handleGoToLogin}
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6">
          <CardTitle className="text-lg">パスワードリセット</CardTitle>
          <CardDescription className="text-sm sm:text-base mt-2">新しいパスワードを設定してください</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label htmlFor="newPassword" className="block text-sm sm:text-base">
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
                className="text-sm sm:text-base"
                autoComplete="new-password"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm sm:text-base">
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
                className="text-sm sm:text-base"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="border-2 border-destructive rounded-md p-3 sm:p-4 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-destructive text-sm sm:text-base">{error}</p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-10 sm:h-11 text-sm sm:text-base" 
              disabled={isLoading || isCheckingSession}
            >
              {isLoading ? 'パスワードを変更中...' : isCheckingSession ? '準備中...' : 'パスワードを変更'}
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 sm:h-11 text-sm sm:text-base"
              onClick={() => window.location.href = '/login'}
            >
              ログイン画面に戻る
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
