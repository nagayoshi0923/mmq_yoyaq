import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Share2, Users, Copy, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface InviteShareButtonProps {
  scenarioTitle: string
  scenarioId?: string
  scenarioSlug?: string
  eventDate?: string
  eventTime?: string
  storeName?: string
  organizationSlug?: string
  reservationId?: string
  showPrivateInvite?: boolean
  className?: string
}

export function InviteShareButton({
  scenarioTitle,
  scenarioId,
  scenarioSlug,
  eventDate,
  eventTime,
  storeName,
  organizationSlug,
  reservationId,
  showPrivateInvite = true,
  className = '',
}: InviteShareButtonProps) {
  const navigate = useNavigate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const baseUrl = window.location.origin
  const scenarioUrl = organizationSlug
    ? `${baseUrl}/${organizationSlug}/scenario/${scenarioSlug || scenarioId}`
    : `${baseUrl}/scenario/${scenarioSlug || scenarioId}`

  const shareText = eventDate && eventTime && storeName
    ? `一緒にマーダーミステリーやりませんか？\n\n🎭 シナリオ: ${scenarioTitle}\n📅 日時: ${eventDate} ${eventTime}〜\n📍 会場: ${storeName}\n\n詳細・予約はこちら👇`
    : `一緒にマーダーミステリーやりませんか？\n\n🎭 シナリオ: ${scenarioTitle}\n\n詳細・予約はこちら👇`

  const handleTwitterShare = () => {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(scenarioUrl)}`
    window.open(tweetUrl, '_blank', 'width=550,height=420')
  }

  const handleLineShare = () => {
    const lineText = `${shareText}\n${scenarioUrl}`
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(scenarioUrl)}&text=${encodeURIComponent(shareText)}`
    window.open(lineUrl, '_blank', 'width=550,height=420')
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${scenarioUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  const handlePrivateInvite = () => {
    setDialogOpen(false)
    const params = new URLSearchParams()
    if (scenarioId) params.set('scenarioId', scenarioId)
    if (organizationSlug) params.set('org', organizationSlug)
    if (reservationId) params.set('reservationId', reservationId)
    navigate(`/group/create?${params.toString()}`)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={`gap-1.5 ${className}`}
      >
        <Share2 className="w-3.5 h-3.5" />
        友達を誘う
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>友達を誘う</DialogTitle>
            <DialogDescription>
              SNSでシェアするか、貸切リクエストを作成して友達を招待できます
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* SNSシェアボタン */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">SNSでシェア</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleTwitterShare}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X/Twitter
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleLineShare}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  LINE
                </Button>
              </div>
            </div>

            {/* リンクをコピー */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">リンクをコピー</p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    リンクをコピー
                  </>
                )}
              </Button>
            </div>

            {/* 貸切リクエストを作成 */}
            {showPrivateInvite && scenarioId && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium text-muted-foreground">貸切リクエスト</p>
                <p className="text-xs text-muted-foreground">
                  リクエストを作成して友達を招待し、日程調整後に貸切申込できます
                </p>
                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={handlePrivateInvite}
                >
                  <Users className="w-4 h-4" />
                  貸切リクエストを作成
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
