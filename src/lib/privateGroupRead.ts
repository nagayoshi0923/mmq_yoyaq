import { fetchInChunks } from '@/lib/fetchInChunks'
import { supabase } from '@/lib/supabase'
import { getPrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'
import type { PrivateGroup, PrivateGroupMessage } from '@/types'
function withoutWithdrawnCandidates(group: PrivateGroup): PrivateGroup {
  if (!group.candidate_dates?.some(date => date.withdrawn_at)) return group
  const withdrawnIds = new Set(group.candidate_dates.filter(date => date.withdrawn_at).map(date => date.id))
  return { ...group, candidate_dates: group.candidate_dates.filter(date => !date.withdrawn_at),
    members: group.members?.map(member => ({ ...member, date_responses: member.date_responses?.filter(response => !withdrawnIds.has(response.candidate_date_id)) })) }

}
export interface PrivateGroupSnapshot {
  group: PrivateGroup
  access_level: 'preview' | 'member' | 'organizer' | 'staff'
  current_member_id: string | null
  linked_reservation_status: string | null
  confirmed_by_name: string | null
  /** 紐づく申込（取消済みを除く）の予約番号・申込日時・人数・申込時の候補日・希望店舗名。preview には無い */
  linked_reservation?: PrivateGroupLinkedReservation | null
  /** 進行中の主催者の引き継ぎ依頼（当事者と同組織スタッフだけ。無ければ null） */
  handover?: PrivateGroupHandoverSummary | null
}

/** 進行中の主催者の引き継ぎ依頼の要約（private_group_read_snapshot の handover） */
export interface PrivateGroupHandoverSummary {
  id: string
  status: 'requested'
  from_member_id: string | null
  to_member_id: string | null
  from_name: string
  to_name: string
  requested_at: string
  expires_at: string
  /** 自分が宛先（新主催者になる人） */
  is_recipient: boolean
  /** 自分が依頼した（いまの主催者） */
  is_requester: boolean
}

export interface PrivateGroupLinkedReservation {
  reservation_number: string | null
  requested_at: string | null
  participant_count: number | null
  candidates: Array<{ date: string | null; startTime: string | null; endTime: string | null; timeSlot: string | null }>
  requested_store_names: string[]
}
/** グループが無い（RPC は成功したが中身が空）ときのコード */
export const PRIVATE_GROUP_NOT_FOUND_CODE = 'PRIVATE_GROUP_NOT_FOUND'
/**
 * 見る権限が無い・ログイン切れ・グループが無いと分かるコード。
 * - 42501: private_group_read_snapshot が閲覧不可のときに明示的に返す
 * - P0002: RPC が「見つからない」を明示的に返す（no_data_found）
 * - 22P02: グループIDの形が不正（何度読んでも同じ）
 * - PGRST301/302/303: ログインの鍵（JWT）が無効・期限切れ
 */
const ACCESS_LOST_CODES = new Set([PRIVATE_GROUP_NOT_FOUND_CODE, '42501', 'P0002', '22P02', 'PGRST301', 'PGRST302', 'PGRST303'])
/**
 * 読み込みの失敗が「権限が無い・ログイン切れ・グループが無い」と確定したものか。
 * それ以外（通信の切断・5xx・時間切れ・原因不明）は一時的な失敗として扱い、直前の内容を残して読み直す（Codex 点検 不具合 3）。
 *
 * HTTP 404 の扱い（Codex 第2回再レビュー R4）:
 * PostgREST の 404 は「RPC が見つからない」（PGRST202 = スキーマキャッシュに無い、42883 = 関数が無い）でも返る。
 * これは配備の途中やスキーマ再読み込み待ちで起きる API 構成の一時的なずれで、グループの不存在の証拠ではない。
 * そのため 404 という状態だけでは権限喪失とみなさない。404 のうち権限喪失として扱うのは、
 * RPC が明示的に「見つからない」を返した P0002 などのコード（上の一覧）が付いているときだけ。
 * 401・403 は状態だけで権限喪失（ログイン切れ・閲覧不可）とみなす。
 */
export function isPrivateGroupAccessLost(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, status } = error as { code?: unknown; status?: unknown }
  if (typeof code === 'string' && ACCESS_LOST_CODES.has(code)) return true
  return typeof status === 'number' && (status === 401 || status === 403)
}
export async function readPrivateGroup(input: { groupId?: string | null; inviteCode?: string | null; memberId?: string | null }): Promise<PrivateGroupSnapshot> {
  const { data, error, status } = await supabase.rpc('private_group_read_snapshot', {
    p_group_id: input.groupId || null, p_invite_code: input.inviteCode || null,
    p_member_id: input.memberId || null,
    p_guest_token: input.groupId ? getPrivateGroupGuestToken(input.groupId) : null,
  })
  // HTTP の状態（0 = 通信できなかった、5xx、401/403/404）で一時的な失敗かを見分けられるよう、エラーに付ける
  if (error) throw Object.assign(error, { status })
  if (!data?.group) throw Object.assign(new Error('グループを取得できませんでした'), { code: PRIVATE_GROUP_NOT_FOUND_CODE })
  const snapshot = data as PrivateGroupSnapshot
  return { ...snapshot, group: withoutWithdrawnCandidates(snapshot.group) }
}
export async function readPrivateGroupMessages(groupId: string, memberId?: string | null): Promise<PrivateGroupMessage[]> {
  const { data, error } = await supabase.rpc('private_group_read_messages', {
    p_group_id: groupId, p_member_id: memberId || null, p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) throw error
  return data || []
}

const byCreatedDesc = (a: PrivateGroup, b: PrivateGroup) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)

