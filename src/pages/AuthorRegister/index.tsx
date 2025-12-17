/**
 * @page AuthorRegister
 * @path #author-register
 * @purpose シナリオ作者の新規登録ページ
 * @access 認証済みユーザー
 * 
 * 機能:
 * - 作者アカウントの新規作成
 * - プロフィール情報の入力
 * - 既存の作者アカウントがある場合はダッシュボードへリダイレクト
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BookOpen, CheckCircle, Loader2, PenTool } from 'lucide-react'
import { authorApi } from '@/lib/api/authorApi'
import { supabase } from '@/lib/supabase'

export default function AuthorRegister() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  
  // フォームフィールド
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    checkExistingAuthor()
  }, [])

  const checkExistingAuthor = async () => {
    try {
      // ユーザー情報を取得
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 未認証の場合はログインへ
        window.location.hash = '#login?redirect=author-register'
        return
      }

      setUserEmail(user.email || null)

      // 既存の作者アカウントをチェック
      const existingAuthor = await authorApi.getCurrentAuthor()
      if (existingAuthor) {
        // 既にアカウントがある場合はダッシュボードへ
        window.location.hash = '#author-dashboard'
        return
      }
    } catch (err) {
      console.error('Failed to check existing author:', err)
    } finally {
      setLoading(false)
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = '名前は必須です'
    } else if (name.length < 2) {
      newErrors.name = '名前は2文字以上で入力してください'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    try {
      setSubmitting(true)
      setSubmitError(null)

      await authorApi.registerAuthor({
        name: name.trim(),
        email: userEmail || '',
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined
      })

      setSuccess(true)

      // 3秒後にダッシュボードへ
      setTimeout(() => {
        window.location.hash = '#author-dashboard'
      }, 3000)
    } catch (err: any) {
      console.error('Failed to register author:', err)
      setSubmitError(err.message || '登録に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <Card className="text-center">
          <CardContent className="pt-12 pb-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">登録完了！</h2>
            <p className="text-muted-foreground mb-4">
              作者アカウントが作成されました。<br />
              まもなくダッシュボードへ移動します...
            </p>
            <Button onClick={() => window.location.hash = '#author-dashboard'}>
              今すぐダッシュボードへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
          <PenTool className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">作者アカウント登録</h1>
        <p className="text-muted-foreground">
          シナリオ著者としてMMQに登録し、公演報告を受け取りましょう
        </p>
      </div>

      {/* メリット説明 */}
      <Alert className="mb-8 bg-blue-500/5 border-blue-500/20">
        <BookOpen className="h-4 w-4" />
        <AlertDescription>
          <strong>作者アカウントのメリット:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>各会社からの公演報告をリアルタイムで確認</li>
            <li>ライセンス収入の集計・管理</li>
            <li>公演統計の閲覧</li>
            <li>プロフィールページの公開</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* 登録フォーム */}
      <Card>
        <CardHeader>
          <CardTitle>作者情報</CardTitle>
          <CardDescription>
            シナリオ著者としての情報を入力してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 名前 */}
            <div className="space-y-2">
              <Label htmlFor="name">
                著者名 / ペンネーム <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="シナリオに記載される名前"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
              <p className="text-sm text-muted-foreground">
                シナリオに記載されている著者名と一致させてください
              </p>
            </div>

            {/* 表示名 */}
            <div className="space-y-2">
              <Label htmlFor="displayName">表示名（オプション）</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="公開時に表示する名前"
              />
              <p className="text-sm text-muted-foreground">
                空欄の場合は著者名がそのまま表示されます
              </p>
            </div>

            {/* メールアドレス */}
            <div className="space-y-2">
              <Label>メールアドレス</Label>
              <Input
                value={userEmail || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                ログイン中のアカウントのメールアドレスが使用されます
              </p>
            </div>

            {/* 自己紹介 */}
            <div className="space-y-2">
              <Label htmlFor="bio">自己紹介（オプション）</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="シナリオ作家としての自己紹介"
                rows={4}
              />
            </div>

            {/* 送信ボタン */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.hash = '#about'}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                作者アカウントを作成
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 既存作者へのリンク */}
      <div className="text-center mt-8 text-sm text-muted-foreground">
        既に作者アカウントをお持ちですか？{' '}
        <button
          onClick={() => window.location.hash = '#author-dashboard'}
          className="text-primary hover:underline"
        >
          ダッシュボードへ
        </button>
      </div>
    </div>
  )
}

