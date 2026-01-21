/**
 * ログイン/新規登録ページ
 * タブ切り替えで1ページにまとめ、ソーシャルログインにも対応
 */
import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { determineUserRole } from '@/utils/authUtils'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, Eye, EyeOff, 
  Sparkles, AlertCircle, CheckCircle, Loader2
} from 'lucide-react'

// ソーシャルログインアイコン
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#5865F2">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  )
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

interface LoginFormProps {
  signup?: boolean
}

type AuthMode = 'login' | 'signup' | 'forgot'

export function LoginForm({ signup = false }: LoginFormProps = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<AuthMode>(signup ? 'signup' : 'login')
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { signIn, loading } = useAuth()
  
  // 新規登録用の追加フィールド
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  
  // フィールド別のインラインエラー
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  
  // メールアドレスのリアルタイムバリデーション
  const validateEmail = (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('有効なメールアドレスを入力してください')
    } else {
      setEmailError('')
    }
  }
  
  // パスワードのリアルタイムバリデーション
  const validatePassword = (value: string) => {
    if (mode === 'signup' && value && value.length < 6) {
      setPasswordError('6文字以上で入力してください')
    } else {
      setPasswordError('')
    }
    // 確認用パスワードとの一致チェック
    if (confirmPassword && value !== confirmPassword) {
      setConfirmPasswordError('パスワードが一致しません')
    } else if (confirmPassword) {
      setConfirmPasswordError('')
    }
  }
  
  // パスワード確認のリアルタイムバリデーション
  const validateConfirmPassword = (value: string) => {
    if (value && value !== password) {
      setConfirmPasswordError('パスワードが一致しません')
    } else {
      setConfirmPasswordError('')
    }
  }

  // URLパラメータから初期モードを設定
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('signup') === 'true' || signup) {
      setMode('signup')
    }
  }, [signup])

  // モード切替時にフォームをリセット
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode)
    setError('')
    setMessage('')
    setPassword('')
    setConfirmPassword('')
    setCustomerName('')
    setCustomerPhone('')
    setEmailError('')
    setPasswordError('')
    setConfirmPasswordError('')
    setNameError('')
    setPhoneError('')
  }

  // ソーシャルログイン
  const handleSocialLogin = async (provider: 'google' | 'discord' | 'twitter') => {
    try {
      setError('')
      // 戻り先URLをsessionStorageから取得（予約フローなどからのリダイレクト対応）
      const returnUrl = sessionStorage.getItem('returnUrl') || '/'
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${returnUrl}`,
          // Googleの場合、毎回アカウント選択画面を表示
          queryParams: provider === 'google' ? {
            prompt: 'select_account',
          } : undefined,
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'ソーシャルログインに失敗しました'
      setError(message)
      logger.error('Social login error:', error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      setError('')
      setMessage('')
      
      if (mode === 'forgot') {
        // パスワードリセット
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setMessage('パスワードリセット用のメールを送信しました。メールをご確認ください。')
        
      } else if (mode === 'signup') {
        // 新規登録
        // 名前のバリデーション
        if (!customerName.trim()) {
          setNameError('お名前を入力してください')
          setIsSubmitting(false)
          return
        }
        // 電話番号のバリデーション
        if (!customerPhone.trim()) {
          setPhoneError('電話番号を入力してください（当日連絡用）')
          setIsSubmitting(false)
          return
        }
        if (password !== confirmPassword) {
          setError('パスワードが一致しません')
          setIsSubmitting(false)
          return
        }
        if (password.length < 6) {
          setError('パスワードは6文字以上で入力してください')
          setIsSubmitting(false)
          return
        }

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // メタデータにユーザー情報を保存（確認後にトリガーで使用可能）
            data: {
              name: customerName.trim(),
              phone: customerPhone.trim(),
            }
          }
        })
        
        if (error) {
          // 重複メールアドレスのエラーを日本語化
          if (error.message.includes('already registered') || error.message.includes('already exists')) {
            throw new Error('このメールアドレスは既に登録されています。ログインするか、パスワードリセットをお試しください。')
          }
          throw error
        }
        
        // usersテーブルとcustomersテーブルにレコードを作成
        // 注意: Supabaseの設定によってはメール確認前はuserがnullになる場合がある
        if (signUpData.user) {
          const role = determineUserRole(email)
          await supabase
            .from('users')
            .upsert({
              id: signUpData.user.id,
              email: email,
              role: role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
          
          // customersテーブルにも登録（予約時に使用）
          await supabase
            .from('customers')
            .upsert({
              user_id: signUpData.user.id,
              name: customerName.trim(),
              email: email,
              phone: customerPhone.trim(),
              visit_count: 0,
              total_spent: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'email' })
        } else {
          // userがnullでもcustomersテーブルには登録（user_idはnullで後から紐付け）
          await supabase
            .from('customers')
            .upsert({
              name: customerName.trim(),
              email: email,
              phone: customerPhone.trim(),
              visit_count: 0,
              total_spent: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'email' })
        }
        
        setMessage('確認メールを送信しました。メールのリンクをクリックしてアカウントを有効化してください。')
        
      } else {
        // ログイン
        await signIn(email, password)
        
        // ログイン成功メッセージを表示
        setMessage('ログイン成功！リダイレクト中...')
        setError('') // エラーをクリア
        
        // ログイン成功後のリダイレクト
        // 戻り先URLがある場合はそこへ、なければ通常のリダイレクト
        const returnUrl = sessionStorage.getItem('returnUrl')
        if (returnUrl) {
          sessionStorage.removeItem('returnUrl') // クリア
          window.location.href = returnUrl
          return
        }
        
        // AuthContextがユーザー情報を更新するのを少し待ってからリダイレクト
        setTimeout(async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const { data: staffData } = await supabase
                .from('staff')
                .select('organization_id, role')
                .eq('user_id', user.id)
                .maybeSingle()
              
              if (staffData?.organization_id) {
                const { data: orgData } = await supabase
                  .from('organizations')
                  .select('slug')
                  .eq('id', staffData.organization_id)
                  .single()
                
                if (staffData.role === 'admin' || staffData.role === 'staff') {
                  window.location.href = '/dashboard'
                } else {
                  window.location.href = `/${orgData?.slug || 'queens-waltz'}`
                }
              } else {
                window.location.href = '/'
              }
            } else {
              window.location.href = '/'
            }
          } catch (err) {
            // リダイレクト処理でエラーが発生しても、とりあえずトップに遷移
            logger.error('Redirect error:', err)
            window.location.href = '/'
          }
        }, 500)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : ''
      
      if (mode === 'forgot') {
        // パスワードリセットは成功・失敗を区別しない（セキュリティ上）
        setMessage('パスワードリセット用のメールを送信しました。登録済みのアドレスの場合、メールが届きます。')
      } else if (mode === 'signup') {
        // 新規登録エラーを適切に表示
        if (errorMessage.includes('already registered') || errorMessage.includes('already exists') || errorMessage.includes('既に登録')) {
          setError('このメールアドレスは既に登録されています。ログインするか、パスワードリセットをお試しください。')
        } else if (errorMessage.includes('Invalid email')) {
          setError('有効なメールアドレスを入力してください')
        } else if (errorMessage.includes('Password')) {
          setError('パスワードは6文字以上で入力してください')
        } else {
          setError('アカウント作成に失敗しました: ' + (errorMessage || 'もう一度お試しください'))
        }
      } else {
        // ログインエラー
        if (errorMessage.includes('Invalid login credentials')) {
          setError('メールアドレスまたはパスワードが正しくありません')
        } else if (errorMessage.includes('Email not confirmed')) {
          setError('メールアドレスが確認されていません。確認メールのリンクをクリックしてください')
        } else if (errorMessage.includes('too many requests')) {
          setError('ログイン試行回数が多すぎます。しばらく待ってから再度お試しください')
        } else {
          setError('ログインに失敗しました。もう一度お試しください')
        }
      }
      logger.error('Auth error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading = loading || isSubmitting

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
          <Link 
            to="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            トップページへ
          </Link>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* カード */}
          <div className="bg-white border border-gray-200 shadow-lg">
            {/* タブヘッダー */}
            {mode !== 'forgot' && (
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 py-4 text-center font-medium transition-colors ${
                    mode === 'login'
                      ? 'text-white border-b-2'
                      : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                  }`}
                  style={mode === 'login' ? { 
                    backgroundColor: THEME.primary,
                    borderBottomColor: THEME.primary 
                  } : {}}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`flex-1 py-4 text-center font-medium transition-colors ${
                    mode === 'signup'
                      ? 'text-white border-b-2'
                      : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                  }`}
                  style={mode === 'signup' ? { 
                    backgroundColor: THEME.primary,
                    borderBottomColor: THEME.primary 
                  } : {}}
                >
                  新規登録
                </button>
              </div>
            )}

            {/* フォーム部分 */}
            <div className="p-6 sm:p-8">
              {/* タイトル */}
              <div className="text-center mb-6">
                {mode === 'forgot' ? (
                  <>
                    <h1 className="text-xl font-bold text-gray-900">パスワードをリセット</h1>
                    <p className="text-sm text-gray-500 mt-2">
                      登録したメールアドレスを入力してください
                    </p>
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5" style={{ color: THEME.primary }} />
                      <h1 className="text-xl font-bold text-gray-900">アカウント作成</h1>
                    </div>
                    <p className="text-sm text-gray-500">
                      MMQで素敵なマーダーミステリー体験を
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-gray-900">おかえりなさい</h1>
                    <p className="text-sm text-gray-500 mt-2">
                      アカウントにログインしてください
                    </p>
                  </>
                )}
              </div>

              {/* ソーシャルログインボタン */}
              {mode !== 'forgot' && (
                <>
                  <div className="space-y-3 mb-6">
                    <button
                      type="button"
                      onClick={() => handleSocialLogin('google')}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <GoogleIcon className="w-5 h-5" />
                      <span className="text-sm font-medium text-gray-700">
                        Googleで{mode === 'signup' ? '登録' : 'ログイン'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSocialLogin('discord')}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <DiscordIcon className="w-5 h-5" />
                      <span className="text-sm font-medium text-gray-700">
                        Discordで{mode === 'signup' ? '登録' : 'ログイン'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSocialLogin('twitter')}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <TwitterIcon className="w-5 h-5" />
                      <span className="text-sm font-medium text-gray-700">
                        X（Twitter）で{mode === 'signup' ? '登録' : 'ログイン'}
                      </span>
                    </button>
                  </div>

                  {/* 区切り線 */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">または</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </>
              )}

              {/* メッセージ表示（エラーはボタン直前に表示するのでここでは除外） */}
              {message && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">{message}</p>
                </div>
              )}

              {/* フォーム */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 新規登録時のみ：お名前 */}
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1.5">
                      お名前 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="customerName"
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value)
                        if (e.target.value.trim()) setNameError('')
                      }}
                      required
                      autoComplete="name"
                      placeholder="山田 太郎"
                      className={`h-12 ${nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      style={{ borderRadius: 0 }}
                    />
                    {nameError && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {nameError}
                      </p>
                    )}
                  </div>
                )}

                {/* 新規登録時のみ：電話番号 */}
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700 mb-1.5">
                      電話番号 <span className="text-red-500">*</span>
                      <span className="text-xs text-gray-500 ml-2">（当日連絡用）</span>
                    </label>
                    <Input
                      id="customerPhone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value)
                        if (e.target.value.trim()) setPhoneError('')
                      }}
                      required
                      autoComplete="tel"
                      placeholder="090-1234-5678"
                      className={`h-12 ${phoneError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      style={{ borderRadius: 0 }}
                    />
                    {phoneError && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {phoneError}
                      </p>
                    )}
                  </div>
                )}

                {/* メールアドレス */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    メールアドレス
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      validateEmail(e.target.value)
                    }}
                    onBlur={(e) => validateEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="your@email.com"
                    className={`h-12 ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    style={{ borderRadius: 0 }}
                  />
                  {emailError && (
                    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {emailError}
                    </p>
                  )}
                </div>

                {/* パスワード */}
                {mode !== 'forgot' && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      パスワード
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          validatePassword(e.target.value)
                        }}
                        onBlur={(e) => validatePassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder={mode === 'signup' ? '6文字以上' : 'パスワード'}
                        className={`pr-10 h-12 ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                        style={{ borderRadius: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {mode === 'signup' && !passwordError && (
                      <p className="mt-1 text-xs text-gray-500">
                        6文字以上で入力してください
                      </p>
                    )}
                    {passwordError && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {passwordError}
                      </p>
                    )}
                  </div>
                )}

                {/* パスワード確認（新規登録時のみ） */}
                {mode === 'signup' && (
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                      パスワード（確認）
                    </label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        validateConfirmPassword(e.target.value)
                      }}
                      onBlur={(e) => validateConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="パスワードを再入力"
                      className={`h-12 ${confirmPasswordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      style={{ borderRadius: 0 }}
                    />
                    {confirmPasswordError && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {confirmPasswordError}
                      </p>
                    )}
                    {!confirmPasswordError && confirmPassword && password === confirmPassword && (
                      <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        パスワードが一致しています
                      </p>
                    )}
                  </div>
                )}

                {/* パスワード忘れリンク */}
                {mode === 'login' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-sm hover:underline"
                      style={{ color: THEME.primary }}
                    >
                      パスワードを忘れた場合
                    </button>
                  </div>
                )}

                {/* エラー表示（ボタン直前に表示して見逃し防止） */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* 送信ボタン */}
                <Button
                  type="submit"
                  className={`w-full h-12 text-base font-semibold ${error ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: error ? '#dc2626' : THEME.primary, borderRadius: 0 }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      {mode === 'forgot' ? 'リセットメールを送信' : mode === 'signup' ? 'アカウント作成' : 'ログイン'}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>

                {/* パスワードリセット時の戻るボタン */}
                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
                  >
                    ← ログインに戻る
                  </button>
                )}
              </form>

              {/* 利用規約リンク */}
              {mode === 'signup' && (
                <p className="mt-6 text-xs text-gray-500 text-center">
                  アカウントを作成することで、
                  <Link to="/terms" className="underline hover:text-gray-700">利用規約</Link>
                  および
                  <Link to="/privacy" className="underline hover:text-gray-700">プライバシーポリシー</Link>
                  に同意したものとみなされます。
                </p>
              )}
            </div>
          </div>

          {/* フッター */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              店舗運営者の方は
              <Link to="/for-business" className="ml-1 font-medium hover:underline" style={{ color: THEME.primary }}>
                こちら
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* フッターリンク */}
      <footer className="py-4 px-4 border-t border-gray-200">
        <div className="max-w-md mx-auto flex items-center justify-center gap-6 text-xs text-gray-400">
          <Link to="/terms" className="hover:text-gray-600">利用規約</Link>
          <Link to="/privacy" className="hover:text-gray-600">プライバシー</Link>
          <Link to="/contact" className="hover:text-gray-600">お問い合わせ</Link>
        </div>
      </footer>
    </div>
  )
}
