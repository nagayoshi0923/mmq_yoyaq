/**
 * マイページの貸切カードから、グループ画面へ移らずにその場で行う 4 つの操作（2026-10-09 社長決定・案 3）。
 *   dates  = 候補日を追加・編集（主催者・店舗への申込前）
 *   store  = 希望店舗を変更（主催者・店舗への申込前）
 *   answer = 日程に回答する（○△×）
 *   survey = 公演前アンケート
 * 中身はグループ画面と同じ部品（AddCandidateDates・CandidateDateRows・PreferredStoreChecklist・
 * usePreferredStoreEditor・SurveyResponseForm）を使い、編集画面を二重に持たない。会員のみ（ゲストの PIN 分岐は不要）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CandidateDateRows } from '@/components/patterns/privateGroup/CandidateDateRows'
import { PreferredStoreChecklist } from '@/components/patterns/privateGroup/PreferredStoreChecklist'
import { canMutateScheduleBeforeStoreReply } from '@/components/patterns/privateGroup/privateGroupScheduleRules'
import { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { SurveyResponseForm } from '@/pages/PrivateGroupInvite/components/SurveyResponseForm'
import { usePreferredStoreEditor } from '@/pages/PrivateGroupInvite/usePreferredStoreEditor'
import { getErrorMessage } from '@/lib/errorFields'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { getJstParts } from '@/utils/jstDate'
import type { DateResponse } from '@/types'

export type PrivateGroupInPlaceMode = 'dates' | 'store' | 'answer' | 'survey'

const TITLES: Record<PrivateGroupInPlaceMode, string> = {
  dates: '候補日を追加・編集',
  store: '希望店舗を変更',
  answer: '日程に回答する',
  survey: '公演前アンケート',
}

const DESCRIPTIONS: Record<PrivateGroupInPlaceMode, string> = {
  dates: '候補日を追加すると、メンバーが都合を回答できます。',
  store: '希望店舗を変えると、空き枠のない候補日は外れます。',
  answer: '候補日ごとに ○（参加できる）・△（微妙）・×（参加できない）を選んで保存してください。',
  survey: '公演前のアンケートに回答してください。',
}

/**
 * 候補日ダイアログ: スマホ（〜640px）は全画面（上に閉じる、下に保存列）、PC は中央で幅 lg・高さ 90vh。
 * スクロールは本文の 1 つだけ（カレンダーの枠の中ではスクロールさせない）。
 */
const DATES_DIALOG_CLASS =
  'flex flex-col gap-0 overflow-hidden p-0 sm:p-0 md:p-0 sm:max-w-lg sm:max-h-[90vh] ' +
  'max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none ' +
  'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0'

const LOCKED_TEXT = '店舗の返答待ちのため、候補日の追加・希望店舗の変更はできません。'

/** "11月30日(月)" 形式（グループ画面の候補日一覧と同じ） */
function formatDateJaMd(dateStr: string): string {
  const p = getJstParts(dateStr)
  return p ? `${Number(p.mo)}月${Number(p.d)}日(${p.weekday})` : ''
}

interface PrivateGroupInPlaceDialogProps {
  mode: PrivateGroupInPlaceMode | null
  onClose: () => void
  inviteCode: string
  title: string
  myMemberId: string | null
  /** 保存したあと（カードのラベル・人数・候補日を読み直す） */
  onSaved: () => void | Promise<unknown>
}

