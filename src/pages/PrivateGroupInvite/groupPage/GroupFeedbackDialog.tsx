/**
 * 公演後の感想（グループページ刷新 段階 4）。5 段階の満足度と自由記述 1 つ。
 * 届くのは店舗と GM だけ（メンバーには見えない）。何度でも書き直せる。
 */
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/errorFields'

const LABELS = ['', 'いまひとつ', 'まあまあ', 'よかった', 'とてもよかった', '最高だった']
const MAX_COMMENT = 2000

interface GroupFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: { rating: number; comment: string } | null
  onSave: (rating: number, comment: string) => Promise<void>
}

export function GroupFeedbackDialog({ open, onOpenChange, initial, onSave }: GroupFeedbackDialogProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setRating(initial?.rating ?? 0)
    setComment(initial?.comment ?? '')
  }, [open, initial])

  const submit = async () => {
    if (rating < 1) {
      toast.error('満足度を選んでください')
      return
    }
    setSaving(true)
    try {
      await onSave(rating, comment.trim())
      toast.success('感想を店舗に送りました。ありがとうございました')
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err) || '感想を送れませんでした')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="max-w-md" data-testid="group-feedback-dialog">
        <DialogHeader>
          <DialogTitle>感想を書く</DialogTitle>
          <DialogDescription>感想は店舗と GM にだけ届きます。メンバーには見えません。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-bold mb-1">満足度</p>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="満足度">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n}（${LABELS[n]}）`}
                  onClick={() => setRating(n)}
                  className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-muted"
                  data-rating={n}
                >
                  <Star className={`w-7 h-7 ${n <= rating ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} aria-hidden="true" />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">{LABELS[rating]}</span>
            </div>
          </div>
          <div>
            <label htmlFor="group-feedback-comment" className="text-sm font-bold">感想（任意）</label>
            <Textarea
              id="group-feedback-comment"
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT))}
              rows={5}
              placeholder="楽しかったところ、GM の進行、店舗の雰囲気など"
              className="mt-1"
              data-testid="group-feedback-comment"
            />
            <p className="mt-1 text-xs text-muted-foreground text-right">{comment.length} / {MAX_COMMENT}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>閉じる</Button>
            <Button type="button" onClick={() => void submit()} disabled={saving} className="bg-green-700 hover:bg-green-800 text-white" data-testid="group-feedback-submit">
              {saving ? '送信中…' : initial ? '書き直して送る' : '送る'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
