/**
 * プロフィール設定ページ
 * 初回ログイン後に氏名・電話番号を設定（OAuthでも必須）
 * メールサインアップ（確認メール経由）の場合はパスワードも設定
 * @path /complete-profile
 */
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react'
import { logger } from '@/utils/logger'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Link } from 'react-router-dom'

// デフォルト組織ID（クインズワルツ）
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

export function CompleteProfile() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [isOAuthUser, setIsOAuthUser] = useState(false)

  useEffect(() => {
    // セッションを確認
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          setUserEmail(session.user.email || '')
          setUserId(session.user.id)
          const provider = (session.user.app_metadata as any)?.provider as string | undefined
          setIsOAuthUser(Boolean(provider && provider !== 'email'))
          logger.log('✅ セッション確認完了:', session.user.email)
        } else {
          logger.warn('セッションが見つかりません')
          setError('セッションが無効です。もう一度メールのリンクをクリックしてください。')
        }
      } catch (err) {
        logger.error('Session check error:', err)
        setError('エラーが発生しました。もう一度お試しください。')
      } finally {
        setIsCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // バリデーション
    if (!name.trim()) {
      setError('お名前を入力してください')
      return
    }
    
    if (!phone.trim()) {
      setError('電話番号を入力してください')
      return
    }
    
    const phoneDigits = phone.replace(/[-\s]/g, '')
    if (!/^\d{10,11}$/.test(phoneDigits)) {
      setError('電話番号は10〜11桁で入力してください')
      return
    }
    if (!userEmail.trim()) {
      setError('メールアドレスが取得できませんでした。別のログイン方法をお試しください。')
      return
    }

    // メールサインアップ（確認メール）ではパスワード設定が必要
    if (!isOAuthUser) {
      if (password.length < 6) {
        setError('パスワードは6文字以上で入力してください')
        return
      }
      
      if (password !== confirmPassword) {
        setError('パスワードが一致しません')
        return
      }
    }
    
    setIsLoading(true)
    
    try {
      // next（完了後の遷移先）: open redirect対策として相対パスのみ許可
      const nextParam = new URLSearchParams(window.location.search).get('next')
      const nextUrl =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

      // 1. パスワードを設定（メールサインアップのみ）
      if (!isOAuthUser) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        })
        
        if (updateError) {
          throw updateError
        }
        
        logger.log('✅ パスワード設定完了')
      }
      
      // 2. usersテーブルにレコードを作成/更新
      const { data: existingUser } = await supabase
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .maybeSingle()

      // CompleteProfile は顧客向け。既に staff/admin 等が設定済みなら維持、それ以外は customer に固定。
      const role =
        existingUser?.role === 'admin' ||
        existingUser?.role === 'staff' ||
        existingUser?.role === 'license_admin'
          ? existingUser.role
          : 'customer'

      const organizationId = existingUser?.organization_id || DEFAULT_ORG_ID
      await supabase
        .from('users')
        .upsert({
          id: userId,
          email: userEmail,
          role: role,
          organization_id: organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
      
      logger.log('✅ usersテーブル更新完了')
      
      // 3. customersテーブルにレコードを作成
      const { error: customerError } = await supabase
        .from('customers')
        .upsert({
          user_id: userId,
          name: name.trim(),
          email: userEmail,
          phone: phone.trim(),
          visit_count: 0,
          total_spent: 0,
          organization_id: organizationId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' }) // email ではなく user_id で競合判定

      if (customerError) {
        throw customerError
      }
      
      logger.log('✅ customersテーブル作成完了')
      
      setSuccess(true)
      
      // 3秒後にトップページへリダイレクト
      setTimeout(() => {
        window.location.href = nextUrl
      }, 3000)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
      setError('登録に失敗しました: ' + errorMessage)
      logger.error('Complete profile error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 sm:p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-xl font-bold text-green-800">登録完了！</h2>
            <p className="text-muted-foreground">
              アカウントの設定が完了しました。
            </p>
            <p className="text-sm text-gray-500">
              3秒後にトップページに移動します...
            </p>
            <Button 
              onClick={() => window.location.href = '/'}
              className="w-full"
              style={{ backgroundColor: THEME.primary }}
            >
              今すぐトップページへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!userId && !isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 sm:p-8 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-red-800">セッションエラー</h2>
            <p className="text-muted-foreground">
              セッションが無効または期限切れです。
            </p>
            <Button 
              onClick={() => window.location.href = '/login?signup=true'}
              className="w-full"
              variant="outline"
            >
              新規登録画面に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#FAFAFA' }}
    >
      {/* ヘッダー */}
      <header className="py-4 px-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span 
              className="text-xl font-bold"
              style={{ color: THEME.primary }}
            >
              MMQ
            </span>
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card className="border border-gray-200 shadow-lg">
            <CardHeader className="text-center px-6 pt-8 pb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <UserPlus className="w-6 h-6" style={{ color: THEME.primary }} />
                <CardTitle className="text-xl">アカウント設定</CardTitle>
              </div>
              <CardDescription>
                あと少しで登録完了です！<br />
                以下の情報を入力してください。
              </CardDescription>
              {userEmail && (
                <p className="text-sm text-gray-600 mt-2">
                  メール: <span className="font-medium">{userEmail}</span>
                </p>
              )}
            </CardHeader>
            
            <CardContent className="px-6 pb-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* お名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    お名前 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="山田 太郎"
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* 電話番号 */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                    電話番号 <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-2">（当日連絡用）</span>
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="090-1234-5678"
                    className="h-12"
                    disabled={isLoading}
                  />
                </div>

                {/* パスワード（メールサインアップのみ） */}
                {!isOAuthUser && (
                  <>
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                        パスワード <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          placeholder="6文字以上"
                          className="pr-10 h-12"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        6文字以上で入力してください
                      </p>
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                        パスワード（確認） <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="もう一度入力"
                        className="h-12"
                        disabled={isLoading}
                      />
                      {confirmPassword && password === confirmPassword && (
                        <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          パスワードが一致しています
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* エラー表示 */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* 送信ボタン */}
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  style={{ backgroundColor: THEME.primary }}
                  disabled={isLoading}
                >
                  {isLoading ? '登録中...' : '登録を完了する'}
                </Button>
              </form>

              {/* 利用規約リンク */}
              <p className="mt-6 text-xs text-gray-500 text-center">
                登録することで、
                <Link to="/terms" className="underline hover:text-gray-700">利用規約</Link>
                および
                <Link to="/privacy" className="underline hover:text-gray-700">プライバシーポリシー</Link>
                に同意したものとみなされます。
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
