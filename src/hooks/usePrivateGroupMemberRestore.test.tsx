// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateGroupMemberRestore } from './usePrivateGroupMemberRestore'
import type { PrivateGroup } from '@/types'
let root: Root
let draft: string
let edit: (value: string) => void
const restored = vi.fn()
const group = (id = 'a', member = 'guest') => ({ id, invite_code: id, members: [{ id: member, user_id: null, status: 'joined', guest_name: 'saved' }] }) as unknown as PrivateGroup
function Harness({ value, invite = 'a', member = 'guest' }: { value: PrivateGroup | null; invite?: string; member?: string | null }) {
  const [text, setText] = useState('')
  draft = text; edit = setText
  usePrivateGroupMemberRestore(value, invite, undefined, member, m => { restored(m.id); setText(m.guest_name || '') })
  return null
}
const render = async (value: PrivateGroup | null, invite = 'a', member: string | null = 'guest') => {
  await act(async () => root.render(<Harness value={value} invite={invite} member={member} />))
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); restored.mockReset(); root = createRoot(document.createElement('div')) })
afterEach(async () => { await act(async () => root.unmount()) })
describe('招待画面の回答復元', () => {
  it('他の参加者の更新でsnapshotが変わっても未保存入力を保持する', async () => {
    await render(group())
    await act(async () => edit('unsaved'))
    await render({ ...group(), name: 'other member changed the group' })
    expect(draft).toBe('unsaved')
    expect(restored).toHaveBeenCalledTimes(1)
  })
  it('プレビューでは復元せず、ゲスト認証後に一度だけ復元する', async () => {
    await render({ ...group(), members: [] }, 'a', null)
    expect(restored).not.toHaveBeenCalled()
    await render(group())
    expect(draft).toBe('saved')
    expect(restored).toHaveBeenCalledTimes(1)
  })
  it('再取得中の一時的なnullではフォームを再初期化しない', async () => {
    await render(group())
    await act(async () => edit('unsaved'))
    await render(null)
    await render(group())
    expect(draft).toBe('unsaved')
  })
  it('別の招待または本人へ切り替わった場合は新しい内容を復元する', async () => {
    await render(group())
    await render(group(), 'b')
    expect(restored).toHaveBeenCalledTimes(1)
    await render(group('b'), 'b')
    await render(group('b', 'another'), 'b', 'another')
    expect(restored).toHaveBeenCalledTimes(3)
    expect(restored).toHaveBeenLastCalledWith('another')
  })
})
