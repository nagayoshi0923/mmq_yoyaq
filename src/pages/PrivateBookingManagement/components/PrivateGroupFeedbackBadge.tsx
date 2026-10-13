/**
 * 貸切予約管理のカードに出す「感想 N 件」（グループページ刷新 段階 4）。押すと感想の一覧。
 * 件数は組織ぶんを 1 回だけ読み、カードごとに使い回す。感想が無いグループには何も出さない。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { readFeedbackCounts, readFeedbackEntries } from '@/lib/privateGroupFeedback'
import { formatJstDateTime } from '@/utils/jstDate'

export const FEEDBACK_COUNTS_KEY = ['private-group-feedback-counts'] as const

export function PrivateGroupFeedbackBadge({ groupId, title }: { groupId: string | null | undefined; title: string }) {
  const [open, setOpen] = useState(false)
  const { data: counts } = useQuery({ queryKey: FEEDBACK_COUNTS_KEY, queryFn: readFeedbackCounts, staleTime: 60 * 1000 })
  const entries = useQuery({
    queryKey: ['private-group-feedback', groupId],
    enabled: open && Boolean(groupId),
    queryFn: () => readFeedbackEntries(groupId!),
  })
  const count = groupId ? counts?.[groupId] : undefined
  if (!groupId || !count) return null
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        className="border-amber-300 text-amber-800 hover:bg-amber-50"
        data-testid="private-group-feedback-badge"
      >
        <Star className="w-4 h-4 mr-1 fill-amber-400 text-amber-500" aria-hidden="true" />
        感想 {count.count}件（平均 {count.average}）
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>公演後の感想</DialogTitle>
            <DialogDescription>{title}。お客様が公演後にグループページから送った感想です（他のメンバーには見えません）。</DialogDescription>
          </DialogHeader>
          {entries.isLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : entries.isError ? (
            <p className="text-sm text-muted-foreground">感想を読み込めませんでした。時間をおいて開き直してください。</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
              {(entries.data ?? []).map((f, i) => (
                <li key={`${f.member_name}-${i}`} className="py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold">{f.member_name}{f.is_guest ? '（ゲスト）' : ''}</span>
                    <span className="flex" aria-label={`満足度 ${f.rating}/5`}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star key={n} className={`w-3.5 h-3.5 ${n <= f.rating ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} aria-hidden="true" />
                      ))}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatJstDateTime(f.updated_at)}</span>
                  </div>
                  {f.comment && <p className="mt-1 text-sm whitespace-pre-wrap break-words">{f.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
