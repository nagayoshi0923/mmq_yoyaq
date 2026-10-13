import type { PrivateGroup } from '@/types'
import type { PrivateGroupHandoverInfo } from './privateGroupHandover'

/** マイページの貸切カード用に、グループ（private_groups）から必要な項目だけを抜き出したもの */
export interface PrivateGroupSummary {
  id: string
  name: string | null
  invite_code: string
  status: string
  scenario_title: string | null
  scenario_image: string | null
  scenario_player_count_max: number | null
  member_count: number
  is_organizer: boolean
  created_at: string
  reservation_id?: string | null
  /** 主催者の表示名（ニックネーム未設定なら null） */
  organizer_name: string | null
  /** 自分のメンバー行 id（アンケートの未回答確認に使う） */
  my_member_id: string | null
  /** 有効な候補日（却下を除く）の件数 */
  candidate_dates_count: number
  /** 自分が未回答の候補日の件数 */
  my_unanswered_count: number
  /** 参加中の全員が全候補日に回答済みか（グループ画面の「全員回答済み」と同じ判定） */
  all_members_responded: boolean
  /** 確定した公演の日時・店舗（確定済みのときだけ）。end_time・store_id は分かるときだけ（カレンダー・地図に使う） */
  schedule: { date: string; start_time: string | null; store_name: string | null; end_time?: string | null; store_id?: string | null } | null
  organization_id: string | null
  /** 事前配役アンケートが有効な作品か */
  survey_enabled: boolean
  /** メンバー管理シートの行（参加中のみ・参加順） */
  members: PrivateGroupMemberRow[]
  /** 進行中の主催者の引き継ぎ依頼（自分が依頼した・頼まれているときだけ） */
  handover: PrivateGroupHandoverInfo | null
  /** 配役（キャラクターのいる作品だけ。いなければ null）。希望は character_assignments（確定前は各自の希望） */
  casting?: { method: 'survey' | 'self' | null; picked: number; total: number; myPicked: boolean; surveyEnabled: boolean } | null
}

/** メンバー管理シートの 1 行 */
export interface PrivateGroupMemberRow {
  id: string
  name: string
  /** 主催者／会員（アカウントあり）／ゲスト */
  role: 'organizer' | 'member' | 'guest'
  /** 回答済みの候補日の件数 */
  answered: number
  /** 有効な候補日の件数 */
  total: number
  joined_at: string | null
}

/** 参加中のメンバーを管理シートの行にする（マイページ・グループ画面で共通） */
export function toMemberRows(group: Pick<PrivateGroup, 'members' | 'candidate_dates'>): PrivateGroupMemberRow[] {
  // 主催者を先頭に、あとは参加順（読み取り結果の並び）
  const joined = (group.members ?? []).filter(m => m.status === 'joined').sort((a, b) => Number(b.is_organizer) - Number(a.is_organizer))
  const activeDates = (group.candidate_dates ?? []).filter(d => d.status !== 'rejected')
  return joined.map(m => {
    const answered = activeDates.filter(d =>
      d.responses?.some(r => r.member_id === m.id) || m.date_responses?.some(r => r.candidate_date_id === d.id),
    ).length
    const rawName = m.guest_name?.trim() || m.users?.nickname || ''
    return {
      id: m.id,
      name: rawName && rawName !== NICKNAME_UNSET ? rawName : 'メンバー',
      role: m.is_organizer ? 'organizer' : m.user_id ? 'member' : 'guest',
      answered,
      total: activeDates.length,
      joined_at: m.joined_at ?? m.created_at ?? null,
    }
  })
}

/** get_private_group_schedules の 1 行（確定公演が読めないときの予備） */
export interface PrivateGroupScheduleRow {
  requested_datetime: string
  store_id: string | null
  store_name: string | null
}

/** private_group_read_snapshot が未設定ニックネームに入れる文言 */
const NICKNAME_UNSET = 'ニックネーム未設定'

