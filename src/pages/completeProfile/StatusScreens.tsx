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
import { successRedirectMessage, type SuccessDestination } from './successRedirect'
import type { SignupLinkError } from './linkError'
import { buildAuthUrl, buildSignupEmailRedirectTo } from '@/lib/authReturn'

export function SuccessScreen({ navigate, destination }: { navigate: NavigateFunction; destination: SuccessDestination }) {
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
            {successRedirectMessage(destination.kind)}
          </p>
          <Button 
            onClick={() => navigate(destination.url, { replace: true })}
            className="w-full"
            style={{ backgroundColor: THEME.primary }}
          >
            今すぐ移動する
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
  /** リンクが使えなかった理由（URL から読んだもの） */
  linkError: SignupLinkError
  /** 登録後に戻る画面（再送するメールのリンクにも載せる） */
  nextUrl: string | null
}

/**
 * 確認メールのリンクが使えないとき（期限切れ・使用済み・ログイン情報なし）の画面（点検 11）。
 * 今の仕組みはどのブラウザで開いてもよいため「同じブラウザで開く」案内はしない。
 */
export function ReopenLinkScreen({ resendEmailInput, setResendEmailInput, resendMessage, setResendMessage, resendError, setResendError, resendLoading, setResendLoading, navigate, linkError, nextUrl }: ReopenLinkScreenProps) {
  const title = linkError === 'other' ? '確認リンクを開けませんでした' : 'リンクの期限が切れました'
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8 text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-amber-800">{title}</h2>
          <p className="text-muted-foreground text-sm">
            もう一度メールを送ってください。<br />
            確認メールのリンクは一度だけ使え、時間が経つと使えなくなります。
          </p>
          <div className="border border-border rounded-lg p-4 text-left space-y-2 bg-white">
            <label htmlFor="resend-email" className="ts-label block">登録したメールアドレス</label>
            <Input
              id="resend-email"
              type="email"
              placeholder="例: your@email.com"
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
              className="w-full"
              style={{ backgroundColor: THEME.primary }}
              disabled={resendLoading}
              onClick={async () => {
                setResendError('')
                setResendMessage('')
                const redirect = buildSignupEmailRedirectTo(window.location.origin, nextUrl)
                setResendLoading(true)
                try {
                  const result = await resendSignupConfirmationEmail(
                    resendEmailInput,
                    redirect
                  )
                  if (result.ok) {
                    setResendMessage(
                      '送信しました。届いたメールのリンクを開いてください（迷惑メールフォルダもご確認ください）。'
                    )
                  } else {
                    setResendError(result.message)
                  }
                } finally {
                  setResendLoading(false)
                }
              }}
            >
              {resendLoading ? '送信中…' : 'もう一度メールを送る'}
            </Button>
          </div>
          <Button
            onClick={() => navigate(buildAuthUrl('signup', nextUrl), { replace: true })}
            className="w-full"
            variant="outline"
          >
            別のメールアドレスで登録する
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
