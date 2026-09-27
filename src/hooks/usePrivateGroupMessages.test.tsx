// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateGroupMessages } from './usePrivateGroupMessages'
import { readPrivateGroupMessages } from '@/lib/privateGroupRead'
import type { PrivateGroupMessage } from '@/types'
const auth = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupMessages: vi.fn() }))
let root: Root
let result: ReturnType<typeof usePrivateGroupMessages>
const row = (id: string) => ({ id, group_id: id, message: id, member_id: null, created_at: '2026-09-27T00:00:00Z' }) as PrivateGroupMessage
function Harness({ group, member }: { group: string; member: string | null }) { result = usePrivateGroupMessages(group, member); return null }
const render = async (group = 'a', member: string | null = 'member-a') => { await act(async () => root.render(<Harness group={group} member={member} />)) }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  vi.useFakeTimers()
  auth.user = { id: 'user-a' }
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })
describe('貸切チャットの認証付き取得', () => {
  it('別グループへ移動した後に到着した古い応答を表示しない', async () => {
    let resolve!: (rows: PrivateGroupMessage[]) => void
    vi.mocked(readPrivateGroupMessages).mockReturnValueOnce(new Promise(r => { resolve = r })).mockResolvedValueOnce([row('b')])
    await render()
    await render('b')
    await act(async () => resolve([row('a')]))
    expect(result.messages.map(r => r.id)).toEqual(['b'])
  })
  it('ログアウトと期限切れ時に既存のメッセージを消す', async () => {
    vi.mocked(readPrivateGroupMessages).mockResolvedValueOnce([row('a')]).mockRejectedValueOnce(new Error('42501'))
    await render()
    expect(result.messages).toHaveLength(1)
    auth.user = null
    await render()
    expect(result.messages).toEqual([])
    expect(result.error).toBe(true)
  })
  it('ゲスト参加者が変わると認証をやり直し、再取得で回復できる', async () => {
    auth.user = null
    vi.mocked(readPrivateGroupMessages).mockRejectedValueOnce(new Error('42501')).mockResolvedValueOnce([row('guest')])
    await render('a', null)
    expect(result.error).toBe(true)
    await render('a', 'guest-member')
    expect(readPrivateGroupMessages).toHaveBeenLastCalledWith('a', 'guest-member')
    expect(result.error).toBe(false)
    expect(result.messages).toHaveLength(1)
  })
  it('定期取得も認可を確認し、失効した表示を破棄する', async () => {
    vi.mocked(readPrivateGroupMessages).mockResolvedValueOnce([row('a')]).mockRejectedValueOnce(new Error('expired'))
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(readPrivateGroupMessages).toHaveBeenCalledTimes(2)
    expect(result.messages).toEqual([])
    expect(result.error).toBe(true)
  })
  it('通信が遅い場合も定期取得を重ねず、到着した応答を表示する', async () => {
    let resolve!: (rows: PrivateGroupMessage[]) => void
    vi.mocked(readPrivateGroupMessages).mockReturnValue(new Promise(r => { resolve = r }))
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(readPrivateGroupMessages).toHaveBeenCalledTimes(1)
    await act(async () => resolve([row('slow')]))
    expect(result.messages[0].id).toBe('slow')
    expect(result.loading).toBe(false)
  })
  it('内容が同じ定期取得ではメッセージ配列を維持し、スクロールを誘発しない', async () => {
    vi.mocked(readPrivateGroupMessages).mockImplementation(async () => [row('a')])
    await render()
    const first = result.messages
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(result.messages).toBe(first)
  })
})
