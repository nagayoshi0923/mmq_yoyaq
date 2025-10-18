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

  useEffect(() => {
    // URLのハッシュフラグメントからトークンを取得してセッションを確立
    const setupSession = async () => {
      try {
        // URLの形式: #reset-password#access_token=...&refresh_token=...
        const hash = window.location.hash
        logger.log('Current hash:', hash)
        
        // #reset-password# の後の部分を取得
        const tokenPart = hash.split('#reset-password#')[1]
        if (!tokenPart) {
          setError('無効なリセットリンクです。もう一度パスワードリセットを申請してください。')
          return
        }
        
        const hashParams = new URLSearchParams(tokenPart)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        
        logger.log('Access token:', accessToken ? 'Found' : 'Not found')
        logger.log('Refresh token:', refreshToken ? 'Found' : 'Not found')
        
        if (!accessToken || !refreshToken) {
          setError('無効なリセットリンクです。もう一度パスワードリセットを申請してください。')
          return
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
      
      // 3秒後にログイン画面へリダイレクト
      setTimeout(() => {
        window.location.hash = 'login'
      }, 3000)
    } catch (error: any) {
      setError('パスワードの更新に失敗しました: ' + (error.message || ''))
      logger.error('Password reset error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold text-green-800">パスワードを変更しました</h2>
            <p className="text-muted-foreground">
              新しいパスワードでログインできます。<br />
              ログイン画面に移動します...
            </p>
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
