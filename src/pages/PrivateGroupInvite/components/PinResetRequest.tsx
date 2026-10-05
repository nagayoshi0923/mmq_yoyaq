import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { requestGuestPinReset } from '@/lib/guestPinReset'

/** PIN 入力画面の「PINを忘れた方」。入力中のメールアドレスへ新しい PIN を送る */
export function PinResetRequest({ inviteCode, email }: { inviteCode: string; email: string }) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const send = async () => {
    if (!validEmail) { setMessage('上の欄に、参加登録したメールアドレスを入力してから押してください。'); return }
    setSending(true)
    try { setMessage((await requestGuestPinReset(inviteCode, email.trim())).message) }
    finally { setSending(false) }
  }
  return (
    <div className="space-y-1 text-center">
      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={sending} onClick={() => void send()}>
        {sending ? '送信中…' : 'PINを忘れた方（新しいPINをメールで送る）'}
      </Button>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
