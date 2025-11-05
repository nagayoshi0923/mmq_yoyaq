import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface LoginFormProps {
  signup?: boolean
}

export function LoginForm({ signup = false }: LoginFormProps = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(signup)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, loading } = useAuth()

  // URLパラメータからsignup=trueを読み取って新規登録モードに切り替え（後方互換性のため）
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('signup') === 'true' || signup) {
      setIsSignUp(true)
      setIsForgotPassword(false)
      setError('')
      setMessage('')
    }
  }, [signup])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    try {
      setError('')
      setMessage('')
      
      if (isForgotPassword) {
        // パスワードリセット処理
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        })
        
        if (error) throw error
        
        setMessage('パスワードリセット用のメールを送信しました。メールをチェックしてください。')
      } else if (isSignUp) {
        // サインアップ処理
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        
        if (error) throw error
        
        setMessage('確認メールを送信しました。メールをチェックしてアカウントを有効化してください。')
      } else {
        // ログイン処理
        await signIn(email, password)
        // ログイン成功後、予約サイトへリダイレクト
        window.location.hash = 'customer-booking'
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      
      if (isForgotPassword) {
        // セキュリティ対策: メールアドレスの存在を確認できないよう、エラーでも成功メッセージを表示
        setMessage('パスワードリセット用のメールを送信しました。登録済みのアドレスの場合、メールが届きます。')
        setEmail('')
      } else if (isSignUp) {
        // セキュリティ対策: メールアドレスの存在を確認できないよう、常に同じメッセージを表示
        setMessage('アカウント登録を受け付けました。確認メールを送信しましたので、メールをチェックしてアカウントを有効化してください。')
        setEmail('')
        setPassword('')
      } else {
        // ログイン
        if (message.includes('Invalid login credentials')) {
          setError('メールアドレスまたはパスワードが正しくありません')
        } else if (message.includes('Email not confirmed')) {
          setError('メールアドレスが確認されていません。受信トレイの確認メールのリンクをクリックしてください。')
        } else {
          setError('ログインに失敗しました: ' + message)
        }
      }
      logger.error('Auth error:', error)
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {isSignUp ? 'アカウント作成' : 'Queens Waltz'}
          </CardTitle>
          <CardDescription>
            {isForgotPassword 
              ? 'パスワードリセット' 
              : isSignUp 
                ? '新規アカウントを登録してください' 
                : 'マーダーミステリー店舗管理システム'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="your@email.com"
              />
            </div>
            
            {!isForgotPassword && (
              <div className="space-y-2">
                <label htmlFor="password" className="block">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder={isSignUp ? "6文字以上のパスワード" : "パスワードを入力"}
                />
              </div>
            )}

            {error && (
              <div className="border-2 border-destructive rounded-md p-3">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {message && (
              <div className="border-2 border-green-200 bg-green-50 rounded-md p-3">
                <p className="text-green-800">{message}</p>
              </div>
            )}


            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading 
                ? (isForgotPassword ? 'メール送信中...' : isSignUp ? 'アカウント作成中...' : 'ログイン中...') 
                : (isForgotPassword ? 'リセットメールを送信' : isSignUp ? 'アカウント作成' : 'ログイン')}
            </Button>

            {!isForgotPassword && (
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full" 
                onClick={() => {
                  if (isSignUp) {
                    // 新規登録からログインに戻る場合はログインページに遷移
                    window.location.hash = 'login'
                  } else {
                    // ログインから新規登録に切り替える場合は新規登録ページに遷移
                    window.location.hash = 'signup'
                  }
                }}
              >
                {isSignUp ? 'ログインに戻る' : 'アカウントを作成'}
              </Button>
            )}

            <Button 
              type="button" 
              variant="link" 
              className="w-full text-sm" 
              onClick={() => {
                setIsForgotPassword(!isForgotPassword)
                setIsSignUp(false)
                setError('')
                setMessage('')
              }}
            >
              {isForgotPassword ? 'ログインに戻る' : 'パスワードを忘れた場合'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
