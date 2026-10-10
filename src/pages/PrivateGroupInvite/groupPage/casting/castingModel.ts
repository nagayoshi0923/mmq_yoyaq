/**
 * 配役（決め方の選択・自分たちで決める・事前配役アンケート）の読み方（純粋な関数）。
 * 「いまの状態」の箱・配役の全画面シート・概要タブの「配役」欄で共用。
 * 決め方（character_assignment_method）と、チャットに残る配役の確定・決め方の選び直しのお知らせから、いまどの段階かを決める。
 * 確定の判定はチャット（GroupChat の currentAssignmentConfirmed）と同じ: 最後に決め方を選び直した後に「配役が確定しました」があれば確定。
 */
import { getJstParts } from '@/utils/jstDate'
import type { CastingProgress } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingModel'
import type { PrivateGroupCastingStatus } from '@/lib/privateGroupCastingStatus'
import type { AnswerColumn } from '../groupPageModel'

export type CastingStage =
  | 'choose' // ① 決め方をまだ選んでいない
  | 'collect' // ② 自分たちで決める・希望を集めている
  | 'survey' // ⑤ 事前配役アンケート
  | 'confirmed' // ④ 配役が確定した

export interface CastingCharacter {
  id: string
  name: string
  gender?: string
  image_url?: string
  image_position?: string
  image_scale?: number | null
}

export interface CastingMember {
  memberId: string
  name: string
  isMe: boolean
  isGuest: boolean
}

/** チャットのお知らせを古い順に見て、いまの配役が確定済みか */
export function isCastingConfirmed(messages: ReadonlyArray<{ message: string }>): boolean {
  let confirmed = false
  for (const m of messages) {
    if (!m.message.startsWith('{')) continue
    try {
      const action = (JSON.parse(m.message) as { action?: string })?.action
      if (action === 'character_method_selected') confirmed = false
      else if (action === 'character_assignment') confirmed = true
    } catch { /* 通常の発言 */ }
  }
  return confirmed
}

export function castingStage(method: string | null | undefined, confirmed: boolean): CastingStage {
  if (confirmed) return 'confirmed'
  if (method === 'self') return 'collect'
  if (method === 'survey') return 'survey'
  return 'choose'
}

/** 同じキャラクターが 2 人以上に割り当てられているキャラクター id */
export function duplicatedCharacters(members: ReadonlyArray<CastingMember>, decisions: Readonly<Record<string, string>>): string[] {
  const chosen = members.map(m => decisions[m.memberId]).filter((v): v is string => Boolean(v))
  return [...new Set(chosen.filter((v, i) => chosen.indexOf(v) !== i))]
}

/** 全員分が決まり、重なりが無ければ確定できる */
export function canConfirmCasting(members: ReadonlyArray<CastingMember>, decisions: Readonly<Record<string, string>>): boolean {
  return members.length > 0 && members.every(m => decisions[m.memberId]) && duplicatedCharacters(members, decisions).length === 0
}

/** 「あなた」「二郎」の表示名（自分は「あなた」） */
export function shortName(m: CastingMember): string {
  return m.isMe ? 'あなた' : m.name
}

/** 表の行の名前（「いちこ（あなた）」「三郎（ゲスト）」） */
export function rowName(m: CastingMember): string {
  return `${m.name}${m.isMe ? '（あなた）' : m.isGuest ? '（ゲスト）' : ''}`
}

/** キャラクターのカードの下の行（あなたの希望／二郎・三郎が希望／まだ誰も） */
export function preferenceLabel(characterId: string, members: ReadonlyArray<CastingMember>, preferences: Readonly<Record<string, string>>): string {
  const by = members.filter(m => preferences[m.memberId] === characterId)
  if (by.length === 0) return 'まだ誰も'
  const me = by.find(m => m.isMe)
  const others = by.filter(m => !m.isMe).map(m => m.name)
  if (me && others.length === 0) return 'あなたの希望'
  return `${[...(me ? ['あなた'] : []), ...others].join('・')}が希望`
}

/** 「11/5(木)」（JST） */
export function deadlineLabel(deadlineAt: string | null | undefined): string | null {
  if (!deadlineAt) return null
  const p = getJstParts(new Date(deadlineAt))
  return p ? `${Number(p.mo)}/${Number(p.d)}(${p.weekday})` : null
}

/** 作品のキャラクター（NPC を除く） */
export function castingCharactersOf(characters: ReadonlyArray<CastingCharacter & { is_npc?: boolean }> | null | undefined): CastingCharacter[] {
  return (characters ?? []).filter(c => !c.is_npc)
}

/** 回答表の列（参加中・自分を先頭）から配役の行を作る */
export function castingMembersOf(columns: ReadonlyArray<AnswerColumn>): CastingMember[] {
  return columns.map(c => ({ memberId: c.memberId, name: c.name, isMe: c.isMe, isGuest: c.role === 'guest' }))
}

/** 事前配役アンケートが使えるか（設定で有効・外部フォームでない・質問がある） */
export function surveyUsable(status: PrivateGroupCastingStatus | null | undefined): boolean {
  return Boolean(status?.survey_enabled && !status.external && (status.question_count ?? 0) > 0)
}

/** グループ画面の判定入力（キャラクターがいなければ null） */
export function castingProgressFor(args: {
  method: string | null | undefined
  assignments: Readonly<Record<string, string>>
  members: ReadonlyArray<CastingMember>
  characterCount: number
  status: PrivateGroupCastingStatus | null | undefined
}): CastingProgress | null {
  if (args.characterCount === 0 || !args.status) return null
  const method = args.method === 'survey' || args.method === 'self' ? args.method : null
  const me = args.members.find(m => m.isMe)
  return {
    method,
    needsChoice: surveyUsable(args.status),
    confirmed: args.status.casting_confirmed === true,
    myPicked: Boolean(me && args.assignments[me.memberId]),
    picked: args.members.filter(m => args.assignments[m.memberId]).length,
    total: args.members.length,
  }
}

export type CastingSheet = 'casting-method' | 'casting-pick' | 'casting-confirm'
export function isCastingSheet(value: string | null): value is CastingSheet {
  return value === 'casting-method' || value === 'casting-pick' || value === 'casting-confirm'
}
