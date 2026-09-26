import { supabase } from '@/lib/supabase'

const key = (groupId: string) => `private_group_access_${groupId}`

export function savePrivateGroupGuestToken(groupId: string, token: string) {
  sessionStorage.setItem(key(groupId), token)
}

export function clearPrivateGroupGuestToken(groupId: string) {
  sessionStorage.removeItem(key(groupId))
}

export function getPrivateGroupGuestToken(groupId: string): string | null {
  return sessionStorage.getItem(key(groupId))
}

/** Every guest write is checked on the server; a saved member UUID is not authentication. */
export async function privateGroupMemberAction(
  groupId: string,
  memberId: string,
  action: 'validate' | 'date_responses' | 'message' | 'survey_read' | 'survey_write' | 'character_preference' | 'leave',
  payload: unknown = {},
) {
  const result = await supabase.rpc('private_group_member_action', {
    p_group_id: groupId,
    p_member_id: memberId,
    p_action: action,
    p_payload: payload,
    p_guest_token: getPrivateGroupGuestToken(groupId),
  })
  if (result.error?.code === '42501' && /本人確認が必要|参加情報が見つかりません/.test(result.error.message)) {
    clearPrivateGroupGuestToken(groupId)
    window.dispatchEvent(new CustomEvent('private-group-auth-expired', { detail: { groupId } }))
  }
  return result
}
