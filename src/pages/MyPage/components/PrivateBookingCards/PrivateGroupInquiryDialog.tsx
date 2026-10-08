/**
 * 貸切について店舗に問い合わせる（マイページの「操作」メニュー・グループ画面の共通部品）。
 * 予約番号・作品名・いまの状態・招待コードを本文の最初に入れた状態で開く。
 * 送信は Edge Function send-contact-inquiry。使えないときはメールアプリを開く（従来のグループ設定シートと同じ）。
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { logger } from '@/utils/logger'
import { buildInquiryMessage, type PrivateGroupInquiryInfo } from './privateBookingMenu'

const MIN_MESSAGE_LENGTH = 10

function inquirySubject(info: PrivateGroupInquiryInfo): string {
  return `【貸切予約のお問い合わせ】${info.reservationNumber || info.inviteCode || info.title}`
}

interface PrivateGroupInquiryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: PrivateGroupInquiryInfo
  /** 返信先（ログイン中のメール、ゲストなら参加時のメール） */
  replyEmail: string
  replyName: string
}

export function PrivateGroupInquiryDialog({ open, onOpenChange, info, replyEmail, replyName }: PrivateGroupInquiryDialogProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // 開くたびに最新の状態で本文を作り直す
  useEffect(() => {
    if (open) setMessage(buildInquiryMessage(info))
    // info は開いた時点の値を使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const initialLength = buildInquiryMessage(info).length
  const written = message.length - initialLength
  const tooShort = message.trim().length < MIN_MESSAGE_LENGTH || written < 1

  const fallbackToMail = async () => {
    const { data: org } = info.organizationId
      ? await privateGroupPageReadApi.findOrganizationContactEmail(info.organizationId)
      : { data: null }
    const subject = encodeURIComponent(inquirySubject(info))
    const body = encodeURIComponent(`${message}\n\n---\n返信先: ${replyEmail}`)
    window.location.href = `mailto:${org?.contact_email || ''}?subject=${subject}&body=${body}`
    toast.info('メールアプリを開きます')
    onOpenChange(false)
  }

  const send = async () => {
    if (tooShort) {
      toast.error('お問い合わせ内容を書いてください')
      return
    }
    if (!replyEmail) {
      toast.error('返信先メールアドレスが設定されていません')
      return
    }
    if (!info.organizationId) {
      toast.error('店舗の問い合わせ先が見つかりません')
      return
    }
    setSending(true)
    try {
      const { data: org } = await privateGroupPageReadApi.findOrganizationContact(info.organizationId)
      if (!org?.contact_email) {
        toast.error('店舗の問い合わせ先が設定されていません')
        return
      }
      const { data, error } = await supabase.functions.invoke('send-contact-inquiry', {
        body: {
          organizationId: org.id,
          organizationName: org.name,
          name: replyName || '貸切予約者',
          email: replyEmail,
          type: 'private',
          subject: inquirySubject(info),
          message,
        },
      })
      if (error) throw new Error(error.message || '送信に失敗しました')
      if (data && !data.success) throw new Error(data.error || '送信に失敗しました')
      toast.success('問い合わせを送信しました')
      onOpenChange(false)
    } catch (err) {
      logger.error('問い合わせ送信エラー:', err)
      await fallbackToMail()
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!sending) onOpenChange(next) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>店舗に問い合わせる</DialogTitle>
          <DialogDescription>予約の情報を入れてあります。「お問い合わせ内容」の下に書いて送ってください。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="inquiry-reply-email" className="text-muted-foreground">返信先メールアドレス</Label>
            <Input id="inquiry-reply-email" type="email" value={replyEmail} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inquiry-message" className="text-muted-foreground">問い合わせ内容</Label>
            <Textarea
              id="inquiry-message"
              data-testid="inquiry-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={10}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>閉じる</Button>
          <Button type="button" className="gap-2" onClick={send} disabled={sending || tooShort}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
            {sending ? '送信中...' : '送信する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
