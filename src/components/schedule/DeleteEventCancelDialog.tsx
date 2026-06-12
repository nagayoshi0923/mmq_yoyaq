/**
 * F-1: 有効予約のある公演を削除/中止する際の確認ダイアログ（2ステップ）
 *
 * モーダルの順序はオーナー指示（2026-06-13）:
 *   通常の「公演を削除/中止しますか？」確定モーダルは出さず（先に出すと確定済みに見える）、
 *   ステップ1: 予約をキャンセルするかの確認（件数＋予約者一覧）
 *   ステップ2: メール送信の確認（キャンセル理由の編集＋送信チェックボックス）
 * の順で確認する。作法は予約一覧モーダルの「予約をキャンセル」ダイアログと統一。
 * 赤い実行ボタンは最終ステップの1個だけ（途中は「まだ実行されません」を明示）。
 *
 * 一度1画面に統合したが、予約が数件あると予約者一覧＋理由＋まとめで縦に
 * 苦しくなるため2ステップに戻した（オーナー判断 2026-06-13）。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface CancelMailRecipient {
  reservationId: string
  /** 表示用ラベル（名前＋メール） */
  label: string
  email: string | null
}

export interface DeleteCancelPrompt {
  /** 'delete' = 公演の削除 / 'cancel' = 公演の中止（復活可能）。省略時は delete */
  variant?: 'delete' | 'cancel'
  /** 有効予約の件数 */
  count: number
  /** 表示用の予約者リスト（名前＋メール） */
  customers: string[]
  /** キャンセル理由の初期値 */
  defaultReason: string
  /** メール本文編集の対象（省略時は理由編集のみのフォールバック表示） */
  recipients?: CancelMailRecipient[]
  /** 予約者ごとのメール本文を生成（予約一覧の「予約をキャンセル」と同じロジック） */
  composeBody?: (recipientIndex: number, reason: string) => string
}

export interface DeleteCancelDecision {
  sendMail: boolean
  reason: string
  /** 全文編集されたメール本文（reservationId → body）。recipients がある場合のみ */
  bodies?: Record<string, string>
}

interface DeleteEventCancelDialogProps {
  prompt: DeleteCancelPrompt | null
  /** decision = 実行 / null = やめる（削除を中断） */
  onResolve: (decision: DeleteCancelDecision | null) => void
}

