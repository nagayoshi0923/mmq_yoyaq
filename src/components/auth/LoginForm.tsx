import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { determineUserRole } from '@/utils/authUtils'

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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
        })
        
        if (error) throw error
        
        // usersテーブルにレコードを作成（トリガーに依存しない）
        if (signUpData.user) {
          // ロールを決定（メールアドレスから判定）
          const role = determineUserRole(email)
          
          // usersテーブルにレコードを作成
          const { error: upsertError } = await supabase
            .from('users')
            .upsert({
              id: signUpData.user.id,
              email: email,
              role: role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id'
            })
          
          if (upsertError) {
            logger.warn('usersテーブルへのレコード作成に失敗しました:', upsertError)
            // エラーでもサインアップは成功とみなす（後で修正可能）
          }
        }
        
        setMessage('確認メールを送信しました。メールをチェックしてアカウントを有効化してください。')
      } else {
        // ログイン処理
        await signIn(email, password)
        
        // ログイン成功後、ユーザーの組織に基づいてリダイレクト
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // スタッフ情報から組織を取得
          const { data: staffData } = await supabase
            .from('staff')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .single()
          
          if (staffData?.organization_id) {
            // 組織のslugを取得
            const { data: orgData } = await supabase
              .from('organizations')
              .select('slug')
              .eq('id', staffData.organization_id)
              .single()
            
            const slug = orgData?.slug || 'queens-waltz'
            
            // 管理者・スタッフはダッシュボードへ、それ以外は予約サイトへ
            if (staffData.role === 'admin' || staffData.role === 'staff') {
              window.location.hash = 'dashboard'
            } else {
              window.location.hash = `booking/${slug}`
            }
          } else {
            // スタッフでない場合（顧客）はデフォルトの予約サイトへ
            window.location.hash = 'booking/queens-waltz'
          }
        } else {
          window.location.hash = 'booking/queens-waltz'
        }
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
          setError('メールアドレスまたはパスワードが正しくありません。再度確認してください。')
        } else if (message.includes('Email not confirmed')) {
          setError('メールアドレスが確認されていません。受信トレイの確認メールのリンクをクリックしてください。')
        } else if (message.includes('Invalid Refresh Token') || message.includes('Refresh Token Not Found')) {
          setError('セッションの有効期限が切れました。再度ログインしてください。')
        } else if (message.includes('Network')) {
          setError('ネットワークエラーが発生しました。インターネット接続を確認してください。')
        } else if (message.includes('too many requests') || message.includes('rate limit')) {
          setError('ログイン試行回数が多すぎます。しばらく待ってから再度お試しください。')
        } else {
          setError('ログインに失敗しました: ' + message)
        }
      }
      logger.error('Auth error:', error)
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6">
          <CardTitle className="text-lg">
            {isSignUp ? 'アカウント作成' : 'Queens Waltz'}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base mt-2">
            {isForgotPassword 
              ? 'パスワードリセット' 
              : isSignUp 
                ? '新規アカウントを登録してください' 
                : 'マーダーミステリー店舗管理システム'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm sm:text-base font-medium">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm sm:text-base border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="your@email.com"
              />
            </div>
            
            {!isForgotPassword && (
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm sm:text-base font-medium">
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
                  className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm sm:text-base border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder={isSignUp ? "6文字以上のパスワード" : "パスワードを入力"}
                />
              </div>
            )}

            {error && (
              <div className="border-2 border-destructive rounded-md p-3 sm:p-4">
                <p className="text-destructive text-sm sm:text-base">{error}</p>
              </div>
            )}

            {message && (
              <div className="border-2 border-green-200 bg-green-50 rounded-md p-3 sm:p-4">
                <p className="text-green-800 text-sm sm:text-base">{message}</p>
              </div>
            )}


            <Button 
              type="submit" 
              className="w-full h-10 sm:h-11 text-sm sm:text-base" 
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
                className="w-full h-10 sm:h-11 text-sm sm:text-base" 
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
              className="w-full text-xs sm:text-sm h-auto py-2" 
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
