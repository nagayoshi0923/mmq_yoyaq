/**
 * メンバータブ: 一覧（主催者／会員／ゲスト、回答済みかどうか）、招待リンクをコピー、主催者には「管理」（既存のメンバー管理ダイアログ）。
 */
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AnswerTable } from './groupPageModel'

interface GroupMembersTabProps {
  table: AnswerTable
  /** 候補日が 1 件以上あるか（回答済みの表示に使う） */
  hasCandidates: boolean
  inviteCap: number | null
  copied: boolean
  onCopyInvite: () => void
  onShareLine: () => void
  /** 主催者だけ（メンバー管理ダイアログを開く） */
  onManage: (() => void) | null
}

export function GroupMembersTab({ table, hasCandidates, inviteCap, copied, onCopyInvite, onShareLine, onManage }: GroupMembersTabProps) {
  return (
    <section className="bg-card border border-border rounded-lg p-3" aria-label="メンバー" data-testid="group-members-tab">
      <h2 className="mb-1 flex items-center justify-between text-sm font-bold">
        <span>メンバー {table.memberCount}{inviteCap ? `/${inviteCap}` : ''}名</span>
        {onManage && (
          <button type="button" onClick={onManage} className="text-xs font-normal text-violet-700 hover:underline" data-testid="manage-members">管理</button>
        )}
      </h2>
      <ul>
        {table.columns.map(col => {
          const tags: Array<{ text: string; strong: boolean }> = []
          if (col.role === 'organizer') tags.push({ text: '主催者', strong: true })
          if (col.role === 'guest') tags.push({ text: 'ゲスト', strong: false })
          if (hasCandidates) tags.push({ text: col.answeredAll ? '回答済み' : '未回答', strong: false })
          return (
            <li key={col.memberId} className="flex items-center gap-2.5 py-2 border-b border-border last:border-b-0 text-sm">
              <span className="w-7 h-7 shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700" aria-hidden="true">
                {col.name.slice(0, 1)}
              </span>
              <span className="flex-1 min-w-0 truncate">{col.name}{col.isMe ? '（あなた）' : ''}</span>
              <span className="flex shrink-0 gap-1">
                {tags.map(tag => (
                  <span key={tag.text} className={`rounded-full px-2 py-0.5 text-xs ${tag.strong ? 'bg-violet-50 text-violet-800' : 'bg-muted text-muted-foreground'}`}>{tag.text}</span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300 gap-1" onClick={onCopyInvite} data-testid="copy-invite">
          {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
          {copied ? 'コピーしました' : '招待リンクをコピー'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={onShareLine}>
          LINEで送る
        </Button>
      </div>
    </section>
  )
}
