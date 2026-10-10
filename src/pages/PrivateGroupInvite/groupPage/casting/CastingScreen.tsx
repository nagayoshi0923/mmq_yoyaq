/**
 * 配役の全画面シート（見本 Casting.dc.html の ①〜③。候補日編集と同じく画面全体で開く）。
 *   ?sheet=casting-method  ① 決め方を選ぶ（主催者）
 *   ?sheet=casting-pick    ② やりたいキャラクターを選ぶ（各メンバー）
 *   ?sheet=casting-confirm ③ 配役を確定する（主催者。メンバー × 希望 × 配役の表）
 * 入口は「いまの状態」の箱・チャットタブの 1 行・マイページのカード・概要タブの「変更する」。
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Check, Loader2, Users } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errorFields'
import { logger } from '@/utils/logger'
import type { PrivateGroup } from '@/types'
import { saveCastingDecisions, saveCastingMethod, saveCharacterPreference } from './castingActions'
import { useGroupCasting } from './useGroupCasting'
import {
  canConfirmCasting, castingHeadcountNote, duplicatedCharacters, preferenceLabel, rowName, shortName,
  type CastingCharacter, type CastingMember, type CastingSheet,
} from './castingModel'

export interface CastingScreenProps {
  sheet: CastingSheet
  groupId: string
  myMemberId: string
  isOrganizer: boolean
  scenarioTitle?: string | null
  method: string | null
  /** private_groups.character_assignments（確定前は各自の希望、確定後は配役） */
  assignments: Record<string, string>
  /** いまの配役が確定済み（③ で「変更する」） */
  confirmed: boolean
  characters: CastingCharacter[]
  members: CastingMember[]
  /** 作品の人数（最低〜最大）。確定は人数に関係なくできる（登録していない同行者の配役は当日店舗が決める） */
  playerRange: { min: number | null; max: number | null }
  /** 事前配役アンケートが使える */
  surveyAvailable: boolean
  /** やりたいキャラクターを未選択の人に知らせる（主催者） */
  onRemind: (memberIds: string[]) => Promise<void>
  /** 保存したあと（グループ・チャット・状況を読み直す） */
  onChanged: () => Promise<unknown> | unknown
  onBack: () => void
}