/**
 * onPage を渡すと、100 件ずつ届くたびにそこまでの分（作成日の新しい順）を渡す。
 * 全件そろうのを待たずに一覧を先に出すため（グループ一覧の初期待ち）。取得の順番・同時数は変えない。
 */
export async function readPrivateGroupList(scope: 'joined' | 'organized' | 'staff', organizationId: string | null = null, groupIds?: string[], onPage?: (loaded: PrivateGroup[]) => void): Promise<PrivateGroup[]> {
  // 指定IDが多いときは100件ずつに分けて同時に読む（#835）。続きの読み込みを順番に待たない。
  if (groupIds && groupIds.length > 100) {
    const pages = await fetchInChunks(groupIds, chunk => readPrivateGroupList(scope, organizationId, chunk))
    return pages.flat().sort(byCreatedDesc)
  }
  const groups: PrivateGroup[] = []
  let cursor: string | null = null
  while (true) {
    const { data, error } = await supabase.rpc('private_group_read_list', {
      p_scope: scope, p_organization_id: organizationId, p_after_id: cursor, p_limit: 100,
      ...(groupIds ? { p_group_ids: groupIds } : {}),
    })
    if (error) throw error
    const page = (data || []) as PrivateGroup[]
    groups.push(...page.map(withoutWithdrawnCandidates))
    // 指定IDの分を取り切ったら続きを取りに行かない（100件ちょうどのとき空の追加取得をしない、#837）
    const done = page.length < 100 || (groupIds && groups.length >= groupIds.length)
    if (onPage && !done) onPage([...groups].sort(byCreatedDesc))
    if (done) break
    const next = page[page.length - 1].id
    if (next === cursor) throw new Error('グループ一覧の続きを取得できませんでした')
    cursor = next
  }
  return groups.sort(byCreatedDesc)
}

/** 履歴ダイアログでは古い500件で打ち切らず全履歴を取得する。 */
export async function readPrivateGroupMessageHistory(groupId: string): Promise<PrivateGroupMessage[]> {
  const pages: PrivateGroupMessage[][] = []
  let before: PrivateGroupMessage | undefined
  while (true) {
    const { data, error } = await supabase.rpc('private_group_read_messages', {
      p_group_id: groupId, p_before_created_at: before?.created_at || null, p_before_id: before?.id || null, p_limit: 500,
    })
    if (error) throw error
    const page = (data || []) as PrivateGroupMessage[]
    pages.push(page)
    if (page.length < 500) break
    if (page[0].id === before?.id) throw new Error('通知履歴の続きを取得できませんでした')
    before = page[0]
  }
  return pages.reverse().flat()
}

export async function readPrivateGroupByReservation(reservationId: string): Promise<PrivateGroupSnapshot | null> {
  const { data, error } = await supabase.rpc('private_group_read_reservation', { p_reservation_id: reservationId })
  if (error) throw error
  if (!data) return null
  const snapshot = data as PrivateGroupSnapshot
  return { ...snapshot, group: withoutWithdrawnCandidates(snapshot.group) }
}

/** 貸切予約管理の一覧で使う、グループの必要な項目だけ（#835） */
export interface PrivateGroupStaffBookingSummary {
  id: string
  scenario_master_id: string | null
  invite_code: string | null
  joined_member_count: number
  candidate_dates: Array<{ group_id: string; date: string; time_slot: string; start_time: string | null; end_time: string | null; status: string | null }>
}
/** グループの全情報を組み立てずに、一覧に要る項目だけを 1,000 件ずつまとめて読む（本番 1,059 件で約 3.5 秒 → 約 0.05 秒） */
export async function readPrivateGroupStaffBookingSummaries(organizationId: string, groupIds: string[]): Promise<PrivateGroupStaffBookingSummary[]> {
  const chunks: string[][] = []
  for (let i = 0; i < groupIds.length; i += 1000) chunks.push(groupIds.slice(i, i + 1000))
  const pages = await Promise.all(chunks.map(async chunk => {
    const { data, error } = await supabase.rpc('private_group_read_staff_booking_summaries', { p_organization_id: organizationId, p_group_ids: chunk })
    if (error) throw error
    return (data || []) as PrivateGroupStaffBookingSummary[]
  }))
  return pages.flat()
}

export interface PrivateGroupSurveyResponse {
  member_id: string
  responses: Record<string, string | string[]>
  submitted_at: string
}
export async function readPrivateGroupSurveyResponses(groupId: string): Promise<PrivateGroupSurveyResponse[]> {
  const { data, error } = await supabase.rpc('private_group_read_survey_responses', { p_group_id: groupId })
  if (error) throw error
  return data || []
}
