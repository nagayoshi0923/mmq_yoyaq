import type { Dispatch, SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { resendSignupConfirmationEmail } from '@/lib/authResendSignup'

export function SuccessScreen({ navigate }: { navigate: NavigateFunction }) {
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
            onClick={() => navigate('/', { replace: true })}
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

interface ReopenLinkScreenProps {
  resendEmailInput: string
  setResendEmailInput: Dispatch<SetStateAction<string>>
  resendMessage: string
  setResendMessage: Dispatch<SetStateAction<string>>
  resendError: string
  setResendError: Dispatch<SetStateAction<string>>
  resendLoading: boolean
  setResendLoading: Dispatch<SetStateAction<boolean>>
  navigate: NavigateFunction
}

export function ReopenLinkScreen({ resendEmailInput, setResendEmailInput, resendMessage, setResendMessage, resendError, setResendError, resendLoading, setResendLoading, navigate }: ReopenLinkScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-amber-800">確認リンクを開き直してください</h2>
          <p className="text-muted-foreground text-sm">
            セキュリティのため、確認メールのリンクは<br />
            <strong>登録時と同じブラウザ</strong>で開く必要があります。
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-left text-sm">
            <p className="font-medium text-amber-800 mb-2">解決方法：</p>
            <ol className="list-decimal list-inside text-amber-700 space-y-1">
              <li>登録時に使ったブラウザを開く</li>
              <li>確認メールのリンクをコピー</li>
              <li>そのブラウザに貼り付けて開く</li>
            </ol>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 text-left space-y-2 bg-white">
            <p className="text-sm font-medium text-gray-800">確認メールを再送する</p>
            <p className="text-xs text-gray-600">
              登録時のメールアドレスを入力して送信してください（登録途中の場合に再送できます）。
            </p>
            <Input
              type="email"
              placeholder="登録したメールアドレス"
              value={resendEmailInput}
              onChange={(e) => {
                setResendEmailInput(e.target.value)
                setResendError('')
                setResendMessage('')
              }}
              className="h-10"
            />
            {resendMessage && (
              <p className="text-xs text-green-700">{resendMessage}</p>
            )}
            {resendError && (
              <p className="text-xs text-red-600">{resendError}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={resendLoading}
              onClick={async () => {
                setResendError('')
                setResendMessage('')
                const redirect = `${window.location.origin}/complete-profile`
                setResendLoading(true)
                try {
                  const result = await resendSignupConfirmationEmail(
                    resendEmailInput,
                    redirect
                  )
                  if (result.ok) {
                    setResendMessage(
                      '送信しました。メールをご確認ください（迷惑メールフォルダもご確認ください）。'
                    )
                  } else {
                    setResendError(result.message)
                  }
                } finally {
                  setResendLoading(false)
                }
              }}
            >
              {resendLoading ? '送信中…' : '確認メールを再送'}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            別のメールでやり直す場合は新規登録画面へ。
          </p>
          <Button 
            onClick={() => navigate('/signup', { replace: true })}
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

export function DuplicateAccountScreen({ userEmail, navigate }: { userEmail: string; navigate: NavigateFunction }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-amber-800">このメールは既に登録されています</h2>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono text-xs break-all">{userEmail}</span>
            <br />
            <br />
            は<strong>別のアカウントですでに顧客登録</strong>されています。新規登録フローを続けるとデータが分かれてしまうため、
            <strong>元のアカウントでログイン</strong>してください。
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-left text-sm text-amber-900">
            <p className="font-medium mb-1">手順</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>下のボタンでログアウトする</li>
              <li>ログイン画面で、以前お使いの方法（メール・Google 等）でログイン</li>
            </ol>
          </div>
          <Button
            type="button"
            onClick={async () => {
              // scope:'local' でローカルセッションだけクリア（OAuth refresh token の revoke で
              // ハングする/エラーを投げるケースがあり、その場合に遷移しなくなるのを避ける）。
              try {
                await supabase.auth.signOut({ scope: 'local' })
              } catch (err) {
                logger.warn('signOut error (continuing anyway):', err)
              }
              sessionStorage.removeItem('oauth_mode')
              navigate('/login', { replace: true })
            }}
            className="w-full"
            style={{ backgroundColor: THEME.primary }}
          >
            ログアウトしてログイン画面へ
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">トップページへ</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
