// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateGroupSnapshot } from './usePrivateGroupSnapshot'
import { readPrivateGroup, type PrivateGroupSnapshot } from '@/lib/privateGroupRead'
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroup: vi.fn() }))
const snapshot = (id: string, access: 'preview' | 'member' = 'preview') => ({
  group: { id, members: access === 'preview' ? [] : [{ id: 'guest', date_responses: [{ candidate_date_id: 'date', response: 'available' }] }] },
  access_level: access, current_member_id: access === 'preview' ? null : 'guest',
  linked_reservation_status: null, confirmed_by_name: null,
}) as unknown as PrivateGroupSnapshot
let root: Root
let result: ReturnType<typeof usePrivateGroupSnapshot>
function Harness({ invite, member }: { invite: string; member: string | null }) { result = usePrivateGroupSnapshot(null, invite, member); return null }
const render = async (invite = 'invite-a', member: string | null = null) => { await act(async () => root.render(<Harness invite={invite} member={member} />)) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks(); vi.useFakeTimers(); auth.user = null
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })
describe('貸切スナップショットの認証切替', () => {
  it('招待プレビュー後のゲスト認証では判明済みgroupIdを使い、既存回答を取得する', async () => {
    vi.mocked(readPrivateGroup).mockResolvedValueOnce(snapshot('a')).mockResolvedValueOnce(snapshot('a', 'member'))
    await render()
    expect(result.group?.members).toEqual([])
    await render('invite-a', 'guest')
    expect(readPrivateGroup).toHaveBeenLastCalledWith({ groupId: 'a', inviteCode: 'invite-a', memberId: 'guest' })
    expect(result.group?.members?.[0].date_responses).toHaveLength(1)
    expect(result.accessLevel).toBe('member')
  })
  it('別の招待へ切り替えると前のgroupIdを持ち越さない', async () => {
    vi.mocked(readPrivateGroup).mockResolvedValueOnce(snapshot('a')).mockResolvedValueOnce(snapshot('b'))
    await render()
    await render('invite-b')
    expect(readPrivateGroup).toHaveBeenLastCalledWith({ groupId: null, inviteCode: 'invite-b', memberId: null })
    expect(result.group?.id).toBe('b')
  })
  it('古いグループの応答が後から来ても表示しない', async () => {
    let resolve!: (value: PrivateGroupSnapshot) => void
    vi.mocked(readPrivateGroup).mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce(snapshot('b'))
    await render()
    await render('invite-b')
    await act(async () => resolve(snapshot('a', 'member')))
    expect(result.group?.id).toBe('b')
    expect(result.accessLevel).toBe('preview')
  })
  it('ログアウト後は再認証結果に従って会員情報を破棄する', async () => {
    auth.user = { id: 'user' }
    vi.mocked(readPrivateGroup).mockResolvedValueOnce(snapshot('a', 'member')).mockResolvedValueOnce(snapshot('a'))
    await render()
    auth.user = null
    await render()
    expect(readPrivateGroup).toHaveBeenCalledTimes(2)
    expect(result.group?.members).toEqual([])
    expect(result.accessLevel).toBe('preview')
  })
  it('定期取得の権限エラーは古い内容を消し、再取得で回復する', async () => {
    vi.mocked(readPrivateGroup).mockResolvedValueOnce(snapshot('a', 'member')).mockRejectedValueOnce(new Error('expired')).mockResolvedValueOnce(snapshot('a', 'member'))
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(result.group).toBe(null)
    expect(result.error).toBe('expired')
    await act(async () => { await result.refetch() })
    expect(result.accessLevel).toBe('member')
    expect(result.error).toBe(null)
  })
  it('遅い初回取得を定期取得が追い越さない', async () => {
    let resolve!: (value: PrivateGroupSnapshot) => void
    vi.mocked(readPrivateGroup).mockReturnValueOnce(new Promise(r => { resolve = r }))
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
    expect(readPrivateGroup).toHaveBeenCalledTimes(1)
    await act(async () => resolve(snapshot('a')))
    expect(result.group?.id).toBe('a')
    expect(result.loading).toBe(false)
  })
})
