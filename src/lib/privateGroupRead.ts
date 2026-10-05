import { fetchInChunks } from '@/lib/fetchInChunks'
import { supabase } from '@/lib/supabase'
import { getPrivateGroupGuestToken } from '@/lib/privateGroupGuestSession'
import type { PrivateGroup, PrivateGroupMessage } from '@/types'
export interface PrivateGroupSnapshot {
  group: PrivateGroup
  access_level: 'preview' | 'member' | 'organizer' | 'staff'
  current_member_id: string | null
  linked_reservation_status: string | null
  confirmed_by_name: string | null
}
export async function readPrivateGroup(input: { groupId?: string | null; inviteCode?: string | null; memberId?: string | null }): Promise<PrivateGroupSnapshot> {
  const { data, error } = await supabase.rpc('private_group_read_snapshot', {
    p_group_id: input.groupId || null, p_invite_code: input.inviteCode || null,
    p_member_id: input.memberId || null,
    p_guest_token: input.groupId ? getPrivateGroupGuestToken(input.groupId) : null,
  })
  if (error) throw error
  if (!data?.group) throw new Error('グループを取得できませんでした')
  return data as PrivateGroupSnapshot
}
export async function readPrivateGroupMessages(groupId: string, memberId?: string | null): Promise<PrivateGroupMessage[]> {
  const { data, error } = await supabase.rpc('private_group_read_messages', {
    p_group_id: groupId, p_member_id: memberId || null, p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (error) throw error
  return data || []
}

export async function readPrivateGroupList(scope: 'joined' | 'organized' | 'staff', organizationId: string | null = null, groupIds?: string[]): Promise<PrivateGroup[]> {
  // 指定IDが多いときは100件ずつに分けて同時に読む（#835）。続きの読み込みを順番に待たない。
  if (groupIds && groupIds.length > 100) {
    const pages = await fetchInChunks(groupIds, chunk => readPrivateGroupList(scope, organizationId, chunk))
    return pages.flat().sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
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
    groups.push(...page)
    // 指定IDの分を取り切ったら続きを取りに行かない（100件ちょうどのとき空の追加取得をしない、#837）
    if (page.length < 100 || (groupIds && groups.length >= groupIds.length)) break
    const next = page[page.length - 1].id
    if (next === cursor) throw new Error('グループ一覧の続きを取得できませんでした')
    cursor = next
  }
  return groups.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
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
  return data as PrivateGroupSnapshot | null
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
