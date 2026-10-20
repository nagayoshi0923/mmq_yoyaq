// @vitest-environment jsdom
// 「申込を取り下げる」のダイアログ: 既定はグループを残す。選んだ方で確定ボタンの文言と渡す値が変わる（2026-10-20 社長決定）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WithdrawRequestDialog } from './WithdrawRequestDialog'

let root: Root
let host: HTMLDivElement
const confirm = vi.fn(async () => undefined)
const openChange = vi.fn()
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)
const radio = (value: string) => document.querySelector<HTMLButtonElement>(`[role="radio"][value="${value}"]`)!
const render = (props: { hasGroup?: boolean; otherMembers?: number } = {}) => act(async () => root.render(
  <WithdrawRequestDialog open onOpenChange={openChange} onConfirm={confirm} hasGroup={props.hasGroup ?? true} otherMembers={props.otherMembers ?? 2} />,
))
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.clearAllMocks()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('見出し・説明・2 つの選択肢を出し、既定は「申込だけ取り下げる」', async () => {
  await render()
  const text = document.body.textContent ?? ''
  expect(text).toContain('申込を取り下げますか')
  expect(text).toContain('店舗への申込を取り下げます。キャンセル料はかかりません。')
  expect(text).toContain('申込だけ取り下げる')
  expect(text).toContain('候補日を直して、もう一度申し込めます')
  expect(text).toContain('グループも閉じる')
  expect(text).toContain('メンバー 2 名に知らせます')
  expect(radio('keep_group').getAttribute('aria-checked')).toBe('true')
  expect(button('やめる')).toBeDefined()
  await act(async () => button('申込を取り下げる')!.click())
  expect(confirm).toHaveBeenCalledExactlyOnceWith('keep_group')
})

it('「グループも閉じる」を選ぶと確定ボタンが変わり、close_group を渡す', async () => {
  await render()
  await act(async () => radio('close_group').click())
  expect(radio('close_group').getAttribute('aria-checked')).toBe('true')
  await act(async () => button('取り下げてグループを閉じる')!.click())
  expect(confirm).toHaveBeenCalledExactlyOnceWith('close_group')
})

it('「やめる」では取り下げない', async () => {
  await render()
  await act(async () => button('やめる')!.click())
  expect(confirm).not.toHaveBeenCalled()
  expect(openChange).toHaveBeenCalledWith(false)
})

it('グループの無い旧い貸切予約は選択肢を出さず、取り下げるだけ', async () => {
  await render({ hasGroup: false, otherMembers: 0 })
  expect(document.querySelector('[role="radio"]')).toBeNull()
  await act(async () => button('申込を取り下げる')!.click())
  expect(confirm).toHaveBeenCalledExactlyOnceWith('close_group')
})
