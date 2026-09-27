import { supabase } from '@/lib/supabase'
import type { PrivateGroupInvitation } from '@/types'

export interface PrivateGroupInvitee { id: string; email: string; display_name: string | null }
export async function readPrivateGroupInvitations(groupId: string): Promise<PrivateGroupInvitation[]> {
  const rows: PrivateGroupInvitation[] = []
  let after: string | null = null
  while (true) {
    const { data, error } = await supabase.rpc('private_group_read_invitations', { p_group_id: groupId, p_after_id: after, p_limit: 100 })
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('招待履歴を確認できませんでした')
    const page = data as PrivateGroupInvitation[]
    rows.push(...page)
    if (page.length < 100) break
    const next = page.at(-1)?.id
    if (!next || next === after) throw new Error('招待履歴の続きを確認できませんでした')
    after = next
  }
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}
export async function searchPrivateGroupInvitee(groupId: string, email: string): Promise<PrivateGroupInvitee | null> {
  const { data, error } = await supabase.rpc('private_group_search_invitee', { p_group_id: groupId, p_email: email })
  if (error) throw new Error(error.message)
  if (data && (!data.id || !data.email)) throw new Error('招待先を確認できませんでした')
  return data
}
export async function managePrivateGroupInvitation(groupId: string, action: 'create' | 'cancel', targetId: string, email?: string): Promise<void> {
  const { data, error } = await supabase.rpc('private_group_manage_invitation', {
    p_group_id: groupId, p_action: action,
    ...(action === 'create' ? { p_target_user_id: targetId, p_email: email } : { p_invitation_id: targetId }),
  })
  if (error) throw new Error(error.message)
  if (!data?.id || data.status !== (action === 'create' ? 'pending' : 'cancelled')) throw new Error('招待の保存結果を確認できませんでした')
}
