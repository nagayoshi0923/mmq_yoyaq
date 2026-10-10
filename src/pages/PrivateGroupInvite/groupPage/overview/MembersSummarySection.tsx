/** 「参加メンバー」: 顔の並び・名前の列・人数、「招待リンクをコピー」「メンバータブへ」 */
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AnswerTable } from '../groupPageModel'
import { OverviewSection } from './OverviewSection'

interface MembersSummarySectionProps {
  table: AnswerTable
  inviteCap: number | null
  copied: boolean
  /** 招待リンクのコピー（公演後は出さない） */
  onCopyInvite: (() => void) | null
  onGoMembers: () => void
}

const MAX_FACES = 6

export function MembersSummarySection({ table, inviteCap, copied, onCopyInvite, onGoMembers }: MembersSummarySectionProps) {
  const names = table.columns.map(c => `${c.name}${c.role === 'organizer' ? '（主催）' : c.role === 'guest' ? '（ゲスト）' : ''}`)
  return (
    <OverviewSection
      label="参加メンバー"
      testId="overview-members"
      title="参加メンバー"
      aside={<span className="text-muted-foreground">{table.memberCount}{inviteCap ? `/${inviteCap}` : ''}名</span>}
    >
      <div className="flex items-center gap-2">
        <div className="flex shrink-0" aria-hidden="true">
          {table.columns.slice(0, MAX_FACES).map((c, i) => (
            <span key={c.memberId} className={`w-7 h-7 rounded-full border-2 border-card bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 ${i > 0 ? '-ml-2' : ''}`}>
              {c.name.slice(0, 1)}
            </span>
          ))}
        </div>
        <p className="min-w-0 text-sm leading-snug break-words">{names.join('・')}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {onCopyInvite && (
          <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300 gap-1" onClick={onCopyInvite}>
            {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            {copied ? 'コピーしました' : '招待リンクをコピー'}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={onGoMembers}>
          メンバータブへ
        </Button>
      </div>
    </OverviewSection>
  )
}
