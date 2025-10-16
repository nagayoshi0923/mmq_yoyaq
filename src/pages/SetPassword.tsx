// パスワード設定ページ（招待メールからのリンク先）
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, Lock } from 'lucide-react'

export function SetPassword() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    // URLからトークンを取得して検証
    const hash = window.location.hash
    if (!hash.includes('type=invite') && !hash.includes('type=recovery')) {
      setError('無効な招待リンクです')
    }
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // バリデーション
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
      // Supabaseのセッションを取得（招待リンクをクリックすると自動的にセッションが作成される）
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('セッションが無効です。招待リンクをもう一度確認してください。')
      }

      // パスワードを更新
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError

      setSuccess(true)

      // 3秒後にログイン画面にリダイレクト
      setTimeout(() => {
        window.location.hash = '#login'
      }, 3000)

    } catch (err: any) {
      console.error('Password set error:', err)
      setError(err.message || 'パスワードの設定に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-center">パスワードの設定が完了しました！</CardTitle>
            <CardDescription className="text-center">
              3秒後にログイン画面に移動します...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <Lock className="h-12 w-12 text-blue-600" />
          </div>
          <CardTitle className="text-center">パスワードを設定</CardTitle>
          <CardDescription className="text-center">
            新しいパスワードを設定してアカウントをアクティブ化します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">新しいパスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="6文字以上"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                パスワードは6文字以上で設定してください
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">パスワード確認</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="もう一度入力"
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  設定中...
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

