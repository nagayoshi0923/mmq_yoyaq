/**
 * 招待ページのゲスト向けの参加欄（未ログイン・未参加の人）。点検 52・53・54・56。
 * - はじめて: 「お名前とメールアドレスで参加できます」を一番上に（メールは必須。PIN とお知らせを送る。2026-10-26 点検 F06）。会員の新規登録・ログインはその下に小さく 1 か所。
 * - 再訪（この端末で前に参加した印がある・PIN のメールから来た）: 「すでに参加した方は PIN で入る」を大きく、新規参加は畳む。
 * - PIN の画面: 新規参加の「参加する」は出さない。PIN 欄の例は薄く「例:」付き。
 * 見出しと入力欄は htmlFor / id で結び、読み上げで例の文字が欄の名前にならないようにする。
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PinResetRequest } from './PinResetRequest'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'

export type GuestJoinMode = 'new' | 'returning' | 'pin'

interface GuestJoinPanelProps {
  mode: GuestJoinMode
  code: string | null
  guestName: string
  guestEmail: string
  setGuestName: (v: string) => void
  setGuestEmail: (v: string) => void
  pinEmail: string
  pinCode: string
  pinError: string | null
  setPinEmail: (v: string) => void
  setPinCode: (v: string) => void
  actionLoading: boolean
  isGroupFull: boolean
  inviteMemberCap: number | null
  onSubmit: () => void
  onPinAuth: () => void
  onOpenPin: () => void
  onClosePin: () => void
  onLogin: () => void
  onSignup: () => void
  /** 新規参加の見出し（見本: 「2. お名前」）。既定は「お名前とメールアドレス」 */
  heading?: string
  /** 送るボタンの文言（既定「参加する」。見本: 候補日に答えるときは「この内容で答える」） */
  submitLabel?: string
  /** 送るボタンの上に入れる欄（参加費と支払い方法など） */
  beforeSubmit?: ReactNode
}

const field = 'h-10 text-sm placeholder:text-muted-foreground/60'

export function GuestJoinPanel(props: GuestJoinPanelProps) {
  const { mode, onOpenPin, onLogin, onSignup } = props
  const [showNewForm, setShowNewForm] = useState(false)

  if (mode === 'pin') return <PinAuthCard {...props} />

  const memberLinks = (
    <p className="text-xs text-muted-foreground text-center leading-relaxed" data-testid="guest-member-links">
      会員の方は
      <button type="button" className="mx-1 text-purple-700 underline underline-offset-2" onClick={onLogin}>ログイン</button>
      ／
      <button type="button" className="mx-1 text-purple-700 underline underline-offset-2" onClick={onSignup}>新規登録</button>
      して参加すると、マイページから確認できます。
    </p>
  )

  if (mode === 'returning') {
    return (
      <div className="space-y-3 mb-6" data-testid="guest-join-returning">
        <Card className="border-2 border-purple-300 bg-purple-50/60">
          <CardContent className="p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-purple-900">
              <KeyRound className="w-5 h-5" aria-hidden="true" />すでに参加した方
            </h2>
            <p className="text-sm text-purple-900 leading-relaxed">
              参加したときのメールアドレスと PIN（4 桁）で入れます。PIN は参加したときのメールに書いてあります。
            </p>
            <Button type="button" className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={onOpenPin} data-testid="guest-open-pin">
              PIN で入る
            </Button>
          </CardContent>
        </Card>
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
          onClick={() => setShowNewForm(v => !v)}
          aria-expanded={showNewForm}
          data-testid="guest-toggle-new"
        >
          <span>はじめて参加する方はこちら</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showNewForm ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showNewForm && <NewGuestCard {...props} />}
        {memberLinks}
      </div>
    )
  }

  return (
    <div className="space-y-3 mb-6" data-testid="guest-join-new">
      <NewGuestCard {...props} />
      <button type="button" className="block w-full py-1 text-center text-sm underline underline-offset-4" style={{ color: PRIVATE_PURPLE }} onClick={onOpenPin} data-testid="guest-open-pin">
        すでに参加した方は PIN で入る（答えを直す）
      </button>
      {memberLinks}
    </div>
  )
}

function NewGuestCard({ guestName, guestEmail, setGuestName, setGuestEmail, actionLoading, isGroupFull, inviteMemberCap, onSubmit, heading, submitLabel, beforeSubmit }: GuestJoinPanelProps) {
  return (
    <div className="space-y-3" data-testid="guest-new-form">
      <section className="border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">{heading ?? 'お名前とメールアドレス'}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">お名前とメールアドレスで参加できます。アカウント登録は不要です。</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-name" className="text-sm font-bold block">お名前 <span className="text-xs font-normal text-red-700">必須</span></Label>
          <Input id="guest-name" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="例: たろう" autoComplete="nickname" aria-describedby="guest-name-note" className={field} />
          <p id="guest-name-note" className="text-xs text-muted-foreground">ほかのメンバーに表示されます（ニックネームでも可）</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-email" className="text-sm font-bold block">メールアドレス <span className="text-xs font-normal text-red-700">必須</span></Label>
          <Input id="guest-email" type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="例: name@example.com" autoComplete="email" aria-describedby="guest-email-note" className={field} />
          <p id="guest-email-note" className="text-xs text-muted-foreground">次に入るときの PIN と、日程が決まったお知らせを送ります。ほかのメンバーには表示されません。</p>
        </div>
      </section>
      {beforeSubmit}
      {isGroupFull && (
        <div className="border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800">
          参加人数が上限（{inviteMemberCap}名）に達しています
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={actionLoading || isGroupFull}
        className="flex h-12 w-full items-center justify-center text-base font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: PRIVATE_PURPLE }}
        data-testid="guest-join-submit"
      >
        {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</> : isGroupFull ? '参加人数上限に達しています' : (submitLabel ?? '参加する')}
      </button>
    </div>
  )
}

function PinAuthCard({ code, pinEmail, pinCode, pinError, setPinEmail, setPinCode, onPinAuth, onClosePin }: GuestJoinPanelProps) {
  return (
    <Card className="mb-6 border-2 border-purple-300" data-testid="guest-pin-form">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="w-5 h-5 text-purple-700" aria-hidden="true" />PIN で入る</h2>
          <Button variant="link" size="sm" className="text-muted-foreground p-0 h-auto text-xs" onClick={onClosePin}>
            はじめて参加する方はこちら
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">参加したときのメールアドレスと、メールで届いた PIN（4 桁）を入力してください。</p>
        {pinError && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded-md">{pinError}</div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pin-email" className="text-sm font-medium block">メールアドレス</Label>
          <Input id="pin-email" type="email" value={pinEmail} onChange={e => setPinEmail(e.target.value)} placeholder="例: name@example.com" autoComplete="email" className={field} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pin-code" className="text-sm font-medium block">PIN（4 桁の数字）</Label>
          <Input
            id="pin-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoComplete="one-time-code"
            value={pinCode}
            onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
            placeholder="例: 1234"
            className="h-12 text-center text-xl tracking-widest font-mono placeholder:text-sm placeholder:tracking-normal placeholder:font-sans placeholder:text-muted-foreground/50"
          />
        </div>
        <Button
          type="button"
          onClick={onPinAuth}
          className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold"
          disabled={!pinEmail || pinCode.length !== 4}
          data-testid="guest-pin-submit"
        >
          入る
        </Button>
        {code && <PinResetRequest inviteCode={code} email={pinEmail} />}
      </CardContent>
    </Card>
  )
}