export function DeleteEventCancelDialog({ prompt, onResolve }: DeleteEventCancelDialogProps) {
  const [step, setStep] = useState<'confirm' | 'mail'>('confirm')
  const [reason, setReason] = useState('')
  const [sendMail, setSendMail] = useState(true)

  // メール本文の全文編集（予約者ごと）。
  // dirty=手で編集済み。理由を書き換えたとき、未編集の本文だけ自動で追従させる
  const [recipientIndex, setRecipientIndex] = useState(0)
  const [bodies, setBodies] = useState<string[]>([])
  const [dirtyBodies, setDirtyBodies] = useState<boolean[]>([])

  // 削除/中止で変わる文言
  const isCancelVariant = prompt?.variant === 'cancel'
  const actionLabel = isCancelVariant ? '中止' : '削除'
  const recipients = prompt?.recipients
  const hasBodyEditor = !!(recipients && recipients.length > 0 && prompt?.composeBody)

  // ダイアログが開くたびに初期値へリセット
  useEffect(() => {
    if (prompt) {
      setStep('confirm')
      setReason(prompt.defaultReason)
      setSendMail(true)
      setRecipientIndex(0)
      if (prompt.recipients && prompt.composeBody) {
        setBodies(prompt.recipients.map((_, i) => prompt.composeBody!(i, prompt.defaultReason)))
        setDirtyBodies(prompt.recipients.map(() => false))
      } else {
        setBodies([])
        setDirtyBodies([])
      }
    }
  }, [prompt])

  /** 理由の変更: 手で編集していない本文は新しい理由で再生成する */
  const handleReasonChange = (newReason: string) => {
    setReason(newReason)
    if (prompt?.recipients && prompt.composeBody) {
      setBodies(prev => prev.map((b, i) => dirtyBodies[i] ? b : prompt.composeBody!(i, newReason)))
    }
  }

  const handleBodyChange = (value: string) => {
    setBodies(prev => prev.map((b, i) => (i === recipientIndex ? value : b)))
    setDirtyBodies(prev => prev.map((d, i) => (i === recipientIndex ? true : d)))
  }

  const buildDecision = (): DeleteCancelDecision => ({
    sendMail,
    reason,
    bodies: hasBodyEditor && recipients
      ? Object.fromEntries(recipients.map((r, i) => [r.reservationId, bodies[i] ?? '']))
      : undefined,
  })

  return (
    <Dialog
      open={!!prompt}
      onOpenChange={(open) => {
        if (!open) onResolve(null)
      }}
    >
      <DialogContent className="max-w-lg">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle>公演の{actionLabel}（1/2）— 予約のキャンセル確認</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <p className="text-sm">
                ⚠️ この公演には <span className="font-bold">{prompt?.count ?? 0} 件</span> の有効な予約があります。
                <br />
                {isCancelVariant
                  ? '中止するには、先にすべての予約をキャンセルする必要があります。'
                  : '削除は「中止（すべての予約をキャンセル）」を行った上で、イベントセルを削除します。'}
                <br />
                <span className="text-muted-foreground">
                  {isCancelVariant
                    ? '（予約の記録はキャンセル済みとして残ります。公演は後から復活できます）'
                    : '（予約の記録はキャンセル済みとして残ります）'}
                </span>
              </p>

              {/* 予約者一覧 */}
              <div className="rounded-md border bg-muted/50 p-2 max-h-32 overflow-y-auto">
                <ul className="text-sm space-y-0.5">
                  {prompt?.customers.map((c, i) => (
                    <li key={i}>・{c}</li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                ※ まだ実行されません。次の画面でキャンセルメールを送るかどうかを選んでから実行します。
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onResolve(null)}>
                やめる
              </Button>
              <Button onClick={() => setStep('mail')}>
                次へ：メール送信の選択
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>公演の{actionLabel}（2/2）— メール送信の確認</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
              <p className="text-sm">
                予約者 <span className="font-bold">{prompt?.count ?? 0} 名</span> にキャンセルのご連絡メールを送信できます。
              </p>

              {/* キャンセル理由 */}
              <div>
                <Label htmlFor="delete-cancel-reason">キャンセル理由</Label>
                <Textarea
                  id="delete-cancel-reason"
                  value={reason}
                  onChange={(e) => handleReasonChange(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {hasBodyEditor
                    ? '下のメール本文の【キャンセル理由】欄に反映されます（本文を直接編集した場合はそちらが優先）'
                    : 'メールの【キャンセル理由】欄に記載されます'}
                </p>
              </div>

              {/* メール本文（全文編集可・予約一覧の「予約をキャンセル」と同じ作法） */}
              {hasBodyEditor && recipients && (
                <div>
                  {recipients.length > 1 ? (
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="delete-cancel-recipient">送信先</Label>
                      <select
                        id="delete-cancel-recipient"
                        value={recipientIndex}
                        onChange={(e) => setRecipientIndex(Number(e.target.value))}
                        className="text-sm border rounded px-2 py-1 bg-background max-w-[320px]"
                      >
                        {recipients.map((r, i) => (
                          <option key={r.reservationId} value={i}>
                            {r.label}{dirtyBodies[i] ? '（編集済み）' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-sm mb-1">
                      <span className="text-muted-foreground">送信先: </span>
                      <span className="font-medium">{recipients[0].email || 'メールアドレスなし'}</span>
                    </div>
                  )}
                  <Label htmlFor="delete-cancel-mail-body">メール本文</Label>
                  <Textarea
                    id="delete-cancel-mail-body"
                    value={bodies[recipientIndex] ?? ''}
                    onChange={(e) => handleBodyChange(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    rows={12}
                  />
                  {recipients.length > 1 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      予約番号などは予約者ごとに異なるため、送信先を切り替えてそれぞれの本文を確認・編集できます
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 pt-4 border-t flex-shrink-0">
              {/* メール送信チェックボックス */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="delete-cancel-send-email"
                  checked={sendMail}
                  onCheckedChange={(checked) => setSendMail(!!checked)}
                />
                <label
                  htmlFor="delete-cancel-send-email"
                  className="text-sm font-medium cursor-pointer"
                >
                  キャンセル確認メールを送信する
                </label>
              </div>

              {/* 実行内容のまとめ（赤いボタンの直前に「何が起きるか」を明示） */}
              <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                実行すると:
                <br />・予約 {prompt?.count ?? 0} 件をキャンセル（メール送信{sendMail ? 'あり' : 'なし'}・記録は残ります）
                <br />
                {isCancelVariant
                  ? '・この公演を中止（後から復活できます・履歴に記録されます）'
                  : '・この公演を中止の上、イベントセルを削除（履歴に記録されます）'}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep('confirm')}>
                  戻る
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => onResolve(buildDecision())}
                >
                  {sendMail ? `メールを送信して${actionLabel}` : `メールを送らずに${actionLabel}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
