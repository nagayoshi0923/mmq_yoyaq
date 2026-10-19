/**
 * 日程タブ: 回答表・表の下の「候補日を選んで店舗に申し込む」（主催者・申込前。箱の主ボタンと同じ申込シート）・
 * 候補日の追加と編集・未回答の人に知らせる・希望店舗。行には申込ボタンを置かない（2026-10-11 社長決定）。
 * 候補日の追加と編集は、マイページと同じ全画面のダイアログ（CandidateDatesDialog。下に保存を固定）を 1 回で開く
 * （2026-10-20 staging 点検: ページ内に埋め込んでいたため 2 回押さないと開かず、保存が見えなかった）。
 */
import { BOOK_ACTION_LABEL } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingModel'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CandidateDateRows } from '@/components/patterns/privateGroup/CandidateDateRows'
import { CandidateDatesDialog } from '@/components/patterns/privateGroup/CandidateDatesDialog'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { ScenarioStoreHint } from '@/components/private-booking/ScenarioStoreHint'
import { useScenarioStoreHint } from '@/hooks/useScenarioStoreHint'
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
  /** 表の下の「候補日を選んで店舗に申し込む」（主催者・申込前・候補日があるとき。箱の主ボタンと同じシート） */
  onBook?: (() => void) | null
  /** 候補日の画面の 2 行目に出す作品名 */
  title?: string
}

export function GroupDatesTab(props: GroupDatesTabProps) {
  const { group, table, isOrganizer, canMutateSchedule, isMember, onAnswer, editorOpen, onOpenEditor, onCloseEditor, onDatesChanged, onRemind, preferredStoreNames, onEditStore, formatDateJaMd, onBook = null, title = '' } = props
  const [reminding, setReminding] = useState(false)
  const unanswered = unansweredMembers(table)
  const guestsUnanswered = unanswered.filter(c => c.role === 'guest')
  const history = Boolean(group.confirmed_performance) || !canMutateSchedule
  // 希望店舗と作品の上演可能店舗が食い違うときの注意（申込前だけ）
  const storeHint = useScenarioStoreHint(
    canMutateSchedule ? group.organization_id : null,
    group.scenario_master_id,
    group.preferred_store_ids || [],
  )

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
        />
        {table.rows.length > 0 && history && isMember && (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="dates-closed-note">
            {group.confirmed_performance || group.status === 'confirmed'
              ? '日程が確定したため、日程の回答は締め切りました。'
              : '店舗へ申込済みのため、日程の回答は締め切りました。店舗の返事をお待ちください。'}
          </p>
        )}
        {table.rows.length > 0 && !history && (
          <p className="mt-2 text-xs text-muted-foreground">
            「–」は未回答。
            {guestsUnanswered.length > 0 && `${guestsUnanswered.map(c => `${c.name}さん`).join('、')}には招待リンクから回答をお願いしてください。`}
          </p>
        )}
        {!history && onBook && table.rows.some(r => !r.rejected) && (
          <Button type="button" className="mt-3 h-auto w-full rounded-md bg-violet-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-violet-700" onClick={onBook} data-testid="dates-book">
            {BOOK_ACTION_LABEL}
          </Button>
        )}
        {!history && (
          <div className={`flex gap-2 ${onBook ? 'mt-2' : 'mt-3 flex-wrap'}`}>
            {isOrganizer && (
              <Button type="button" variant="outline" size="sm" className={`h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300 ${onBook ? 'flex-1' : ''}`} onClick={onOpenEditor} data-testid="toggle-date-editor">
                {table.rows.length > 0 ? '候補日を追加・編集' : '候補日を追加'}
              </Button>
            )}
            {isMember && isOrganizer && unanswered.length > 0 && (
              <Button type="button" variant="outline" size="sm" className={`h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300 ${onBook ? 'flex-1' : ''}`} onClick={() => void remind()} disabled={reminding} data-testid="remind-unanswered">
                {reminding ? '送信中…' : '未回答の人に知らせる'}
              </Button>
            )}
          </div>
        )}
      </section>

      {isOrganizer && canMutateSchedule && (
        <CandidateDatesDialog
          open={editorOpen}
          onClose={onCloseEditor}
          description={[title, preferredStoreNames.length > 0 ? `希望店舗: ${preferredStoreNames.join('・')}` : ''].filter(Boolean).join(' ・ ')}
        >
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
            layout="dialog"
            onCancel={onCloseEditor}
            belowCalendar={table.rows.length > 0 ? (
              <div className="border-t border-border pt-3" data-testid="date-editor-registered">
                <h4 className="mb-1.5 text-sm font-bold">
                  登録済みの候補日
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{group.candidate_dates?.length || 0} 件</span>
                </h4>
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
            ) : null}
          />
        </CandidateDatesDialog>
      )}

      <section className="bg-card border border-border rounded-lg p-3" aria-label="希望店舗">
        <h2 className="mb-1 flex items-center justify-between text-sm font-bold">
          希望店舗
          {isOrganizer && canMutateSchedule && (
            <button type="button" onClick={onEditStore} className="text-xs font-normal text-violet-700 hover:underline">編集</button>
          )}
        </h2>
        <p className="text-sm">{preferredStoreNames.length > 0 ? `${preferredStoreNames.join('・')}${preferredStoreNames.length === 2 ? '（どちらでも可）' : preferredStoreNames.length > 2 ? '（どの店舗でも可）' : ''}` : '未設定'}</p>
        {storeHint && <div className="mt-2"><ScenarioStoreHint hint={storeHint} /></div>}
      </section>
    </div>
  )
}
