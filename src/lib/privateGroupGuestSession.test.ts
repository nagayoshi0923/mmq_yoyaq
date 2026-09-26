// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: true, error: null }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
import { privateGroupMemberAction, savePrivateGroupGuestToken, getPrivateGroupGuestToken, clearPrivateGroupGuestToken } from './privateGroupGuestSession'

describe('private group guest credentials', () => {
  beforeEach(() => { sessionStorage.clear(); rpc.mockClear() })
  it('binds credentials to a group and passes them on every member action', async () => {
    savePrivateGroupGuestToken('group-a', 'secret-a')
    savePrivateGroupGuestToken('group-b', 'secret-b')
    await privateGroupMemberAction('group-a', 'member-a', 'message', { message: 'hello' })
    expect(rpc).toHaveBeenCalledWith('private_group_member_action', {
      p_group_id: 'group-a', p_member_id: 'member-a', p_action: 'message', p_payload: { message: 'hello' }, p_guest_token: 'secret-a',
    })
    expect(getPrivateGroupGuestToken('group-b')).toBe('secret-b')
  })
  it('never treats a legacy UUID-only session as a credential', async () => {
    sessionStorage.setItem('guest_session_invite', JSON.stringify({ memberId: 'member-a' }))
    await privateGroupMemberAction('group-a', 'member-a', 'survey_read')
    expect(rpc.mock.calls[0][1].p_guest_token).toBeNull()
  })
  it('clears expired credentials and notifies the page to restore the PIN form', async () => {
    savePrivateGroupGuestToken('group-a', 'expired-token')
    const expired = vi.fn()
    window.addEventListener('private-group-auth-expired', expired)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: '本人確認が必要です。メールアドレスとPINで入り直してください' } })
    await privateGroupMemberAction('group-a', 'member-a', 'message', { message: 'hello' })
    expect(getPrivateGroupGuestToken('group-a')).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    expect((expired.mock.calls[0][0] as CustomEvent).detail.groupId).toBe('group-a')
    window.removeEventListener('private-group-auth-expired', expired)
  })
  it('clears only the group being left', () => {
    savePrivateGroupGuestToken('group-a', 'secret-a')
    savePrivateGroupGuestToken('group-b', 'secret-b')
    clearPrivateGroupGuestToken('group-a')
    expect(getPrivateGroupGuestToken('group-a')).toBeNull()
    expect(getPrivateGroupGuestToken('group-b')).toBe('secret-b')
  })
})
