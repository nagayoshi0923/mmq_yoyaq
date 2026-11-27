// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcut } from './useKeyboardShortcut'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(key: string, handler: () => void, options?: Parameters<typeof useKeyboardShortcut>[2]) {
  function Probe() {
    useKeyboardShortcut(key, handler, options)
    return null
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(<Probe />) })
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('useKeyboardShortcut', () => {
  it('document 自体へ送られた keydown（画面上部の検索ボタン）でも落ちない', () => {
    const handler = vi.fn()
    mount('k', handler, { metaKey: true })
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault() }
    window.addEventListener('error', onError)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('入力欄の中の keydown は無視する', () => {
    const handler = vi.fn()
    mount('n', handler)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    input.remove()
  })
})
