/**
 * @page AuthorLogin
 * @path #author-login
 * @purpose 作者専用ログインページ（マジックリンク方式）
 * @access 全員
 * 
 * 機能:
 * - メールアドレスを入力してマジックリンクをリクエスト
 * - パスワード不要でログイン可能
 * - ログイン後は #author-dashboard へ遷移
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Loader2, Mail, PenTool } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function AuthorLogin() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email.trim()) {
      setError('メールアドレスを入力してください')
      return
    }

    // 簡易的なメール形式チェック
    if (!email.includes('@') || !email.includes('.')) {
      setError('有効なメールアドレスを入力してください')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Supabase Magic Link を送信
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/#author-dashboard`
        }
      })

      if (authError) {
        throw authError
      }

      setSent(true)
    } catch (err: any) {
      console.error('Failed to send magic link:', err)
      setError(err.message || 'マジックリンクの送信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 送信完了画面
  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-red-500/5 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">メールを送信しました</h2>
            <p className="text-muted-foreground mb-6">
              <strong>{email}</strong> 宛に<br />
              ログインリンクを送信しました
            </p>
            
            <div className="bg-muted/50 rounded-lg p-4 text-left mb-6">
              <p className="text-sm font-medium mb-2">次のステップ:</p>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li>1. メールを確認してください</li>
                <li>2. 「ダッシュボードにログイン」をクリック</li>
                <li>3. 自動でログインしてダッシュボードが開きます</li>
              </ol>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              メールが届かない場合は、迷惑メールフォルダをご確認ください
            </p>

            <Button 
              variant="outline" 
              onClick={() => {
                setSent(false)
                setEmail('')
              }}
            >
              別のメールアドレスで試す
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-red-500/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <PenTool className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">作者ダッシュボード</CardTitle>
          <CardDescription>
            シナリオの公演報告・ライセンス収入を確認
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="author@example.com"
                  className="pl-10"
                  disabled={loading}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                シナリオに登録されているメールアドレスを入力してください
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  送信中...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  ログインリンクを送信
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-muted-foreground mb-2">
              パスワード不要でログインできます
            </p>
            <p className="text-xs text-muted-foreground">
              入力したメールアドレス宛にログインリンクが届きます。<br />
              リンクをクリックするだけでログイン完了！
            </p>
          </div>
        </CardContent>
      </Card>

      {/* フッターリンク */}
      <div className="fixed bottom-4 left-0 right-0 text-center">
        <button
          onClick={() => window.location.hash = '#about'}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          MMQについて
        </button>
      </div>
    </div>
  )
}

