/**
 * 概要タブの「配役」欄（アンカー #casting。見本 Casting.dc.html の ④⑤）。日程確定後、「日程と場所」の次に出す。
 * ここは状態の確認と主催者の「変更する」の入口だけ。操作は「いまの状態」の箱と全画面シート（casting/CastingScreen）で行う。
 *   確定前: 「決め方: 自分たちで決める・希望 4/6」の 1〜2 行（主催者は「› 決め方を変える」）
 *   確定後: メンバー → キャラクターの 2 列（主催者は「配役を変更する」）
 *   事前配役アンケート: 回答状況（回答済み N/M 名・未回答の人は主催者だけ）と「アンケートに回答する」
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PrivateGroupCastingStatus } from '@/lib/privateGroupCastingStatus'
import { OverviewSection } from './OverviewSection'
import { CharacterImage } from '../casting/CharacterImage'
import { deadlineLabel, rowName, shortName, type CastingCharacter, type CastingMember } from '../casting/castingModel'

export interface CastingSectionProps {
  isOrganizer: boolean
  myMemberId: string
  method: string | null
  confirmed: boolean
  assignments: Record<string, string>
  characters: CastingCharacter[]
  members: CastingMember[]
  status: PrivateGroupCastingStatus | null | undefined
  /** 決め方の選択を出す（事前配役アンケートが使える） */
  surveyAvailable: boolean
  onChangeMethod: () => void
  onChangeCasting: () => void
  onOpenSurvey: () => void
  /** 事前配役アンケートの未回答の人に知らせる（主催者） */
  onRemindSurvey: (memberIds: string[]) => Promise<void>
}

function Tag({ children, tone = 'violet' }: { children: string; tone?: 'violet' | 'green' | 'gray' }) {
  const cls = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'gray' ? 'bg-muted text-muted-foreground' : 'bg-violet-50 text-violet-800'
  return <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-normal ${cls}`}>{children}</span>
}

const linkCls = 'text-violet-700 hover:underline'

export function CastingSection(props: CastingSectionProps) {
  const { isOrganizer, myMemberId, method, confirmed, assignments, characters, members, status, surveyAvailable, onChangeMethod, onChangeCasting, onOpenSurvey, onRemindSurvey } = props
  const [reminding, setReminding] = useState(false)
  const changeMethod = isOrganizer && !confirmed && (method !== null || surveyAvailable)
    ? <button type="button" className={linkCls} onClick={onChangeMethod} data-testid="casting-change-method">› 決め方を{method ? '変える' : '選ぶ'}</button>
    : undefined

  if (confirmed) {
    // ④ 確定後
    return (
      <div id="casting" className="scroll-mt-3">
        <OverviewSection label="配役" testId="overview-casting" title={<>配役<Tag tone="green">確定</Tag></>}>
          <div className="grid grid-cols-2 gap-2" data-testid="casting-confirmed">
            {members.map(m => {
              const c = characters.find(x => x.id === assignments[m.memberId])
              return (
                <div key={m.memberId} className="flex items-center gap-2 rounded-lg border border-border p-1.5">
                  {c ? <CharacterImage c={c} className="h-10 w-10 shrink-0 rounded-md" /> : <div className="h-10 w-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />}
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted-foreground">{rowName(m)}</div>
                    <div className="truncate text-sm font-bold">{c?.name ?? '未定'}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-snug">店舗と GM にも伝わります。</p>
          {isOrganizer && method === 'self' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={onChangeCasting} data-testid="casting-change">配役を変更する</Button>
            </div>
          )}
        </OverviewSection>
      </div>
    )
  }

  if (method === 'survey') {
    // ⑤ 事前配役アンケート
    const deadline = deadlineLabel(status?.deadline_at)
    const unanswered = status?.unanswered ?? []
    const closed = Boolean(status?.deadline_at && new Date(status.deadline_at).getTime() <= Date.now())
    const others = unanswered.filter(u => u.member_id !== myMemberId)
    const remind = async () => {
      if (reminding) return
      setReminding(true)
      try { await onRemindSurvey(others.map(u => u.member_id)) } catch { /* 失敗はお知らせ側で表示 */ } finally { setReminding(false) }
    }
    return (
      <div id="casting" className="scroll-mt-3">
        <OverviewSection label="配役" testId="overview-casting" title={<>配役<Tag tone="green">事前配役アンケート</Tag></>} aside={changeMethod}>
          <div data-testid="casting-survey">
            <p className="text-sm leading-snug">
              全員がアンケートに答えると、店舗と GM が配役を決めて当日お伝えします。
              {deadline && <>回答期限 <strong>{deadline}</strong>{closed ? '（締め切りました）' : ''}。</>}
            </p>
            {status?.survey_enabled && !status.external && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700" data-testid="casting-survey-count">回答済み {status.answered_count ?? 0}/{status.target_count ?? 0} 名</span>
                {isOrganizer
                  ? unanswered.length > 0 && (
                    <span className="text-muted-foreground" data-testid="casting-survey-unanswered">
                      未回答: {unanswered.map(u => (u.member_id === myMemberId ? 'あなた' : u.name)).join('・')}
                    </span>
                  )
                  : !status.i_answered && <span className="text-muted-foreground" data-testid="casting-survey-me">あなたは未回答</span>}
              </div>
            )}
            {!closed && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" className="h-auto py-1.5 px-3 text-xs rounded-md bg-emerald-700 hover:bg-emerald-800 text-white" onClick={onOpenSurvey} data-testid="casting-survey-open">
                  {status?.i_answered ? '回答を変更する' : 'アンケートに回答する'}
                </Button>
                {isOrganizer && others.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="h-auto py-1.5 px-2.5 text-xs rounded-md bg-background border-zinc-300" onClick={() => void remind()} disabled={reminding} data-testid="casting-survey-remind">
                    {reminding ? '送信中…' : '未回答の人に知らせる'}
                  </Button>
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">回答は店舗と GM にだけ届きます。</p>
          </div>
        </OverviewSection>
      </div>
    )
  }

  // 確定前（決め方を選ぶ前・自分たちで決める）: 1〜2 行
  const picked = members.filter(m => assignments[m.memberId])
  const notPicked = members.filter(m => !assignments[m.memberId])
  return (
    <div id="casting" className="scroll-mt-3">
      <OverviewSection
        label="配役"
        testId="overview-casting"
        title={<>配役{method === 'self' ? <Tag>自分たちで決める</Tag> : <Tag tone="gray">主催者が決めます</Tag>}</>}
        aside={changeMethod}
      >
        {method === 'self' ? (
          <div data-testid="casting-collect-summary">
            <p className="text-sm">決め方: 自分たちで決める・希望 {picked.length}/{members.length}</p>
            {notPicked.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">未回答: {notPicked.map(shortName).join('・')}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{characters.length} 人のキャラクターから希望を出し、主催者が確定します。</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="casting-choose-summary">
            {isOrganizer ? '配役の決め方をまだ選んでいません。上の「いまの状態」から選べます。' : '配役の決め方を主催者が選んでいます。'}
          </p>
        )}
      </OverviewSection>
    </div>
  )
}