export function PrivateGroupInPlaceDialog({ mode, onClose, inviteCode, title, myMemberId, onSaved }: PrivateGroupInPlaceDialogProps) {
  const open = mode !== null
  // 開いている間だけグループを読む
  const { group, loading, refetch, linkedReservationStatus } = usePrivateGroupByInviteCode(open ? inviteCode : null, myMemberId)
  const canMutate = canMutateScheduleBeforeStoreReply(group, linkedReservationStatus)
  const joinedMembers = useMemo(() => group?.members?.filter(m => m.status === 'joined') ?? [], [group?.members])

  const finish = async () => {
    onClose()
    await onSaved()
  }
  const isDates = mode === 'dates'
  // 見出しの 2 行目「作品名 ・ 希望店舗: ○○」（グループ画面と同じ問い合わせ・同じキャッシュ）
  const storeIds = group?.preferred_store_ids
  const { data: preferredStores = [] } = useQuery({
    queryKey: ['private-group-invite', 'preferred-stores', storeIds],
    enabled: isDates && !!storeIds?.length,
    queryFn: async () => {
      const { data, error } = await privateGroupPageReadApi.listStoresByIds(storeIds!)
      if (error) throw error
      return data || []
    },
  })
  const storeLabel = preferredStores.length > 0 ? `希望店舗: ${preferredStores.map(s => s.name).join('・')}` : ''

  const candidateList = group && (
    <div>
      <h4 className="mb-1.5 text-sm font-bold">
        {isDates ? '登録済みの候補日' : '候補日程'}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{group.candidate_dates?.length || 0} 件</span>
      </h4>
      <CandidateDateRows
        group={group}
        memberCount={joinedMembers.length}
        existingMemberId={null}
        responses={{}}
        onResponseChange={() => {}}
        canWithdraw={canMutate}
        onWithdrawn={async () => { await Promise.all([refetch(), onSaved()]) }}
        formatDateJaMd={formatDateJaMd}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent
        className={isDates ? DATES_DIALOG_CLASS : 'sm:max-w-lg max-h-[85vh] sm:max-h-[85vh] overflow-y-auto'}
        data-testid="private-group-inplace-dialog"
        data-mode={mode ?? ''}
      >
        <DialogHeader className={isDates ? 'shrink-0 space-y-0.5 border-b px-3.5 py-3 pr-12 text-left' : 'text-left pr-6'}>
          <DialogTitle className={isDates ? 'text-base font-bold' : undefined}>{mode ? TITLES[mode] : ''}</DialogTitle>
          <DialogDescription className={isDates ? 'truncate text-xs' : undefined}>
            {isDates ? [title, storeLabel].filter(Boolean).join(' ・ ') : `${title}${mode ? `　${DESCRIPTIONS[mode]}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        <div className={isDates ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'contents'} data-testid="inplace-dialog-body">
        {!group ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" aria-hidden="true" />
            読み込み中...
          </div>
        ) : mode === 'dates' ? (
          canMutate ? (
            <AddCandidateDates
              groupId={group.id}
              organizationId={group.organization_id || ''}
              scenarioId={group.scenario_master_id || ''}
              storeIds={group.preferred_store_ids || []}
              existingDates={group.candidate_dates || []}
              onDatesAdded={() => { void finish() }}
              layout="dialog"
              onCancel={onClose}
              belowCalendar={(group.candidate_dates?.length ?? 0) > 0 ? <div className="border-t border-border pt-3">{candidateList}</div> : null}
            />
          ) : (
            <div className="space-y-3 p-3.5">
              <p className="p-2 border border-amber-200 bg-amber-50 text-xs text-amber-900 leading-snug">{LOCKED_TEXT}</p>
              {candidateList}
            </div>
          )
        ) : mode === 'store' ? (
          <StorePanel group={group} canMutate={canMutate} onClose={onClose} onSaved={onSaved} />
        ) : mode === 'answer' ? (
          <AnswerPanel group={group} memberId={myMemberId} memberCount={joinedMembers.length} onSaved={finish} />
        ) : mode === 'survey' && myMemberId ? (
          <SurveyResponseForm
            groupId={group.id}
            memberId={myMemberId}
            performanceDate={group.confirmed_performance?.date}
            characters={((group.scenario_masters as { characters?: Array<{ id: string; name: string; gender?: string; is_npc?: boolean }> } | undefined)?.characters ?? []).filter(c => !c.is_npc)}
            hideCharacterSelection={(group.character_assignment_method as string | null) !== 'survey'}
            explainEmptyState
            onSubmitted={() => { void finish() }}
          />
        ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type LoadedGroup = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>

/** 希望店舗の変更（グループ画面の「希望店舗を編集」と同じ読み込み・保存） */
function StorePanel({ group, canMutate, onClose, onSaved }: { group: LoadedGroup; canMutate: boolean; onClose: () => void; onSaved: () => void | Promise<unknown> }) {
  const editor = usePreferredStoreEditor({
    group,
    canMutateScheduleBeforeStoreReply: canMutate,
    openSheet: () => {},
    closeSheetReplace: onClose,
    refetch: () => { void onSaved() },
  })
  const prepared = useRef(false)
  useEffect(() => {
    if (prepared.current) return
    prepared.current = true
    if (!editor.prepareStoreEdit()) onClose()
  }, [editor, onClose])

  return (
    <div className="space-y-3">
      <div>
        <PreferredStoreChecklist
          isFilteredByScenario={editor.isFilteredByScenario}
          loading={editor.loadingStoresForEdit}
          stores={editor.allStores}
          selectedStoreIds={editor.selectedStoreIds}
          onChange={editor.setSelectedStoreIds}
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
        <Button
          type="button"
          onClick={() => { void editor.handleSavePreferredStores() }}
          disabled={editor.savingStores || editor.selectedStoreIds.length === 0}
          data-testid="inplace-save-stores"
        >
          {editor.savingStores ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
              保存中...
            </>
          ) : (
            `保存する（${editor.selectedStoreIds.length}件選択中）`
          )}
        </Button>
      </div>
    </div>
  )
}

/** 日程に回答する（グループ画面の「日程・進捗」の回答と同じ保存処理） */
function AnswerPanel({ group, memberId, memberCount, onSaved }: { group: LoadedGroup; memberId: string | null; memberCount: number; onSaved: () => void | Promise<unknown> }) {
  const { submitDateResponses, loading } = usePrivateGroup()
  const [responses, setResponses] = useState<Record<string, DateResponse | null>>({})
  // 自分の回答済みの内容から始める
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    const me = group.members?.find(m => m.id === memberId)
    if (!me) return
    seeded.current = true
    const initial: Record<string, DateResponse | null> = {}
    me.date_responses?.forEach(r => { initial[r.candidate_date_id] = r.response })
    setResponses(initial)
  }, [group.members, memberId])

  const save = async () => {
    if (!memberId) return
    const payload = Object.entries(responses)
      .filter(([id, response]) => response != null && group.candidate_dates?.some(d => d.id === id && d.status !== 'rejected'))
      .map(([candidateDateId, response]) => ({ candidateDateId, response: response as DateResponse }))
    try {
      await submitDateResponses(group.id, memberId, payload)
      toast.success('回答を保存しました')
      await onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err) || '回答を保存できませんでした')
    }
  }

  if (group.status !== 'gathering') {
    return <p className="text-sm text-muted-foreground">日程の回答の受付は終わっています。</p>
  }
  return (
    <div className="space-y-3">
      <CandidateDateRows
        group={group}
        memberCount={memberCount}
        existingMemberId={memberId}
        responses={responses}
        onResponseChange={(id, response) => setResponses(prev => ({ ...prev, [id]: prev[id] === response ? null : response }))}
        canWithdraw={false}
        onWithdrawn={() => {}}
        formatDateJaMd={formatDateJaMd}
      />
      <Button
        type="button"
        className="w-full bg-purple-600 hover:bg-purple-700"
        onClick={() => { void save() }}
        disabled={loading || !memberId || Object.values(responses).every(v => v == null)}
        data-testid="inplace-save-answers"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            保存中...
          </>
        ) : '回答を保存'}
      </Button>
    </div>
  )
}
