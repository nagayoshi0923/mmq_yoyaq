// @vitest-environment jsdom
// 写真はグループ全体で上限あり（2026-10-20 社長決定。既定 10 枚）。写真を選ぶボタンの横の「あと N 枚」、上限での無効化、文言
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatComposer } from './ChatComposer'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

let root: Root
let container: HTMLDivElement
const render = async (props: Partial<ComponentProps<typeof ChatComposer>> = {}) => {
  await act(async () => root.render(
    <ChatComposer disabled={false} blockMessage={null} replyQuote={null} onCancelReply={vi.fn()} onSend={vi.fn(async () => true)} onTyping={vi.fn()} {...props} />,
  ))
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const text = (testId: string) => container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null
const pickPhotos = async (count: number) => {
  const input = container.querySelector<HTMLInputElement>('[data-testid="chat-photo-input"]')!
  const files = Array.from({ length: count }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }))
  Object.defineProperty(input, 'files', { configurable: true, value: Object.assign(files, { item: (i: number) => files[i] }) })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  toastError.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('チャットの写真の残り枚数（グループ全体の上限）', () => {
  it('写真を選ぶボタンの横に「あと N 枚」を出し、選んだ分だけ減る', async () => {
    await render({ photoQuota: { limit: 10, remaining: 4 } })
    expect(text('chat-photo-remaining')).toBe('あと 4 枚')
    expect(button('写真を選ぶ').disabled).toBe(false)
    await pickPhotos(1)
    expect(text('chat-photo-remaining')).toBe('あと 3 枚')
  })

  it('残りより多く選んだら残りの数までにし、文言を出す。残りを選び切ったら選べない', async () => {
    await render({ photoQuota: { limit: 10, remaining: 3 } })
    await pickPhotos(5)
    expect(toastError).toHaveBeenCalledWith('このグループの写真は 10 枚までです。残り 3 枚です')
    expect(container.querySelectorAll('[data-testid="chat-photo-previews"] img')).toHaveLength(3)
    expect(text('chat-photo-remaining')).toBe('あと 0 枚')
    expect(button('写真を選ぶ').disabled).toBe(true)
    expect(button('カメラで撮る').disabled).toBe(true)
  })

  it('上限に達していたら写真は選べず、理由を出す（文字は送れる）', async () => {
    await render({ photoQuota: { limit: 10, remaining: 0 } })
    expect(button('写真を選ぶ').disabled).toBe(true)
    expect(button('カメラで撮る').disabled).toBe(true)
    expect(text('chat-photo-limit')).toBe('このグループの写真は 10 枚までです。上限に達したため、これ以上は送れません')
    expect(button('写真を選ぶ').title).toBe('このグループの写真は 10 枚までです。上限に達したため、これ以上は送れません')
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')!.disabled).toBe(false)
  })

  it('組織で上限を変えていればその枚数で書く', async () => {
    await render({ photoQuota: { limit: 20, remaining: 0 } })
    expect(text('chat-photo-limit')).toBe('このグループの写真は 20 枚までです。上限に達したため、これ以上は送れません')
  })

  it('1 回 10 枚の制限はそのまま（残りが多くても 10 枚まで）', async () => {
    await render({ photoQuota: { limit: 50, remaining: 30 } })
    await pickPhotos(12)
    expect(toastError).toHaveBeenCalledWith('写真は1回10枚までです')
    expect(container.querySelectorAll('[data-testid="chat-photo-previews"] img')).toHaveLength(10)
    expect(text('chat-photo-remaining')).toBe('あと 20 枚')
  })

  it('残り枚数が読めていなければ「あと N 枚」は出さず、1 回 10 枚で選べる', async () => {
    await render({ photoQuota: null })
    expect(text('chat-photo-remaining')).toBeNull()
    expect(text('chat-photo-limit')).toBeNull()
    expect(button('写真を選ぶ').disabled).toBe(false)
  })
})
