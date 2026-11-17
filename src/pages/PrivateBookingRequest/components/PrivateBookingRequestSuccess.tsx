/**
 * 貸切リクエストの完了画面（作品ページから直接申し込んだとき）。
 * 点検 43: 「グループを開く」だけで、メンバーを招待する案内も招待リンクも、店舗の返事の目安も無かった。
 * - 店舗の返事の目安（通常 2〜3 日）と、返事が来るまでの流れ
 * - メンバー招待: 招待リンクのコピー・LINE で送る（グループ画面のメンバータブと同じ文）
 * - 取消の案内（点検 35。マイページから取り消せるのは 30 日前まで）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepBar } from '@/components/renewal/StepBar'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
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
    <div className="booking-shell min-h-screen overflow-x-clip bg-white">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />
      <div className="mx-auto max-w-4xl px-4 pt-3">
        <p className="text-xs text-muted-foreground">{scenarioTitle}の貸切</p>
        <h1 className="mt-1 text-lg font-bold">申込の完了</h1>
      </div>
      <StepBar steps={['候補日を選ぶ', '内容の確認', '完了']} current={2} color={PRIVATE_PURPLE} />

      <div className="mx-auto max-w-4xl space-y-3 bg-gray-50 px-3 py-4" data-testid="private-request-success">
        <section className="border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold text-green-700">✓ 申込を受け付けました</p>
          <h2 className="mt-1 text-xl font-bold">店舗の返事を待っています</h2>
          <p className="mt-2 text-sm leading-relaxed">
            店舗が候補の中から日時と会場を決めると、メールとマイページでお知らせします。ふだんは<span className="font-bold">2〜3日以内</span>に返事があります。
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {confirmationEmailAccepted
              ? `確認メールを送りました（${customerEmail}）`
              : '確認メールの送信を確認できませんでした。受付内容はマイページで確認できます。もう一度申し込む必要はありません。'}
          </p>
        </section>

        {inviteCode && (
          <section className="border border-gray-200 bg-white p-4" data-testid="private-request-invite">
            <h2 className="text-lg font-bold">次にやること</h2>
            <p className="mt-1 text-sm leading-relaxed">一緒に行く人をグループに招待しておくと、日程が決まったときにみんなに知らせられます。招待された人はログインしなくても参加できます。</p>
            <p className="mt-3 break-all border border-gray-200 bg-gray-50 px-3 py-2 text-xs" data-testid="private-request-invite-url">{inviteUrlOf(inviteCode)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={shareLine} className="h-11 bg-[#06C755] text-sm font-bold text-white">LINEで送る</button>
              <button type="button" onClick={() => void copyInvite()} className="h-11 border border-gray-300 text-sm font-bold">{copied ? 'コピーしました' : 'リンクをコピー'}</button>
            </div>
            <button type="button" onClick={() => navigate(`/group/invite/${inviteCode}`)} className="mt-2 h-12 w-full text-base font-bold text-white" style={{ backgroundColor: PRIVATE_PURPLE }}>
              グループを開いて友だちを招待
            </button>
          </section>
        )}

        <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="private-request-cancel-notice">
          <span className="font-bold">取消について: </span>{privateCancelNoticeText()}
        </p>

        <button type="button" onClick={() => navigate('/mypage')} className="h-12 w-full border bg-white text-base font-bold" style={{ borderColor: PRIVATE_PURPLE, color: PRIVATE_PURPLE }}>
          申込の内容を見る
        </button>
        <p className="text-xs text-muted-foreground">マイページの予約一覧からも見られます。</p>
        <button type="button" onClick={() => navigate(bookingBasePath || '/')} className="h-11 w-full text-sm underline underline-offset-4">予約サイトのトップに戻る</button>
      </div>
    </div>
  )
}
