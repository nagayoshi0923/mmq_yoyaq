import { supabase } from '@/lib/supabase'

/**
 * ゲストの本人確認の印と参加情報の保存先。
 * 以前はタブを閉じると消える保存（sessionStorage）だったため、LINE やメールのリンクから開き直すたびに
 * PIN の入力が必要になり、3 日で 7 回入り直したゲストもいた（2026-10-05）。サーバー側の有効期限（30 日）に合わせ、
 * 端末に残す保存（localStorage）にする。使えない端末（プライベートブラウズ等）ではタブ内の保存に切り替える。
 */
function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}
export const guestStorage = {
  getItem(key: string): string | null {
    const value = safe(() => localStorage.getItem(key), null)
    if (value !== null) return value
    // 以前のタブ内の保存に残っている分は、端末の保存へ移す
    const legacy = safe(() => sessionStorage.getItem(key), null)
    if (legacy !== null && safe(() => { localStorage.setItem(key, legacy); return true }, false)) safe(() => sessionStorage.removeItem(key), undefined)
    return legacy
  },
  setItem(key: string, value: string) {
    if (!safe(() => { localStorage.setItem(key, value); return true }, false)) safe(() => sessionStorage.setItem(key, value), undefined)
  },
  removeItem(key: string) {
    safe(() => localStorage.removeItem(key), undefined)
    safe(() => sessionStorage.removeItem(key), undefined)
  },
}

const key = (groupId: string) => `private_group_access_${groupId}`

export function savePrivateGroupGuestToken(groupId: string, token: string) {
  guestStorage.setItem(key(groupId), token)
}

export function clearPrivateGroupGuestToken(groupId: string) {
  guestStorage.removeItem(key(groupId))
}

export function getPrivateGroupGuestToken(groupId: string): string | null {
  return guestStorage.getItem(key(groupId))
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
