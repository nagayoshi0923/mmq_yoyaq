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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TemplateEditButton } from '@/components/settings/TemplateEditButton'

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
  /** 店舗のキャンセル設定に登録された定型理由 */
  reasonOptions?: string[]
  /** キャンセルメールテンプレートを編集する店舗 */
  templateStoreId?: string | null
  /** メール本文編集の対象（省略時は理由編集のみのフォールバック表示） */
  recipients?: CancelMailRecipient[]
  /** 予約者ごとのメール本文を生成（予約一覧の「予約をキャンセル」と同じロジック） */
  composeBody?: (recipientIndex: number, reason: string, templateOverride?: string) => string
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
  const reasonOptions = prompt?.reasonOptions?.filter(r => r.trim()) ?? []
  const hasBodyEditor = !!(recipients && recipients.length > 0 && prompt?.composeBody)
  const mailRecipientCount = recipients?.filter(r => !!r.email).length ?? 0
  const missingEmailCount = recipients ? recipients.length - mailRecipientCount : 0
  const canSendMail = !hasBodyEditor || mailRecipientCount > 0

  // ダイアログが開くたびに初期値へリセット
  useEffect(() => {
    if (prompt) {
      setStep('confirm')
      setReason(prompt.defaultReason)
      setSendMail(prompt.recipients ? prompt.recipients.some(r => !!r.email) : true)
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

  const handleTemplateSaved = (template: string) => {
    if (!prompt?.recipients || !prompt.composeBody) return
    setBodies(prev => prev.map((b, i) => dirtyBodies[i] ? b : prompt.composeBody!(i, reason, template)))
  }

  const buildDecision = (): DeleteCancelDecision => ({
    sendMail: sendMail && canSendMail,
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
                ※ まだ実行されません。次の画面で公演中止メールを送るかどうかを選んでから実行します。
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
                対象の予約 <span className="font-bold">{prompt?.count ?? 0} 件</span> をすべてキャンセルします。
                {hasBodyEditor ? (
                  <>
                    <br />
                    メール送信をONにすると、メールアドレスがある予約者全員
                    （<span className="font-bold">{mailRecipientCount} 件</span>）へ公演中止メールを送信します。
                  </>
                ) : (
                  <>
                    <br />
                    公演中止メールを送信できます。
                  </>
                )}
              </p>

              {hasBodyEditor && recipients && (
                <div className="rounded-md border bg-muted/40 p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="font-medium">キャンセル対象</span>
                    <span className="text-xs text-muted-foreground">
                      全{recipients.length}件 / メール対象{mailRecipientCount}件
                      {missingEmailCount > 0 ? ` / メールなし${missingEmailCount}件` : ''}
                    </span>
                  </div>
                  <ul className="space-y-1 max-h-28 overflow-y-auto">
                    {recipients.map((r, i) => (
                      <li key={r.reservationId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{i + 1}. {r.label}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${r.email ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-muted text-muted-foreground border'}`}>
                          {r.email ? 'メール送信対象' : 'メールなし'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">
                    予約キャンセルはこの一覧の全件に実行されます。下の切替は送信先の選択ではなく、予約者ごとの本文プレビューです。
                  </p>
                </div>
              )}

              {/* 中止理由 */}
              <div>
                <Label htmlFor="delete-cancel-reason">中止理由</Label>
                {reasonOptions.length > 0 && (
                  <Select value={reason} onValueChange={handleReasonChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="定型理由から選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonOptions.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Textarea
                  id="delete-cancel-reason"
                  value={reason}
                  onChange={(e) => handleReasonChange(e.target.value)}
                  className={reasonOptions.length > 0 ? 'mt-2' : 'mt-1'}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {hasBodyEditor
                    ? '下のメール本文の【中止理由】欄に反映されます（本文を直接編集した場合はそちらが優先）'
                    : 'メールの【中止理由】欄に記載されます'}
                </p>
              </div>

              {/* メール本文（全文編集可・予約一覧の「予約をキャンセル」と同じ作法） */}
              {hasBodyEditor && recipients && (
                <div>
                  {recipients.length > 1 ? (
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="delete-cancel-recipient">本文プレビュー</Label>
                      <select
                        id="delete-cancel-recipient"
                        value={recipientIndex}
                        onChange={(e) => setRecipientIndex(Number(e.target.value))}
                        className="text-sm border rounded px-2 py-1 bg-background max-w-[320px]"
                      >
                        {recipients.map((r, i) => (
                          <option key={r.reservationId} value={i}>
                            {i + 1}/{recipients.length} {r.label}{dirtyBodies[i] ? '（編集済み）' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-sm mb-1">
                      <span className="text-muted-foreground">本文プレビュー: </span>
                      <span className="font-medium">{recipients[0].label}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="delete-cancel-mail-body">メール本文</Label>
                    <TemplateEditButton
                      templateKey="event_cancellation_template"
                      storeId={prompt?.templateStoreId}
                      label="公演中止メールのテンプレを編集"
                      className="h-7 text-xs text-purple-700 hover:text-purple-900"
                      unavailableMessage="店舗が未選択のためテンプレートを編集できません"
                      onSaved={handleTemplateSaved}
                    />
                  </div>
                  <Textarea
                    id="delete-cancel-mail-body"
                    value={bodies[recipientIndex] ?? ''}
                    onChange={(e) => handleBodyChange(e.target.value)}
                    className="mt-1 font-mono text-xs"
                    rows={12}
                  />
                  {recipients.length > 1 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      予約番号などは予約者ごとに異なるため、プレビューを切り替えてそれぞれの本文を確認・編集できます
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
                  checked={sendMail && canSendMail}
                  disabled={!canSendMail}
                  onCheckedChange={(checked) => setSendMail(!!checked)}
                />
                <label
                  htmlFor="delete-cancel-send-email"
                  className="text-sm font-medium cursor-pointer"
                >
                  {hasBodyEditor
                    ? `公演中止メールをメール対象全員に送信する（${mailRecipientCount}件）`
                    : '公演中止メールを送信する'}
                </label>
              </div>

              {/* 実行内容のまとめ（赤いボタンの直前に「何が起きるか」を明示） */}
              <div className="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
                実行すると:
                <br />・予約 {prompt?.count ?? 0} 件をすべてキャンセル（記録は残ります）
                <br />・メール: {sendMail && canSendMail
                  ? hasBodyEditor
                    ? `メール対象 ${mailRecipientCount} 件すべてに送信`
                    : '送信あり'
                  : '送信しません'}
                {missingEmailCount > 0 && sendMail && canSendMail
                  ? `（メールなし ${missingEmailCount} 件は送信不可）`
                  : ''}
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
                  {sendMail && canSendMail
                    ? hasBodyEditor ? `メール対象全員に送信して${actionLabel}` : `メールを送信して${actionLabel}`
                    : `メールを送らずに${actionLabel}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