export function CharacterImage({ c, className }: { c: CastingCharacter; className: string }) {
  if (!c.image_url) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted`} aria-hidden="true">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }
  const [x, y] = (c.image_position ?? '').split(' ')
  return (
    <div className={`${className} overflow-hidden bg-muted`}>
      <img
        src={c.image_url}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: x && y ? `${x}% ${y}%` : '50% 30%', transform: c.image_scale ? `scale(${c.image_scale / 100})` : undefined }}
      />
    </div>
  )
}

const TITLES: Record<CastingSheet, string> = {
  'casting-method': '配役の決め方を選ぶ',
  'casting-pick': 'やりたいキャラクターを選ぶ',
  'casting-confirm': '配役を確定する',
}

export function CastingScreen(props: CastingScreenProps) {
  const { sheet, groupId, myMemberId, isOrganizer, scenarioTitle, method, assignments, confirmed, characters, members, playerRange, surveyAvailable, onRemind, onChanged, onBack } = props
  const [busy, setBusy] = useState(false)
  const [preferences, setPreferences] = useState<Record<string, string>>(assignments)
  const [decisions, setDecisions] = useState<Record<string, string>>(() => ({ ...assignments }))
  useEffect(() => { setPreferences(assignments) }, [assignments])

  const run = async (label: string, fn: () => Promise<void>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    try {
      await fn()
      await onChanged()
      return true
    } catch (err) {
      logger.error(`${label}エラー:`, err)
      toast.error(`${label}できませんでした。${getErrorMessage(err) || '最新の状態を確認してください'}`)
      await onChanged()
      return false
    } finally {
      setBusy(false)
    }
  }

  const charName = (id: string | undefined) => (id ? characters.find(c => c.id === id)?.name : undefined)
  const notPicked = members.filter(m => !preferences[m.memberId])

  let body: JSX.Element
  if (sheet === 'casting-method') {
    // ① 決め方を選ぶ（主催者）
    const choose = async (next: 'survey' | 'self') => {
      if (next === method) return onBack()
      if (await run('決め方を保存', () => saveCastingMethod(groupId, next, method, assignments))) {
        toast.success(next === 'self' ? '「自分たちで決める」にしました' : '「事前配役アンケート」にしました')
        onBack()
      }
    }
    body = !isOrganizer ? (
      <p className="text-sm text-muted-foreground">配役の決め方を主催者が選んでいます。</p>
    ) : (
      <div data-testid="casting-method">
        <p className="text-sm leading-snug">キャラクターの配役をどう決めますか。決め方はあとから変えられます。</p>
        {method && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 leading-snug">
            決め方を変えると、いま出ている希望と配役、アンケートのキャラクターの回答はリセットされます。
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {(surveyAvailable || method === 'survey') && (
            <ChoiceButton
              title="事前配役アンケートで希望を伝える"
              note="全員がアンケートに答え、店舗と GM が配役を決めます"
              current={method === 'survey'}
              disabled={busy}
              onClick={() => void choose('survey')}
              testId="casting-method-survey"
            />
          )}
          <ChoiceButton
            title="自分たちで決める"
            note="メンバーが希望を出し、主催者が確定します"
            current={method === 'self'}
            disabled={busy}
            onClick={() => void choose('self')}
            testId="casting-method-self"
          />
        </div>
      </div>
    )
  } else if (sheet === 'casting-pick') {
    // ② やりたいキャラクターを選ぶ
    const mine = preferences[myMemberId]
    const pick = (characterId: string) => run('希望を保存', async () => {
      setPreferences(prev => ({ ...prev, [myMemberId]: characterId }))
      await saveCharacterPreference(groupId, myMemberId, characterId)
    })
    body = method !== 'self' || confirmed ? (
      <p className="text-sm text-muted-foreground">{confirmed ? '配役は確定しています。' : 'いまは希望を集めていません。'}</p>
    ) : (
      <div data-testid="casting-pick">
        <p className="text-sm leading-snug">やりたいキャラクターを 1 つ選んでください。最後に主催者が全員の希望を見て確定します。</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="キャラクター">
          {characters.map(c => {
            const isMine = mine === c.id
            return (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className={`rounded-lg border p-1.5 text-left transition-colors ${isMine ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-border bg-background hover:bg-muted'}`}
                aria-pressed={isMine}
                aria-label={`${c.name}を希望する`}
                onClick={() => void pick(c.id)}
                disabled={busy}
                data-testid="casting-character"
              >
                <CharacterImage c={c} className="aspect-square w-full rounded-md" />
                <span className="mt-1 flex items-center gap-1 text-sm font-bold">
                  {isMine && <Check className="h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />}
                  <span className="truncate">{c.name}</span>
                </span>
                <span className={`block truncate text-xs ${isMine ? 'text-violet-700' : 'text-muted-foreground'}`}>{preferenceLabel(c.id, members, preferences)}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5">希望を出した人 {members.length - notPicked.length}/{members.length}</span>
          {notPicked.length > 0 && <span className="text-muted-foreground">未回答: {notPicked.map(shortName).join('・')}</span>}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-snug">同じキャラクターに希望が重なっても大丈夫です。主催者が調整して確定します。</p>
        <Button type="button" className="mt-4 w-full bg-violet-600 hover:bg-violet-700" onClick={onBack} disabled={!mine || busy} data-testid="casting-pick-done">
          {mine ? `${charName(mine)}で希望を出しました・戻る` : 'キャラクターを選んでください'}
        </Button>
      </div>
    )
  } else {
    // ③ 配役を確定する（主催者）
    const dupes = duplicatedCharacters(members, decisions)
    const allDecided = members.every(m => decisions[m.memberId])
    const ok = canConfirmCasting(members, decisions)
    const shortNote = castingHeadcountNote(members.length, playerRange)
    const others = notPicked.filter(m => !m.isMe)
    const confirm = async () => {
      const done = await run('配役を確定', () => saveCastingDecisions(groupId, Object.fromEntries(members.map(m => [m.memberId, decisions[m.memberId]])), assignments))
      if (done) {
        toast.success('配役を確定しました')
        onBack()
      }
    }
    const remind = () => run('お知らせ', () => onRemind(others.map(m => m.memberId)))
    body = !isOrganizer || method !== 'self' ? (
      <p className="text-sm text-muted-foreground">配役は主催者が確定します。</p>
    ) : (
      <div data-testid="casting-confirm">
        <p className="text-sm leading-snug">
          {notPicked.length === 0 ? '全員の希望がそろいました。' : `希望を出した人 ${members.length - notPicked.length}/${members.length}。`}
          重なりを調整して確定してください。{confirmed ? '（確定済みの配役を変更します）' : ''}
        </p>
        {shortNote && <p className="mt-2 text-xs text-amber-800" data-testid="casting-headcount-note">{shortNote}</p>}
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 text-left font-normal">メンバー</th>
              <th className="py-1 text-left font-normal">希望</th>
              <th className="py-1 text-left font-normal">配役</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const dup = Boolean(decisions[m.memberId] && dupes.includes(decisions[m.memberId]))
              return (
                <tr key={m.memberId} className={`border-t border-border ${dup ? 'bg-amber-50' : ''}`} data-testid="casting-row" data-dup={dup ? 'true' : undefined}>
                  <td className="py-2 pr-1 font-medium break-words">{rowName(m)}</td>
                  <td className="py-2 pr-1 text-muted-foreground">{charName(preferences[m.memberId]) ?? '未回答'}</td>
                  <td className="py-2">
                    <select
                      aria-label={`${m.name}の配役`}
                      className={`w-full rounded-md border bg-background px-1.5 py-1.5 text-sm ${dup ? 'border-amber-400' : 'border-zinc-300'}`}
                      value={decisions[m.memberId] ?? ''}
                      onChange={e => setDecisions(prev => ({ ...prev, [m.memberId]: e.target.value }))}
                    >
                      <option value="" disabled>選んでください</option>
                      {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {dupes.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" role="alert">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {dupes.map(id => `${charName(id)}が ${members.filter(m => decisions[m.memberId] === id).length} 人`).join('、')}に重なっています。別のキャラクターにしてください。
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" className="h-auto py-2.5 bg-violet-600 hover:bg-violet-700 whitespace-normal" onClick={() => void confirm()} disabled={!ok || busy} data-testid="casting-confirm-submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : ok ? '配役を確定する' : !allDecided ? '配役を確定する（全員分を選ぶと押せます）' : '配役を確定する（重なりを直すと押せます）'}
          </Button>
          {others.length > 0 && !confirmed && (
            <Button type="button" variant="outline" className="h-auto py-2 bg-background border-zinc-300" onClick={() => void remind()} disabled={busy} data-testid="casting-remind">
              未回答の人に知らせる（{others.map(m => m.name).join('・')}）
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="casting-screen" data-sheet={sheet}>
      <Header />
      <div className="container mx-auto max-w-lg px-4 py-4 flex-1">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          グループに戻る
        </button>
        <h1 className="text-lg font-bold">{TITLES[sheet]}</h1>
        {scenarioTitle && <p className="mb-3 text-sm text-muted-foreground">{scenarioTitle}</p>}
        {body}
      </div>
    </div>
  )
}

function ChoiceButton({ title, note, current, disabled, onClick, testId }: { title: string; note: string; current: boolean; disabled: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      className={`rounded-lg border px-3 py-3 text-left hover:bg-violet-100 disabled:opacity-50 ${current ? 'border-violet-600 bg-violet-50' : 'border-violet-200 bg-violet-50/50'}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="block text-sm font-bold text-violet-900">{title}{current ? '（いまの決め方）' : ''}</span>
      <span className="block text-xs text-muted-foreground">{note}</span>
    </button>
  )
}

/** index.tsx から ?sheet=casting-* のときに出す（グループの読み取り結果から中身を組み立てる） */
export function CastingSheetRoute({ sheet, group, memberId, isOrganizer, scenarioTitle, playerRange, refetch, onBack }: {
  sheet: CastingSheet
  group: PrivateGroup
  memberId: string
  isOrganizer: boolean
  scenarioTitle?: string | null
  playerRange: { min: number | null; max: number | null }
  refetch: () => unknown
  onBack: () => void
}) {
  const casting = useGroupCasting({ group, memberId, active: true, playerRange })
  return (
    <CastingScreen
      sheet={sheet}
      groupId={group.id}
      myMemberId={memberId}
      isOrganizer={isOrganizer}
      scenarioTitle={scenarioTitle}
      method={casting.method}
      assignments={casting.assignments}
      confirmed={casting.status?.casting_confirmed === true}
      characters={casting.characters}
      members={casting.members}
      playerRange={casting.playerRange}
      surveyAvailable={casting.surveyAvailable}
      onRemind={ids => casting.remind(ids, 'casting')}
      onChanged={() => Promise.all([refetch(), casting.reloadStatus()])}
      onBack={onBack}
    />
  )
}