function scheduleFromRequested(row: PrivateGroupScheduleRow | undefined, storeNameById: Record<string, string>): PrivateGroupSummary['schedule'] {
  if (!row?.requested_datetime) return null
  const raw = row.requested_datetime
  const date = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const time = raw.match(/[T ](\d{2}:\d{2})/)?.[1] ?? null
  return { date, start_time: time, store_name: row.store_name || (row.store_id ? storeNameById[row.store_id] ?? null : null), store_id: row.store_id }
}

export function summarizePrivateGroup(
  group: PrivateGroup,
  userId: string | undefined,
  scheduleRow: PrivateGroupScheduleRow | undefined,
  storeNameById: Record<string, string>,
  handover: PrivateGroupHandoverInfo | null = null,
): PrivateGroupSummary {
  const joined = (group.members ?? []).filter(m => m.status === 'joined')
  const me = joined.find(m => m.user_id && m.user_id === userId) ?? null
  // 主催者はグループの organizer_id で決める（主催者の引き継ぎで切り替わる）。読めない旧データはメンバー行の印で補う
  const organizer = (group.organizer_id ? joined.find(m => m.user_id === group.organizer_id) : null) ?? joined.find(m => m.is_organizer) ?? null
  const organizerName = organizer?.guest_name?.trim()
  const activeDates = (group.candidate_dates ?? []).filter(d => d.status !== 'rejected')
  const answeredBy = (memberId: string) => activeDates.filter(d =>
    d.responses?.some(r => r.member_id === memberId) ||
    joined.find(m => m.id === memberId)?.date_responses?.some(r => r.candidate_date_id === d.id),
  ).length
  const myUnanswered = me ? activeDates.length - answeredBy(me.id) : 0
  const allResponded = activeDates.length > 0 && joined.length > 0 && joined.every(m => answeredBy(m.id) === activeDates.length)
  const scenario = group.scenario_masters
  const confirmed = group.confirmed_performance
  const schedule = group.status !== 'confirmed'
    ? null
    : confirmed?.date
      ? { date: confirmed.date, start_time: confirmed.start_time?.slice(0, 5) ?? null, store_name: confirmed.store_name, end_time: confirmed.end_time?.slice(0, 5) ?? null, store_id: scheduleRow?.store_id ?? null }
      : scheduleFromRequested(scheduleRow, storeNameById)
  return {
    id: group.id,
    name: group.name,
    invite_code: group.invite_code,
    status: group.status,
    scenario_title: scenario?.title || null,
    scenario_image: scenario?.key_visual_url || null,
    scenario_player_count_max: scenario?.player_count_max || null,
    member_count: joined.length,
    is_organizer: me ? (group.organizer_id ? group.organizer_id === userId : me.is_organizer) : false,
    created_at: group.created_at,
    reservation_id: group.reservation_id ?? null,
    organizer_name: organizerName && organizerName !== NICKNAME_UNSET ? organizerName : null,
    my_member_id: me?.id ?? null,
    candidate_dates_count: activeDates.length,
    my_unanswered_count: myUnanswered,
    all_members_responded: allResponded,
    schedule,
    organization_id: group.organization_id ?? null,
    survey_enabled: (scenario as { survey_enabled?: boolean } | undefined)?.survey_enabled === true,
    members: toMemberRows(group),
    handover,
    casting: castingOf(group, joined.map(m => m.id), me?.id ?? null, (scenario as { survey_enabled?: boolean } | undefined)?.survey_enabled === true),
  }
}

/** 配役の要約（非 NPC のキャラクターがいる作品だけ） */
function castingOf(group: PrivateGroup, joinedIds: string[], myId: string | null, surveyEnabled: boolean): PrivateGroupSummary['casting'] {
  const characters = ((group.scenario_masters as { characters?: Array<{ is_npc?: boolean }> } | undefined)?.characters ?? []).filter(c => !c.is_npc)
  if (characters.length === 0) return null
  const raw = group.character_assignment_method as string | null | undefined
  const method = raw === 'survey' || raw === 'self' ? raw : null
  const assignments = (group.character_assignments ?? {}) as Record<string, string>
  return {
    method,
    picked: joinedIds.filter(id => assignments[id]).length,
    total: joinedIds.length,
    myPicked: Boolean(myId && assignments[myId]),
    surveyEnabled,
  }
}
