/**
 * 「注意事項とキャンセル規定」（折りたたみ）。中身は作品ページ・貸切申込と同じ BookingNotice（組織の注意事項＋店舗のキャンセルポリシー）。
 * 末尾に「店舗に問い合わせる」（マイページの「操作」と同じ問い合わせダイアログ）。
 */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BookingNotice } from '@/pages/ScenarioDetailPage/components/BookingNotice'

interface NoticeSectionProps {
  orgSlug: string | null
  scenarioMasterId: string | null
  /** 店舗が 1 つに決まっていればその店舗（キャンセルポリシーを店舗別に出すため） */
  storeId: string | null
  hasPreReading: boolean
  onInquiry: () => void
}

export function NoticeSection({ orgSlug, scenarioMasterId, storeId, hasPreReading, onInquiry }: NoticeSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <section className="bg-card border border-border rounded-lg p-3" aria-label="注意事項とキャンセル規定" data-testid="overview-notice">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 text-left text-sm font-bold">
        注意事項とキャンセル規定
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {!open && <p className="mt-1 text-xs text-muted-foreground">当日のお願いと、取り消したときの料金の決まりです。開いて確認してください。</p>}
      {open && (
        <div className="mt-2">
          <BookingNotice mode="private" organizationSlug={orgSlug} scenarioMasterId={scenarioMasterId} storeId={storeId} hasPreReading={hasPreReading} defaultPolicyOpen={Boolean(storeId)} />
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="mt-2.5 h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={onInquiry} data-testid="overview-inquiry">
        店舗に問い合わせる
      </Button>
    </section>
  )
}
