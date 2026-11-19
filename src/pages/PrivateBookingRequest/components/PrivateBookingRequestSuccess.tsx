/**
 * 貸切リクエストの完了画面（作品ページから直接申し込んだとき）。
 * 点検 43: 「グループを開く」だけで、メンバーを招待する案内も招待リンクも、店舗の返事の目安も無かった。
 * - 店舗の返事の目安（通常 2〜3 日）と、返事が来るまでの流れ
 * - メンバー招待: 招待リンクのコピー・LINE で送る（グループ画面のメンバータブと同じ文）
 * - 取消の案内（点検 35。マイページから取り消せるのは 30 日前まで）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, Copy, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { logger } from '@/utils/logger'
import { privateCancelNoticeText } from '@/lib/privateCancelNotice'

interface PrivateBookingRequestSuccessProps {
  bookingBasePath: string
  scenarioTitle: string
  customerEmail: string
  confirmationEmailAccepted: boolean
  inviteCode: string | null
}

function inviteUrlOf(code: string): string {
  return `${window.location.origin}/group/invite/${code}`
}

export function PrivateBookingRequestSuccess({ bookingBasePath, scenarioTitle, customerEmail, confirmationEmailAccepted, inviteCode }: PrivateBookingRequestSuccessProps) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const copyInvite = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteUrlOf(inviteCode))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      logger.error('Failed to copy invite URL')
    }
  }

  const shareLine = () => {
    if (!inviteCode) return
    const text = `貸切マーダーミステリー「${scenarioTitle}」に参加しませんか？\n以下のリンクから参加できます。`
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(inviteUrlOf(inviteCode))}&text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="booking-shell min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4" data-testid="private-request-success">
        <Card className="border-2 border-purple-200 bg-purple-50">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-purple-600 mx-auto" aria-hidden="true" />
            <h2 className="text-lg text-purple-800">貸切リクエストを受け付けました</h2>
            <p className="text-sm text-purple-800 leading-relaxed">
              店舗から通常 <span className="font-bold">2〜3 日以内</span>にお返事します。日程が決まると、メールとマイページでお知らせします。
            </p>
            <p className="text-xs text-purple-700 leading-relaxed">
              {confirmationEmailAccepted
                ? `確認メールの送信を受け付けました（${customerEmail}）。`
                : '確認メールの送信を確認できませんでした。受付内容はマイページで確認できます。再申込は不要です。'}
            </p>
          </CardContent>
        </Card>

        {inviteCode && (
          <Card data-testid="private-request-invite">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" aria-hidden="true" />
                <h3 className="text-base font-semibold">次に、一緒に遊ぶメンバーを招待しましょう</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                招待リンクを送ると、メンバーはログインしなくても、お名前とメールアドレスでグループに参加でき、チャットで連絡を取り合えます。
              </p>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs break-all" data-testid="private-request-invite-url">
                {inviteUrlOf(inviteCode)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => void copyInvite()}>
                  {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  {copied ? 'コピーしました' : 'リンクをコピー'}
                </Button>
                <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={shareLine}>
                  LINE で送る
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed" data-testid="private-request-cancel-notice">
          <span className="font-bold">取消について: </span>{privateCancelNoticeText()}
        </p>

        <div className="flex flex-col gap-3">
          {inviteCode && (
            <Button onClick={() => navigate(`/group/invite/${inviteCode}`)} className="bg-purple-600 hover:bg-purple-700">
              グループを開く
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(bookingBasePath || '/')}>
            予約サイトトップに戻る
          </Button>
        </div>
      </div>
    </div>
  )
}
