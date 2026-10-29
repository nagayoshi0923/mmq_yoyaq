import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
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
import { signOutAndGoHome } from './signOutAndGoHome'

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

/**
 * ログイン（またはメール確認・Google など）自体はできたが、このメールアドレスのお客様情報が別のログインに結び付いている（2026-10-29 社長承認）。
 * 以前は「このメールは既に登録されています」「新規登録フローを続けると…」と出し、ログインした人にも新規登録を選んだように見えていた。
 * - 重複の防止はそのまま（ここでお客様情報を作らない・結び付け直さない・他のアカウントのメールアドレスは出さない）
 * - 選び直しはログイン情報を消してから（上限時間つき）、安全な内部の戻り先を付けたログイン画面へ。二度押しは 1 回だけ
 */
export function DuplicateAccountScreen({ userEmail, returnTo, signOutAndGo = signOutAndGoHome }: {
  userEmail: string
  /** ログインのあとに戻る画面（安全な内部 URL だけ。無ければ null） */
  returnTo?: string | null
  signOutAndGo?: typeof signOutAndGoHome
}) {
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const chooseAgain = async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    sessionStorage.removeItem('oauth_mode')
    await signOutAndGo({ to: buildAuthUrl('login', returnTo) })
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" aria-hidden="true" />
          <h2 className="text-xl font-bold text-amber-800 text-center">お客様情報が、いまのログインに結び付いていません</h2>
          <p className="text-muted-foreground text-sm">
            ログインはできています。ただ、
            <span className="font-mono text-xs break-all">{userEmail}</span>
            のお客様情報（予約など）は、<strong>別のログイン方法・別のアカウント</strong>に結び付いています。
            予約や情報が分かれてしまわないよう、ここでは新しいお客様情報は作りません。
          </p>
          <p className="text-muted-foreground text-sm">
            予約のときに入力した<strong>連絡先のメールアドレス</strong>と、<strong>ログインに使うアカウントのメールアドレス</strong>が違う場合があります。
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-left text-sm text-amber-900">
            <p className="font-medium mb-1">次のどちらかをお試しください</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>以前お使いのログイン方法（メールアドレスとパスワード、Google など）・アカウントで入り直す</li>
              <li>心当たりがない・わからない場合は、お問い合わせください</li>
            </ol>
          </div>
          <Button
            type="button"
            onClick={() => { void chooseAgain() }}
            disabled={leaving}
            className="w-full"
            style={{ backgroundColor: THEME.primary }}
            data-testid="duplicate-account-choose-again"
          >
            {leaving ? 'ログアウトしています…' : 'ログアウトして、ログイン方法を選び直す'}
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/contact">お問い合わせ</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/">トップページへ</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
