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
  const [message, setMessage] = useState('')
  const { signIn, loading } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    try {
      setError('')
      setMessage('')
      
      if (isSignUp) {
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
      }
    } catch (error: any) {
      if (isSignUp) {
        setError('アカウント作成に失敗しました。' + (error.message || ''))
      } else {
        setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。')
      }
      console.error('Auth error:', error)
    }
  }

  async function createTestAccount(role: 'admin' | 'staff' | 'customer') {
    // より現実的なテスト用メールアドレスを使用
    const testEmail = `${role}.test@example.com`
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
      setMessage(`${role}用テストアカウントを作成しました。確認メールをチェックしてください。`)
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
            マーダーミステリー店舗管理システム
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
              {loading ? (isSignUp ? 'アカウント作成中...' : 'ログイン中...') : (isSignUp ? 'アカウント作成' : 'ログイン')}
            </Button>

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
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="space-y-4">
              <h4>テスト用アカウント作成</h4>
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
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><strong>管理者権限:</strong></p>
                <p>• mai.nagayoshi@gmail.com</p>
                <p>• admin@～ を含むメール</p>
                <p><strong>スタッフ権限:</strong></p>
                <p>• staff@～ を含むメール</p>
                <p><strong>その他:</strong> 顧客権限</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
