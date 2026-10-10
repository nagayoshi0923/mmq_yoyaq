/**
 * 日程タブ: 回答表・候補日の追加と編集・未回答の人に知らせる・希望店舗。
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CandidateDateRows } from '@/components/patterns/privateGroup/CandidateDateRows'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import type { DateResponse, PrivateGroup } from '@/types'
import { DateAnswerTable } from './DateAnswerTable'
import { unansweredMembers, type AnswerTable } from './groupPageModel'

interface GroupDatesTabProps {
  group: PrivateGroup
  table: AnswerTable
  isOrganizer: boolean
  /** 店舗への申込前（候補日の追加・回答・申込ができる） */
  canMutateSchedule: boolean
  /** 自分が参加中（回答できる） */
  isMember: boolean
  onAnswer: (candidateId: string, response: DateResponse) => Promise<void>
  onBook: (candidateId?: string) => void
  /** 候補日の追加・編集（?sheet=dates） */
  editorOpen: boolean
  onOpenEditor: () => void
  onCloseEditor: () => void
  onDatesChanged: () => unknown
  /** 未回答の人に知らせる（主催者だけ。チャットに灰色の 1 行のお知らせが入る） */
  onRemind: (memberIds: string[]) => Promise<void>
  preferredStoreNames: string[]
  onEditStore: () => void
  formatDateJaMd: (dateStr: string) => string
}

export function GroupDatesTab(props: GroupDatesTabProps) {
  const { group, table, isOrganizer, canMutateSchedule, isMember, onAnswer, onBook, editorOpen, onOpenEditor, onCloseEditor, onDatesChanged, onRemind, preferredStoreNames, onEditStore, formatDateJaMd } = props
  const [reminding, setReminding] = useState(false)
  // 「候補日を追加」「候補日を編集」で開いたら、表の下の編集欄まで動かす
  const editorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (editorOpen) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editorOpen])
  const unanswered = unansweredMembers(table)
  const guestsUnanswered = unanswered.filter(c => c.role === 'guest')
  const history = Boolean(group.confirmed_performance) || !canMutateSchedule

  const remind = async () => {
    if (reminding || unanswered.length === 0) return
    setReminding(true)
    try {
      await onRemind(unanswered.map(c => c.memberId))
    } finally {
      setReminding(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="bg-card border border-border rounded-lg p-3" aria-label="候補日と回答">
        <h2 className="mb-2 flex items-center justify-between gap-2 text-sm font-bold">
          {history ? (group.confirmed_performance ? '申込時の候補日（履歴）' : '候補日と回答（店舗の返事待ち）') : '候補日と回答'}
          {!history && isMember && table.rows.length > 0 && <span className="text-xs font-normal text-muted-foreground">自分の列を押して回答</span>}
        </h2>
        <DateAnswerTable
          table={table}
          canAnswer={isMember && canMutateSchedule}
          onAnswer={onAnswer}
          onBook={isOrganizer && canMutateSchedule ? id => onBook(id) : null}
        />
        {table.rows.length > 0 && !history && (
          <p className="mt-2 text-xs text-muted-foreground">
            「–」は未回答。
            {guestsUnanswered.length > 0 && `${guestsUnanswered.map(c => `${c.name}さん`).join('、')}には招待リンクから回答をお願いしてください。`}
          </p>
        )}
        {!history && (
          <div className="mt-3 flex flex-wrap gap-2">
            {isOrganizer && (
              <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={editorOpen ? onCloseEditor : onOpenEditor} data-testid="toggle-date-editor">
                {editorOpen ? '候補日の編集を閉じる' : table.rows.length > 0 ? '候補日を追加・編集' : '候補日を追加'}
              </Button>
            )}
            {isMember && isOrganizer && unanswered.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={() => void remind()} disabled={reminding} data-testid="remind-unanswered">
                {reminding ? '送信中…' : '未回答の人に知らせる'}
              </Button>
            )}
          </div>
        )}
      </section>

      {isOrganizer && canMutateSchedule && editorOpen && (
        <section ref={editorRef} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-3 scroll-mt-3" aria-label="候補日の追加・編集" data-testid="date-editor">
          <AddCandidateDates
            groupId={group.id}
            organizationId={group.organization_id || ''}
            scenarioId={group.scenario_master_id || ''}
            storeIds={group.preferred_store_ids || []}
            existingDates={group.candidate_dates || []}
            onDatesAdded={() => {
              void onDatesChanged()
              onCloseEditor()
            }}
          />
          {table.rows.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium">登録済みの候補日（外す）</h3>
              <CandidateDateRows
                group={group}
                memberCount={table.memberCount}
                existingMemberId={null}
                responses={{}}
                onResponseChange={() => {}}
                canWithdraw
                onWithdrawn={() => onDatesChanged()}
                formatDateJaMd={formatDateJaMd}
              />
            </div>
          )}
        </section>
      )}

      <section className="bg-card border border-border rounded-lg p-3" aria-label="希望店舗">
        <h2 className="mb-1 flex items-center justify-between text-sm font-bold">
          希望店舗
          {isOrganizer && canMutateSchedule && (
            <button type="button" onClick={onEditStore} className="text-xs font-normal text-violet-700 hover:underline">編集</button>
          )}
        </h2>
        <p className="text-sm">{preferredStoreNames.length > 0 ? `${preferredStoreNames.join('・')}${preferredStoreNames.length === 2 ? '（どちらでも可）' : preferredStoreNames.length > 2 ? '（どの店舗でも可）' : ''}` : '未設定'}</p>
      </section>
    </div>
  )
}
