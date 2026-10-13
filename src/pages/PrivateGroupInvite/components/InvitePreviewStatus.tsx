/**
 * 参加前の招待ページの「このグループのいま」（点検 51）。作品について（#1028）の下に置く。
 * いまの状態（募集中／店舗の返事待ち／確定）・候補日・1 人あたりの料金。
 */
import { CalendarDays, Wallet } from 'lucide-react'
import type { InvitePreview } from '../invitePreviewModel'

export function InvitePreviewStatus({ preview }: { preview: InvitePreview }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 space-y-2.5" aria-label="このグループのいま" data-testid="invite-preview-status">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold">このグループのいま</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${preview.statusClass}`} data-testid="invite-preview-label">{preview.statusLabel}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-snug">{preview.statusText}</p>
      {preview.datesTitle && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />{preview.datesTitle}
          </p>
          {preview.dates.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="invite-preview-dates">
              {preview.dates.map(label => (
                <li key={label} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs tabular-nums">{label}</li>
              ))}
              {preview.moreDates > 0 && <li className="px-1 py-0.5 text-xs text-muted-foreground">ほか {preview.moreDates} 件</li>}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">候補日はまだありません。主催者が候補日を出すと、ここに並びます。</p>
          )}
        </div>
      )}
      {preview.perPerson && (
        <div>
          <p className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-xs font-bold"><Wallet className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />1 人あたりの料金</span>
            <span className="font-bold tabular-nums" data-testid="invite-preview-price">{preview.perPerson}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
            {preview.priceNote ?? ''}税込。当日、店舗で現金またはカードでお支払いください。
          </p>
        </div>
      )}
    </section>
  )
}
