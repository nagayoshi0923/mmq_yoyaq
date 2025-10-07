import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [message, setMessage] = useState('')
  const { signIn, loading } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    try {
      setError('')
      setMessage('')
      
      if (isForgotPassword) {
        // パスワードリセット処理
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/#reset-password`,
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
    } catch (error: any) {
      if (isForgotPassword) {
        setError('パスワードリセットメールの送信に失敗しました。' + (error.message || ''))
      } else if (isSignUp) {
        setError('アカウント作成に失敗しました。' + (error.message || ''))
      } else {
        // メール未確認エラーの場合
        if (error.message?.includes('Email not confirmed')) {
          setError('メールアドレスが確認されていません。登録時に送信された確認メールのリンクをクリックしてください。')
        } else {
          setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。')
        }
      }
      console.error('Auth error:', error)
    }
  }

  async function createTestAccount(role: 'admin' | 'staff' | 'customer') {
    // Gmailのエイリアス機能を使用（+記号）
    const timestamp = Date.now()
    const testEmail = `test+${role}${timestamp}@gmail.com`
    const testPassword = 'test123456'
    
    try {
      setError('')
      setMessage('')
      
      // テスト用アカウントを作成
      const { error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
      })
      
      if (error) throw error
      
      setEmail(testEmail)
      setPassword(testPassword)
      setMessage(`${role}用テストアカウントを作成しました。\nメール: ${testEmail}\nパスワード: ${testPassword}\n\n※ メールアドレスの確認が必要です。受信トレイを確認してください。`)
    } catch (error: any) {
      setError('テストアカウント作成に失敗しました。' + (error.message || ''))
      console.error('Test account creation error:', error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Queens Waltz</CardTitle>
          <CardDescription>
            {isForgotPassword ? 'パスワードリセット' : 'マーダーミステリー店舗管理システム'}
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
                  setIsSignUp(!isSignUp)
                  setError('')
                  setMessage('')
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

          {!isForgotPassword && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="space-y-4">
                <h4 className="font-semibold">テスト用アカウント作成</h4>
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm">
                  <p className="font-semibold text-yellow-800 mb-2">⚠️ 重要な注意</p>
                  <p className="text-yellow-700 text-xs">
                    アカウント作成後、メールアドレスの確認が必要です。<br/>
                    実際のメールアドレスを使用するか、Supabaseの設定で「Email confirmation」を無効にしてください。
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  ボタンをクリックして新しいテストアカウントを作成できます
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => createTestAccount('admin')}
                    className="bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100"
                  >
                    管理者
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => createTestAccount('staff')}
                    className="bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                  >
                    スタッフ
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => createTestAccount('customer')}
                    className="bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100"
                  >
                    顧客
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded">
                  <p className="font-semibold text-blue-800 mb-2">💡 権限の判定:</p>
                  <p>• メールに <strong>admin</strong> を含む → 管理者権限</p>
                  <p>• メールに <strong>staff</strong> を含む → スタッフ権限</p>
                  <p>• その他 → 顧客権限</p>
                </div>
                <div className="text-xs text-muted-foreground bg-gray-50 p-3 rounded">
                  <p className="font-semibold text-gray-700 mb-2">🔧 開発環境の設定:</p>
                  <p className="mb-1">Supabaseダッシュボードで以下を無効化すると、メール確認なしでログインできます：</p>
                  <p className="pl-2">Authentication → Settings → Enable email confirmations → OFF</p>
                </div>
              </div>
            </div>
          )}
          
          {isForgotPassword && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="space-y-3 text-sm text-muted-foreground bg-yellow-50 p-4 rounded">
                <p className="font-semibold text-yellow-800">⚠️ 開発環境の注意</p>
                <p>開発環境ではメール送信が制限されている場合があります。</p>
                <p className="font-semibold text-gray-700 mt-3">新しいアカウントを作成してください:</p>
                <p className="text-xs">「ログインに戻る」をクリックして、テスト用アカウント作成ボタンから新しいアカウントを作成できます。</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
