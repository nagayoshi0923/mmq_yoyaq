/**
 * 招待受諾ページ
 * @page AcceptInvitation
 * @path #accept-invitation?token=xxx
 * @purpose 招待リンクからアクセスし、パスワードを設定してアカウントを作成
 * @access 未ログインユーザー（招待トークン必須）
 * @organization 招待に紐づく組織
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Mail, 
  User, 
  Lock, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertCircle
} from 'lucide-react'
import { getInvitationByToken, acceptInvitation } from '@/lib/api/invitationsApi'
import type { OrganizationInvitation } from '@/types'

interface AcceptInvitationProps {
  token: string
}

export default function AcceptInvitation({ token }: AcceptInvitationProps) {
  const [invitation, setInvitation] = useState<OrganizationInvitation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // トークンで招待を取得
  useEffect(() => {
    async function loadInvitation() {
      if (!token) {
        setError('招待トークンが指定されていません')
        setIsLoading(false)
        return
      }

      const { data, error } = await getInvitationByToken(token)
      
      if (error || !data) {
        setError('招待が見つかりません。リンクが正しいか確認してください。')
        setIsLoading(false)
        return
      }

      // 有効期限チェック
      if (new Date(data.expires_at) < new Date()) {
        setError('招待の有効期限が切れています。管理者に再招待を依頼してください。')
        setIsLoading(false)
        return
      }

      // 既に受諾済みかチェック
      if (data.accepted_at) {
        setError('この招待は既に使用されています。ログインページからログインしてください。')
        setIsLoading(false)
        return
      }

      setInvitation(data)
      setIsLoading(false)
    }

    loadInvitation()
  }, [token])

  // パスワードバリデーション
  const validatePassword = (): boolean => {
    if (password.length < 8) {
      setPasswordError('パスワードは8文字以上で入力してください')
      return false
    }
    if (password !== confirmPassword) {
      setPasswordError('パスワードが一致しません')
      return false
    }
    setPasswordError(null)
    return true
  }

  // 招待を受諾
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validatePassword()) return
    if (!invitation) return

    setIsSubmitting(true)
    setError(null)

    const result = await acceptInvitation({
      token,
      password,
    })

    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error || '登録に失敗しました')
    }

    setIsSubmitting(false)
  }

  // ローディング中
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // エラー表示
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle>招待を受け付けられません</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => window.location.hash = 'login'}>
              ログインページへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 成功表示
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle>登録が完了しました！</CardTitle>
            <CardDescription>
              確認メールが送信されました。メールを確認してアカウントを有効化してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-6">
              メール認証後、設定したパスワードでログインできます。
            </p>
            <Button onClick={() => window.location.hash = 'login'}>
              ログインページへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 招待受諾フォーム
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>MMQへようこそ</CardTitle>
          <CardDescription>
            {invitation?.organization?.name} への招待を受諾してアカウントを作成します
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 招待情報 */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">組織:</span>
              <span className="font-medium">{invitation?.organization?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">名前:</span>
              <span className="font-medium">{invitation?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">メール:</span>
              <span className="font-medium">{invitation?.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground ml-6">役割:</span>
              {invitation?.role.map((r, i) => (
                <Badge key={i} variant="secondary">{r}</Badge>
              ))}
            </div>
          </div>

          {/* パスワード設定フォーム */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上"
                  className="pl-10"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワード（確認）</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {passwordError}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              アカウントを作成
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-4">
            既にアカウントをお持ちの場合は
            <a href="#login" className="text-primary hover:underline ml-1">
              ログイン
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

